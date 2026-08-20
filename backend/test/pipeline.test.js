import { describe, it, expect } from 'vitest'
import { createDeploymentStore } from '../src/deployments/deploymentStore.js'
import { runPipeline, runUndeploy } from '../src/deployments/pipeline.js'
import { createMockExecutor } from '../src/executor/mockExecutor.js'

describe('runPipeline', () => {
  it('runs both steps and captures router url', async () => {
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor: createMockExecutor(), store, env: {}, onLine: () => {} })
    expect(out.steps.sandboxify.status).toBe('done')
    expect(out.steps.deploy.status).toBe('done')
    expect(out.routerUrl).toBe('https://app-sandbox-router.mock.example.io')
  })

  it('passes the deployment real credentials to sandboxify', async () => {
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentialsText: 'API_KEY=supersecret' })
    let sawCreds
    const executor = {
      ...createMockExecutor(),
      sandboxify: async (opts) => { sawCreds = opts.credentials; return { code: 0, imageRef: 'r/x:1', log: '' } },
    }
    await runPipeline({ deployment: d, executor, store, env: {}, onLine: () => {} })
    expect(sawCreds).toEqual([{ key: 'API_KEY', value: 'supersecret' }])
  })

  it('prefers the resolved router URL over the deploy-parsed one', async () => {
    // Simulates the real bug: deploy output yields a bogus URL, but resolving
    // from `cf apps` returns the correct external route.
    const executor = {
      ...createMockExecutor(),
      deploy: async () => ({ code: 0, routerUrl: 'https://stack:cflinuxfs4/', log: 'x' }),
      resolveRouterUrl: async () => 'https://app-sandbox-router.cfapps.example.io',
    }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor, store, env: {}, onLine: () => {} })
    expect(out.routerUrl).toBe('https://app-sandbox-router.cfapps.example.io')
  })

  it('falls back to the deploy-parsed URL when resolve returns null', async () => {
    const executor = {
      ...createMockExecutor(),
      deploy: async () => ({ code: 0, routerUrl: 'https://parsed.example.io', log: 'x' }),
      resolveRouterUrl: async () => null,
    }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor, store, env: {}, onLine: () => {} })
    expect(out.routerUrl).toBe('https://parsed.example.io')
  })
  it('stops and marks failed when sandboxify fails, recording exit code + log', async () => {
    const failing = { ...createMockExecutor(), sandboxify: async () => ({ code: 42, imageRef: null, log: 'docker not found' }) }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor: failing, store, env: {}, onLine: () => {} })
    expect(out.steps.sandboxify.status).toBe('failed')
    expect(out.steps.deploy.status).toBe('pending')
    expect(out.steps.sandboxify.exitCode).toBe(42)
    expect(out.steps.sandboxify.log).toContain('docker not found')
    // A human-readable failure marker is appended so the UI can highlight it.
    expect(out.steps.sandboxify.log).toMatch(/exit code 42/i)
  })

  it('marks the running step failed when the executor throws (not always deploy)', async () => {
    const throwing = { ...createMockExecutor(), sandboxify: async () => { throw new Error('kaboom') } }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor: throwing, store, env: {}, onLine: () => {} })
    expect(out.steps.sandboxify.status).toBe('failed')
    expect(out.steps.sandboxify.log).toContain('kaboom')
    expect(out.steps.deploy.status).toBe('pending')
  })
})

describe('runUndeploy', () => {
  it('deletes tenant clones before running the undeploy script', async () => {
    const order = []
    const mock = createMockExecutor()
    const executor = {
      ...mock,
      deleteClones: async (opts, onLine) => { order.push('deleteClones'); return mock.deleteClones(opts, onLine) },
      undeploy: async (opts, onLine) => { order.push('undeploy'); return mock.undeploy(opts, onLine) },
    }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    await runUndeploy({ deployment: d, executor, env: {}, onLine: () => {} })
    expect(order).toEqual(['deleteClones', 'undeploy'])
    expect(d.steps.undeploy.status).toBe('done')
  })

  it('still succeeds when the executor has no deleteClones (back-compat)', async () => {
    const mock = createMockExecutor()
    const executor = { ...mock, deleteClones: undefined }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runUndeploy({ deployment: d, executor, env: {}, onLine: () => {} })
    expect(out.steps.undeploy.status).toBe('done')
  })
})
