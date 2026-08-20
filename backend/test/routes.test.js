import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { app } from '../src/server.js'
import { registerRoutes } from '../src/routes.js'
import { createMockExecutor } from '../src/executor/mockExecutor.js'

describe('routes', () => {
  it('serves the default policy', async () => {
    const res = await request(app).get('/api/default-policy')
    expect(res.status).toBe(200)
    expect(res.body.policy).toContain('allow_github')
  })
  it('parses credentials without leaking values', async () => {
    const res = await request(app).post('/api/credentials/parse').send({ text: 'K=secretvalue' })
    expect(res.body.credentials).toEqual([{ key: 'K', masked: 'secr…' }])
  })
  it('parses env vars with full values (unmasked)', async () => {
    const res = await request(app).post('/api/env/parse').send({ text: 'FOO=bar\nBAZ=qux=quux' })
    expect(res.status).toBe(200)
    expect(res.body.env).toEqual([
      { key: 'FOO', value: 'bar' },
      { key: 'BAZ', value: 'qux=quux' },
    ])
  })
  it('creates a deployment in mock mode and lists it', async () => {
    const res = await request(app).post('/api/deployments')
      .send({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [], mode: 'mock' })
    expect(res.status).toBe(201)
    const list = await request(app).get('/api/deployments')
    expect(list.body.some(d => d.id === res.body.id)).toBe(true)
  })
  it('omits passwords from GET /api/config', async () => {
    await request(app).put('/api/config').send({ cfPassword: 'p', cfApi: 'a' })
    const res = await request(app).get('/api/config')
    expect(res.body.cfApi).toBe('a')
    expect(res.body.cfPassword).toBeUndefined()
  })

  it('undeploys a deployment and removes it once teardown completes', async () => {
    const created = await request(app).post('/api/deployments')
      .send({ image: 'i', org: 'o', space: 'sp', appName: 'delme', policy: 'p', credentials: [], mode: 'mock' })
    const id = created.body.id
    const res = await request(app).post(`/api/deployments/${id}/undeploy`)
    expect(res.status).toBe(202)

    // The client observes teardown via the undeploy-events SSE stream; that
    // stream also drives removal once it emits the terminal event.
    const events = await request(app).get(`/api/deployments/${id}/undeploy-events`)
    expect(events.text).toContain('"removed":true')

    const list = await request(app).get('/api/deployments')
    expect(list.body.some(d => d.id === id)).toBe(false)
  })

  it('rejects a second deployment in a space that already has one (409)', async () => {
    // Inject an executor whose space already contains a template app.
    const guardApp = express()
    guardApp.use(express.json())
    const makeExecutor = () => ({
      ...createMockExecutor(),
      hasExistingTemplate: async () => true,
    })
    registerRoutes(guardApp, { makeExecutor })

    const res = await request(guardApp).post('/api/deployments')
      .send({ image: 'i', org: 'gvisor-eval', space: 'sandboxed-apps', appName: 'second', policy: 'p', credentials: [], mode: 'real' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already has a deployment|one deployment per space/i)

    // Nothing was created.
    const list = await request(guardApp).get('/api/deployments')
    expect(list.body).toHaveLength(0)
  })

  it('allows a deployment when the space has no existing template', async () => {
    const guardApp = express()
    guardApp.use(express.json())
    const makeExecutor = () => ({
      ...createMockExecutor(),
      hasExistingTemplate: async () => false,
    })
    registerRoutes(guardApp, { makeExecutor })
    const res = await request(guardApp).post('/api/deployments')
      .send({ image: 'i', org: 'o', space: 'sp', appName: 'ok', policy: 'p', credentials: [], mode: 'real' })
    expect(res.status).toBe(201)
  })

  it('omits jwtSecret from GET /api/config', async () => {
    await request(app).put('/api/config').send({ jwtSecret: 'topsecret', cfApi: 'a' })
    const res = await request(app).get('/api/config')
    expect(res.body.jwtSecret).toBeUndefined()
  })

  it('signs A2A with the configured jwtSecret', async () => {
    const captured = {}
    const makeExecutor = () => ({
      ...createMockExecutor(),
      a2a: async (opts) => { captured.secret = opts.secret; return { status: 200, body: { ok: true } } },
    })
    const a2aApp = express()
    a2aApp.use(express.json())
    registerRoutes(a2aApp, { makeExecutor })

    await request(a2aApp).put('/api/config').send({ jwtSecret: 'b722f7d5-router-secret' })
    const created = await request(a2aApp).post('/api/deployments')
      .send({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentials: [], mode: 'mock' })
    await request(a2aApp).post(`/api/deployments/${created.body.id}/a2a`).send({ tenant: 't1', message: 'hi' })
    expect(captured.secret).toBe('b722f7d5-router-secret')
  })

  it('redeploys: undeploys the old bundle then re-runs the pipeline with edits', async () => {
    const calls = []
    const makeExecutor = () => {
      const mock = createMockExecutor()
      return {
        ...mock,
        undeploy: async (opts, onLine) => { calls.push('undeploy'); return mock.undeploy(opts, onLine) },
        sandboxify: async (opts, onLine) => { calls.push(`sandboxify:${opts.image}`); return mock.sandboxify(opts, onLine) },
        deploy: async (opts, onLine) => { calls.push('deploy'); return mock.deploy(opts, onLine) },
      }
    }
    const app2 = express()
    app2.use(express.json())
    registerRoutes(app2, { makeExecutor })

    const created = await request(app2).post('/api/deployments')
      .send({ image: 'old-img', org: 'o', space: 'sp', appName: 'a', policy: 'old', credentials: [], mode: 'mock' })
    const id = created.body.id
    // wait for initial deploy done
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 20))
      const d = await request(app2).get(`/api/deployments/${id}`)
      if (d.body.steps.deploy.status === 'done') break
    }
    calls.length = 0

    const res = await request(app2).post(`/api/deployments/${id}/redeploy`)
      .send({ image: 'new-img', policy: 'new', envVars: [] })
    expect(res.status).toBe(202)

    // wait for redeploy pipeline to finish
    let done
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 20))
      done = await request(app2).get(`/api/deployments/${id}`)
      if (done.body.steps.deploy.status === 'done' && done.body.image === 'new-img') break
    }
    // undeploy ran before the new sandboxify/deploy
    expect(calls[0]).toBe('undeploy')
    expect(calls).toContain('sandboxify:new-img')
    expect(calls.indexOf('undeploy')).toBeLessThan(calls.indexOf('sandboxify:new-img'))
    expect(done.body.image).toBe('new-img')
    expect(done.body.steps.deploy.status).toBe('done')
  })
})
