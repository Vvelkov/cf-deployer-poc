import crypto from 'node:crypto'

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

export function mintJwt({ secret, tenant, now, ttl = 3600 }) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ sub: tenant, iat: now, exp: now + ttl }))
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export async function sendMessage({ url, secret, tenant, message, fetch = globalThis.fetch, now = Math.floor(Date.now() / 1000) }) {
  const jwt = mintJwt({ secret, tenant, now })
  const body = {
    jsonrpc: '2.0', id: 1, method: 'message/send',
    params: { message: { messageId: 'm1', role: 'user', parts: [{ kind: 'text', text: message }] } },
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}
