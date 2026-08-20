export function parseCfApps(stdout) {
  const lines = stdout.split(/\r?\n/)
  const headerIdx = lines.findIndex(l => /^name\s+requested state\s+processes\s+routes/.test(l))
  if (headerIdx === -1) return []
  return lines.slice(headerIdx + 1)
    .filter(l => l.trim() !== '')
    .map(l => {
      const [name, requestedState, processes, ...rest] = l.trim().split(/\s{2,}/)
      return { name, requestedState, processes, routes: (rest.join('  ') || '').trim() }
    })
    .filter(r => r.name)
}

// Resolve the router's external URL from `cf apps` output. Finds the
// `<appName>-sandbox-router` row and returns its first non-internal route as an
// https URL. This is robust against the deploy script's fragile `router URL:`
// line (which can capture the wrong field on some CF CLI versions).
export function externalRouterUrl(stdout, appName) {
  const routerName = `${appName}-sandbox-router`
  const row = parseCfApps(stdout).find(r => r.name === routerName)
  if (!row || !row.routes) return null
  const external = row.routes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .find(route => !route.endsWith('.apps.internal'))
  return external ? `https://${external}` : null
}

