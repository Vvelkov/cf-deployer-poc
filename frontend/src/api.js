// REST + SSE client for the CF Deployer backend. Uses relative /api paths
// (Vite proxies to the backend in dev).

async function jsonFetch(url, opts) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  return res.json()
}

export const getConfig = () => jsonFetch('/api/config')
export const putConfig = (cfg) => jsonFetch('/api/config', { method: 'PUT', body: JSON.stringify(cfg) })
export const getDefaultPolicy = () => jsonFetch('/api/default-policy')
export const parseCredentials = (text) =>
  jsonFetch('/api/credentials/parse', { method: 'POST', body: JSON.stringify({ text }) })
export const parseEnv = (text) =>
  jsonFetch('/api/env/parse', { method: 'POST', body: JSON.stringify({ text }) })

export const listDeployments = () => jsonFetch('/api/deployments')

// Returns the created deployment, or { error } when the backend rejects it
// (e.g. 409: the space already has a deployment).
export async function createDeployment(body) {
  const res = await fetch('/api/deployments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json()
  return res.ok ? data : { error: data.error || `request failed (${res.status})` }
}

export const sendA2A = (id, body) =>
  jsonFetch(`/api/deployments/${id}/a2a`, { method: 'POST', body: JSON.stringify(body) })

export const redeployDeployment = (id, body) =>
  jsonFetch(`/api/deployments/${id}/redeploy`, { method: 'POST', body: JSON.stringify(body) })

export const undeployDeployment = (id) =>
  jsonFetch(`/api/deployments/${id}/undeploy`, { method: 'POST' })

// Opens an SSE stream of undeploy progress. Calls onEvent for each snapshot;
// the final event carries { removed: true, done: true }. Returns unsubscribe.
export function openUndeployEvents(id, onEvent) {
  const es = new EventSource(`/api/deployments/${id}/undeploy-events`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    onEvent(data)
    if (data.done) es.close()
  }
  return () => es.close()
}

// Opens an SSE stream of deployment progress. Calls onEvent for each snapshot.
// Returns an unsubscribe function.
export function openDeploymentEvents(id, onEvent) {
  const es = new EventSource(`/api/deployments/${id}/events`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    onEvent(data)
    if (data.done) es.close()
  }
  return () => es.close()
}

// Opens the CF status SSE stream. Calls onSnapshot for each { apps } payload.
// Returns an unsubscribe function.
export function openCfStatus(mode, onSnapshot) {
  const es = new EventSource(`/api/cf-status?mode=${encodeURIComponent(mode)}`)
  es.onmessage = (e) => onSnapshot(JSON.parse(e.data))
  return () => es.close()
}
