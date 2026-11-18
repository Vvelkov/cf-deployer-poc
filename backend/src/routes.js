import { createConfigStore } from './config/configStore.js'
import { createDeploymentStore } from './deployments/deploymentStore.js'
import { runPipeline, runUndeploy } from './deployments/pipeline.js'
import { createMockExecutor } from './executor/mockExecutor.js'
import { createRealExecutor } from './executor/realExecutor.js'
import * as a2aClient from './a2a/a2aClient.js'
import { startCfStatusStream } from './cfstatus/cfStatus.js'
import { toMaskedList, parseEnvFile } from './parsers/credentials.js'
import { DEFAULT_POLICY_YAML } from './defaults/defaultPolicy.js'

const SCRIPTS = {
  sandboxify: process.env.SANDBOXIFY_PATH || './scripts/sandboxify.sh',
  deploy: process.env.DEPLOY_PATH || './scripts/deploy.sh',
  undeploy: process.env.UNDEPLOY_PATH || './scripts/undeploy.sh',
}

function sanitizeConfig(cfg) {
  const { cfPassword, dockerPassword, jwtSecret, ...safe } = cfg
  return safe
}

function sseInit(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function registerRoutes(app, deps = {}) {
  const configStore = deps.configStore || createConfigStore()
  const deploymentStore = deps.deploymentStore || createDeploymentStore()
  const makeExecutor = deps.makeExecutor || ((mode) => {
    if (mode === 'real') {
      return createRealExecutor({ scripts: SCRIPTS, env: configStore.toEnv(), a2aClient })
    }
    return createMockExecutor()
  })
  // One executor instance per deployment id, so CF status + A2A share state.
  const executors = deps.executors || new Map()
  // The most recently created deployment's executor, used as the CF-status
  // default so the status grid reflects the same instance A2A mutates.
  let lastExecutor = null
  let lastDeploymentId = null

  app.get('/api/config', (_req, res) => res.json(sanitizeConfig(configStore.get())))
  app.put('/api/config', (req, res) => {
    configStore.set(req.body || {})
    res.json(sanitizeConfig(configStore.get()))
  })

  app.get('/api/default-policy', (_req, res) => res.json({ policy: DEFAULT_POLICY_YAML }))

  app.post('/api/credentials/parse', (req, res) => {
    res.json({ credentials: toMaskedList(req.body?.text || '') })
  })

  // Plain env vars (KEY=VALUE) for the deploy script's --extra-env-file. Unlike
  // credentials, values are returned in full (not masked).
  app.post('/api/env/parse', (req, res) => {
    res.json({ env: parseEnvFile(req.body?.text || '') })
  })

  app.get('/api/deployments', (_req, res) => res.json(deploymentStore.list()))
  app.get('/api/deployments/:id', (req, res) => {
    const d = deploymentStore.get(req.params.id)
    if (!d) return res.status(404).json({ error: 'not found' })
    res.json(d)
  })

  app.post('/api/deployments', async (req, res) => {
    const { mode = 'mock', ...input } = req.body || {}
    const executor = makeExecutor(mode)
    // The router only supports one template (deployment) per space — it selects
    // the template by label and refuses to start if it finds more than one. So
    // reject a second deployment into a space that already has one.
    if (input.org && input.space && executor.hasExistingTemplate) {
      let occupied = false
      try {
        occupied = await executor.hasExistingTemplate({ org: input.org, space: input.space })
      } catch { occupied = false } // if the check fails, don't block the deploy
      if (occupied) {
        return res.status(409).json({
          error: `Space ${input.org}/${input.space} already has a deployment. The router supports one deployment per space — delete the existing one or use a different space.`,
        })
      }
    }
    const d = deploymentStore.create(input)
    executors.set(d.id, executor)
    lastExecutor = executor
    lastDeploymentId = d.id
    // Fire-and-forget; progress is observed via the SSE events endpoint.
    runPipeline({ deployment: d, executor, store: deploymentStore, env: {}, onLine: () => {} })
      .catch((err) => { d.steps.deploy.status = 'failed'; d.steps.deploy.log += `\n${err.message}` })
    res.status(201).json(d)
  })

  app.post('/api/deployments/:id/redeploy', (req, res) => {
    const existing = deploymentStore.get(req.params.id)
    if (!existing) return res.status(404).json({ error: 'not found' })
    const { image, policy, envVars, credentialsText } = req.body || {}
    // Apply edits and reset the deployment for a fresh run.
    const d = deploymentStore.updateForRedeploy(existing.id, { image, policy, envVars, credentialsText })
    const executor = executors.get(d.id) || makeExecutor('mock')
    lastExecutor = executor
    lastDeploymentId = d.id

    // Full undeploy of the old bundle, THEN re-run the pipeline so tenant clones
    // are recreated from the new sandboxified image. Fire-and-forget; progress
    // is observed via the events endpoint.
    ;(async () => {
      try {
        await runUndeploy({ deployment: d, executor, env: {}, onLine: () => {} })
        // Reset steps again so the redeploy pipeline shows fresh sandboxify/deploy
        // (undeploy just wrote into steps.undeploy).
        d.steps.sandboxify = { status: 'pending', log: '' }
        d.steps.deploy = { status: 'pending', log: '' }
        await runPipeline({ deployment: d, executor, store: deploymentStore, env: {}, onLine: () => {} })
      } catch (err) {
        d.steps.deploy.status = 'failed'
        d.steps.deploy.log += `\n${err.message}`
      }
    })()
    res.status(202).json(d)
  })

  app.get('/api/deployments/:id/events', (req, res) => {
    const d = deploymentStore.get(req.params.id)
    if (!d) return res.status(404).end()
    sseInit(res)
    // Poll the in-memory deployment and push status snapshots until both done/failed.
    const id = setInterval(() => {
      sseSend(res, { steps: d.steps, routerUrl: d.routerUrl })
      const finished = ['done', 'failed']
      if (finished.includes(d.steps.deploy.status) &&
          (d.steps.sandboxify.status !== 'running')) {
        sseSend(res, { done: true })
        clearInterval(id)
        res.end()
      }
    }, 300)
    req.on('close', () => clearInterval(id))
  })

  app.post('/api/deployments/:id/a2a', async (req, res) => {
    const d = deploymentStore.get(req.params.id)
    if (!d) return res.status(404).json({ error: 'not found' })
    const executor = executors.get(d.id) || makeExecutor('mock')
    const { tenant, message } = req.body || {}
    // Sign with the configured JWT secret — must match the router's
    // JWT_DEV_SECRET, or the router rejects with 'unauthorized'.
    const secret = configStore.get().jwtSecret || process.env.JWT_DEV_SECRET || 'dev-secret'
    if (!d.routerUrl) {
      return res.status(409).json({ error: 'This deployment has no URL yet. Wait until its deploy step is done, then send again.' })
    }
    try {
      const result = await executor.a2a({
        tenant, message, url: d.routerUrl,
        secret,
      })
      res.json(result)
    } catch (err) {
      res.status(502).json({ error: `Request to ${d.routerUrl} failed: ${err.message}` })
    }
  })

  app.post('/api/deployments/:id/undeploy', (req, res) => {
    const d = deploymentStore.get(req.params.id)
    if (!d) return res.status(404).json({ error: 'not found' })
    const executor = executors.get(d.id) || makeExecutor('mock')
    // Fire-and-forget; progress observed via the undeploy-events endpoint. We do
    // NOT remove the deployment here — that would race the client's SSE connect
    // (mock teardown is near-instant). The events endpoint removes it after it
    // has emitted the terminal event.
    runUndeploy({ deployment: d, executor, env: {}, onLine: () => {} }).catch(() => {})
    res.status(202).json(d)
  })

  app.get('/api/deployments/:id/undeploy-events', (req, res) => {
    const d = deploymentStore.get(req.params.id)
    if (!d) return res.status(404).end()
    sseInit(res)
    const id = setInterval(() => {
      const cur = deploymentStore.get(req.params.id)
      if (!cur) { clearInterval(id); res.end(); return }
      sseSend(res, { undeploy: cur.steps.undeploy })
      const status = cur.steps.undeploy.status
      if (status === 'done') {
        // Terminal: tell the client it's gone, then remove from the store.
        sseSend(res, { removed: true, done: true })
        executors.delete(cur.id)
        deploymentStore.remove(cur.id)
        clearInterval(id)
        res.end()
      } else if (status === 'failed') {
        sseSend(res, { done: true })
        clearInterval(id)
        res.end()
      }
    }, 200)
    req.on('close', () => clearInterval(id))
  })

  app.get('/api/cf-status', (req, res) => {
    const mode = req.query.mode || 'mock'
    const depId = req.query.deploymentId
    const fallback = makeExecutor(mode)
    // Resolve the executor per tick, not once per connection: a panel opened
    // before any deployment exists must start reflecting the deployment's apps
    // once it's created (lastExecutor is set at that point).
    const executor = {
      cfApps: () => {
        const active = (depId && executors.get(depId)) || lastExecutor || fallback
        // Target the active deployment's space so the panel reflects it, not
        // whatever space the cf CLI was last pointed at globally.
        const dep = deploymentStore.get(depId || lastDeploymentId)
        const scope = dep ? { org: dep.org, space: dep.space } : {}
        return active.cfApps(scope)
      },
    }
    sseInit(res)
    const stop = startCfStatusStream({
      executor, intervalMs: 3000, emit: (snapshot) => sseSend(res, snapshot),
    })
    req.on('close', stop)
  })
}
