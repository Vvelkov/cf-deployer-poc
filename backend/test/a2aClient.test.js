import { describe, it, expect } from 'vitest'
import { mintJwt, sendMessage } from '../src/a2a/a2aClient.js'

describe('a2aClient', () => {
  it('mints a three-part JWT with the tenant as sub', () => {
    const jwt = mintJwt({ secret: 's', tenant: 't1', now: 1000 })
    const [, payloadB64] = jwt.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    expect(jwt.split('.')).toHaveLength(3)
    expect(payload.sub).toBe('t1')
    expect(payload.exp).toBe(1000 + 3600)
  })
  it('posts message/send with bearer auth', async () => {
    let captured
    const fakeFetch = async (u, opts) => { captured = { u, opts }; return { status: 200, json: async () => ({ ok: true }) } }
    const r = await sendMessage({ url: 'https://r/', secret: 's', tenant: 't1', message: 'hi', fetch: fakeFetch, now: 1 })
    expect(r.status).toBe(200)
    expect(captured.opts.headers.Authorization).toMatch(/^Bearer /)
    expect(JSON.parse(captured.opts.body).method).toBe('message/send')
  })
})
