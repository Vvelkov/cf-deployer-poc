import { describe, it, expect } from 'vitest'
import { createMockExecutor } from '../src/executor/mockExecutor.js'

describe('mockExecutor', () => {
  it('sandboxify streams lines and returns a mock image ref', async () => {
    const ex = createMockExecutor()
    const lines = []
    const r = await ex.sandboxify({ appName: 'app', image: 'i', policy: 'p' }, l => lines.push(l))
    expect(r.code).toBe(0)
    expect(r.imageRef).toBe('mock.reg/sbx-app:mock')
    expect(lines.length).toBeGreaterThan(0)
  })
  it('deploy returns a mock router url', async () => {
    const ex = createMockExecutor()
    const r = await ex.deploy({ appName: 'app', dockerImage: 'x' }, () => {})
    expect(r.routerUrl).toBe('https://app-sandbox-router.mock.example.io')
  })
  it('resolveRouterUrl returns the mock router url after deploy', async () => {
    const ex = createMockExecutor()
    await ex.deploy({ appName: 'app', dockerImage: 'x' }, () => {})
    expect(await ex.resolveRouterUrl('app')).toBe('https://app-sandbox-router.mock.example.io')
  })
  it('a2a creates a tenant clone visible in cfApps', async () => {
    const ex = createMockExecutor()
    await ex.deploy({ appName: 'app', dockerImage: 'x' }, () => {})
    const before = await ex.cfApps()
    await ex.a2a({ tenant: 't1', message: 'hi', url: 'u', secret: 's' })
    const after = await ex.cfApps()
    expect(after.length).toBe(before.length + 1)
    expect(after.some(a => a.name.includes('t1'))).toBe(true)
  })
  it('undeploy streams lines and clears the fake apps', async () => {
    const ex = createMockExecutor()
    await ex.deploy({ appName: 'app', dockerImage: 'x' }, () => {})
    await ex.a2a({ tenant: 't1', message: 'hi', url: 'u', secret: 's' })
    expect((await ex.cfApps()).length).toBeGreaterThan(0)
    const lines = []
    const r = await ex.undeploy({ org: 'o', space: 'sp', appName: 'app' }, l => lines.push(l))
    expect(r.code).toBe(0)
    expect(lines.length).toBeGreaterThan(0)
    expect(await ex.cfApps()).toEqual([])
  })
})
