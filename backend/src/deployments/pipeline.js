// Runs the chained pipeline: sandboxify (--no-deploy) captures the pushed image
// ref; deploy uses that ref as the router's docker image and captures the URL.
// If sandboxify fails, deploy stays pending and the pipeline stops.
export async function runPipeline({ deployment, executor, store, env, onLine }) {
  const d = deployment
  const append = (step, line) => {
    d.steps[step].log += (d.steps[step].log ? '\n' : '') + line
    if (onLine) onLine(step, line)
  }
  const fail = (step, { exitCode, message, log } = {}) => {
    d.steps[step].status = 'failed'
    if (exitCode !== undefined) d.steps[step].exitCode = exitCode
    // Fold in the executor's captured log if the live stream didn't already
    // carry it (e.g. an executor that returns output without streaming it).
    if (log && !d.steps[step].log.includes(log.trim())) append(step, log.trimEnd())
    const marker = exitCode !== undefined
      ? `-- ${step} failed (exit code ${exitCode}) --`
      : `-- ${step} failed: ${message} --`
    append(step, marker)
  }

  // Run one step; on a thrown error mark THIS step failed (not always deploy).
  const runStep = async (step, fn) => {
    d.steps[step].status = 'running'
    try {
      return await fn()
    } catch (err) {
      fail(step, { message: err.message })
      append(step, err.stack || String(err))
      return { threw: true }
    }
  }

  const credentials = store && store.getCredentials ? store.getCredentials(d.id) : []
  const sbx = await runStep('sandboxify', () =>
    executor.sandboxify(
      { image: d.image, policy: d.policy, appName: d.appName, credentials, env },
      (line) => append('sandboxify', line),
    ),
  )
  if (sbx.threw) return d
  if (sbx.code !== 0 || !sbx.imageRef) {
    fail('sandboxify', { exitCode: sbx.code, log: sbx.log })
    return d
  }
  d.steps.sandboxify.status = 'done'

  const dep = await runStep('deploy', () =>
    executor.deploy(
      { org: d.org, space: d.space, appName: d.appName, dockerImage: sbx.imageRef, envVars: d.envVars, env },
      (line) => append('deploy', line),
    ),
  )
  if (dep.threw) return d
  if (dep.code !== 0) {
    fail('deploy', { exitCode: dep.code, log: dep.log })
    return d
  }
  d.steps.deploy.status = 'done'
  // The deploy script's own `router URL:` line is unreliable on some CF CLI
  // versions (can capture `stack:` etc.). Resolve it robustly from cf apps,
  // falling back to the parsed value only if resolution yields nothing.
  let resolved = null
  if (executor.resolveRouterUrl) {
    try { resolved = await executor.resolveRouterUrl(d.appName, { org: d.org, space: d.space }) } catch { resolved = null }
  }
  d.routerUrl = resolved || dep.routerUrl
  return d
}

// Tears down a deployment via the undeploy executor. Streams progress onto the
// deployment's `undeploy` step. On success the caller removes it from the store.
export async function runUndeploy({ deployment, executor, env, onLine }) {
  const d = deployment
  const append = (line) => {
    d.steps.undeploy.log += (d.steps.undeploy.log ? '\n' : '') + line
    if (onLine) onLine('undeploy', line)
  }
  d.steps.undeploy.status = 'running'
  try {
    // Delete the router's tenant clones first — the undeploy script only tears
    // down the router + template (it can't match clones, which lack a `bundle`
    // label). Clones are matched by name prefix in the executor.
    if (executor.deleteClones) {
      try {
        await executor.deleteClones({ org: d.org, space: d.space, appName: d.appName }, (line) => append(line))
      } catch (err) {
        append(`-- clone cleanup warning: ${err.message} --`)
      }
    }
    const res = await executor.undeploy(
      { org: d.org, space: d.space, appName: d.appName, env },
      (line) => append(line),
    )
    if (res.code !== 0) {
      d.steps.undeploy.status = 'failed'
      d.steps.undeploy.exitCode = res.code
      if (res.log && !d.steps.undeploy.log.includes(res.log.trim())) append(res.log.trimEnd())
      append(`-- undeploy failed (exit code ${res.code}) --`)
      return d
    }
    d.steps.undeploy.status = 'done'
    return d
  } catch (err) {
    d.steps.undeploy.status = 'failed'
    append(`-- undeploy failed: ${err.message} --`)
    return d
  }
}
