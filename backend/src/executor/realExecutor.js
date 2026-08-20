import { spawn as nodeSpawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractImageRef } from '../parsers/imageRef.js'
import { extractRouterUrl } from '../parsers/routerUrl.js'
import { parseCfApps, externalRouterUrl } from '../parsers/cfApps.js'

// Default: write the policy YAML to a temp file and return its path. The UI
// sends policy *content*, but sandboxify.sh --policy expects a *file path*.
function defaultWritePolicyFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-deployer-'))
  const path = join(dir, 'policy.yaml')
  writeFileSync(path, content)
  return path
}

// Default: write KEY=VALUE env vars to a temp .env file for --extra-env-file.
function defaultWriteEnvFile(envVars) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-deployer-env-'))
  const path = join(dir, 'extra.env')
  const body = envVars.map(({ key, value }) => `${key}=${value}`).join('\n') + '\n'
  writeFileSync(path, body)
  return path
}

// Default: write credential KEY=VALUE pairs to a temp file for sandboxify's
// --provider-env (secrets hidden from the process list / injected as
// placeholders in the sandboxed image).
function defaultWriteProviderEnvFile(credentials) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-deployer-creds-'))
  const path = join(dir, 'provider.env')
  const body = credentials.map(({ key, value }) => `${key}=${value}`).join('\n') + '\n'
  writeFileSync(path, body)
  return path
}

// Spawns the real scripts / cf. `spawn`, `scripts`, `env`, `a2aClient`,
// `writePolicyFile`, `writeEnvFile`, and `writeProviderEnvFile` are injectable
// so the executor is unit-testable without a real toolchain or filesystem.
export function createRealExecutor({ spawn = nodeSpawn, scripts, env = {}, a2aClient, writePolicyFile = defaultWritePolicyFile, writeEnvFile = defaultWriteEnvFile, writeProviderEnvFile = defaultWriteProviderEnvFile } = {}) {
  const run = (cmd, args, onLine) =>
    new Promise((resolve) => {
      let child
      let log = ''
      let pending = ''
      let spawnError = null
      const emit = (line) => { log += line + '\n'; onLine(line) }
      const feed = (chunk) => {
        pending += chunk.toString()
        const parts = pending.split(/\r?\n/)
        pending = parts.pop()
        for (const line of parts) emit(line)
      }
      try {
        child = spawn(cmd, args, { env: { ...process.env, ...env } })
      } catch (err) {
        // Synchronous spawn failure (rare): surface it and stop.
        emit(`ERROR: failed to launch ${cmd}: ${err.message}`)
        resolve({ code: 1, log })
        return
      }
      child.stdout.on('data', feed)
      child.stderr.on('data', feed)
      // Async spawn failure (ENOENT: missing binary/script, EACCES: not
      // executable). Without this handler the 'error' event would throw.
      child.on('error', (err) => {
        spawnError = err
        emit(`ERROR: failed to launch ${cmd}: ${err.message}`)
      })
      child.on('close', (code) => {
        if (pending) emit(pending)
        // A spawn error reports code -2; normalize to a non-zero failure.
        const exit = spawnError ? (code || 1) : (code ?? 0)
        resolve({ code: exit, log })
      })
    })

  return {
    async sandboxify(opts, onLine) {
      // The UI sends policy content; sandboxify.sh needs a file path.
      const policyPath = writePolicyFile(opts.policy)
      const args = [
        '--image', opts.image,
        '--policy', policyPath,
        '--app-name', opts.appName,
        '--no-deploy',
      ]
      // Credentials (secrets to hide) go to --provider-env. The UI sends
      // KEY=VALUE pairs; the script wants a file path, so write them out.
      const providerEnv = opts.providerEnv
        || (opts.credentials && opts.credentials.length ? writeProviderEnvFile(opts.credentials) : null)
      if (providerEnv) args.push('--provider-env', providerEnv)
      const { code, log } = await run(scripts.sandboxify, args, onLine)
      return { code, imageRef: extractImageRef(log), log }
    },

    async deploy(opts, onLine) {
      // CF's Diego cell must pull the (private) sandboxified image at staging,
      // so it needs registry creds. Prefer explicit opts, fall back to the
      // configured REGISTRY_USER/REGISTRY_PASS carried in env.
      const dockerUsername = opts.dockerUsername || env.REGISTRY_USER
      const dockerPassword = opts.dockerPassword || env.REGISTRY_PASS
      const args = [
        '--org', opts.org,
        '--space', opts.space,
        '--app-name', opts.appName,
        '--docker-image', opts.dockerImage,
      ]
      if (dockerUsername) args.push('--docker-username', dockerUsername)
      if (dockerPassword) args.push('--docker-password', dockerPassword)
      // Env vars for --extra-env-file: the UI sends KEY=VALUE pairs; the script
      // wants a file path, so write them out first.
      const extraEnvFile = opts.extraEnvFile
        || (opts.envVars && opts.envVars.length ? writeEnvFile(opts.envVars) : null)
      if (extraEnvFile) args.push('--extra-env-file', extraEnvFile)
      const { code, log } = await run(scripts.deploy, args, onLine)
      return { code, routerUrl: extractRouterUrl(log), log }
    },

    async a2a(opts) {
      return a2aClient.sendMessage(opts)
    },

    async undeploy(opts, onLine) {
      const args = ['--org', opts.org, '--space', opts.space, '--app-name', opts.appName]
      const { code, log } = await run(scripts.undeploy, args, onLine)
      return { code, log }
    },

    // Delete the router's tenant clones for this bundle. The router names them
    // `<appName>-tenant-<hash>` but does NOT stamp a `bundle` label, so the
    // undeploy script's label selector misses them — we match by name prefix
    // here and delete each with its route (-r).
    async deleteClones(opts, onLine = () => {}) {
      const rows = await this.cfApps({ org: opts.org, space: opts.space })
      const prefix = `${opts.appName}-tenant-`
      const clones = rows.filter((r) => r.name.startsWith(prefix))
      for (const c of clones) {
        onLine(`deleting tenant clone: ${c.name}`)
        await run('cf', ['delete', c.name, '-f', '-r'], onLine)
      }
      if (clones.length === 0) onLine('no tenant clones to delete')
      return { count: clones.length }
    },

    async cfApps(opts = {}) {
      // `cf apps` operates on the targeted space, so target the deployment's
      // org/space first — otherwise it reflects whatever the CLI last targeted.
      if (opts.org && opts.space) {
        await run('cf', ['target', '-o', opts.org, '-s', opts.space], () => {})
      }
      const { log } = await run('cf', ['apps'], () => {})
      return parseCfApps(log)
    },

    // Resolve the router URL robustly from `cf apps` (the deploy script's own
    // `router URL:` line is unreliable on some CF CLI versions).
    async resolveRouterUrl(appName, opts = {}) {
      if (opts.org && opts.space) {
        await run('cf', ['target', '-o', opts.org, '-s', opts.space], () => {})
      }
      const { log } = await run('cf', ['apps'], () => {})
      return externalRouterUrl(log, appName)
    },

    // The router selects its template by label (role=template) within the
    // space and refuses to start if it finds more than one. So a space can hold
    // only one deployment. Returns true if a *-app-template already exists.
    async hasExistingTemplate(opts = {}) {
      const rows = await this.cfApps(opts)
      return rows.some(r => r.name.endsWith('-app-template'))
    },
  }
}
