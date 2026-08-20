import { describe, it, expect } from 'vitest'
import { createDeploymentStore } from '../src/deployments/deploymentStore.js'

describe('deploymentStore', () => {
  it('creates with pending steps and lists', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentials: [] })
    expect(d.steps.sandboxify.status).toBe('pending')
    expect(d.steps.deploy.status).toBe('pending')
    expect(s.list().length).toBeGreaterThanOrEqual(1)
    expect(s.get(d.id).image).toBe('i')
  })

  it('removes a deployment', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentials: [] })
    expect(s.remove(d.id)).toBe(true)
    expect(s.get(d.id)).toBeUndefined()
    expect(s.list().find(x => x.id === d.id)).toBeUndefined()
  })

  it('keeps raw credentials server-side (masked on the object, real via getCredentials)', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentialsText: 'API_KEY=supersecret\nTOKEN=abc123xyz' })
    // The serialized deployment carries only masked values.
    expect(d.credentials).toEqual([
      { key: 'API_KEY', masked: 'supe…' },
      { key: 'TOKEN', masked: 'abc1…' },
    ])
    expect(JSON.stringify(d)).not.toContain('supersecret')
    // The real values are retrievable server-side for the pipeline.
    expect(s.getCredentials(d.id)).toEqual([
      { key: 'API_KEY', value: 'supersecret' },
      { key: 'TOKEN', value: 'abc123xyz' },
    ])
  })

  it('drops raw credentials when the deployment is removed', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentialsText: 'K=v12345' })
    s.remove(d.id)
    expect(s.getCredentials(d.id)).toEqual([])
  })

  it('updateForRedeploy applies edits, resets steps, and keeps creds unless re-supplied', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'old-img', org: 'o', space: 'sp', appName: 'a', policy: 'old-policy', credentialsText: 'API_KEY=orig123', envVars: [{ key: 'A', value: '1' }] })
    // mark steps as if a prior deploy finished
    d.steps.sandboxify.status = 'done'; d.steps.deploy.status = 'done'; d.routerUrl = 'https://old'

    const out = s.updateForRedeploy(d.id, { image: 'new-img', policy: 'new-policy', envVars: [{ key: 'B', value: '2' }] })
    expect(out.image).toBe('new-img')
    expect(out.policy).toBe('new-policy')
    expect(out.envVars).toEqual([{ key: 'B', value: '2' }])
    // steps reset, routerUrl cleared
    expect(out.steps.sandboxify.status).toBe('pending')
    expect(out.steps.deploy.status).toBe('pending')
    expect(out.steps.sandboxify.log).toBe('')
    expect(out.routerUrl).toBeNull()
    // credentials kept (not re-supplied)
    expect(s.getCredentials(d.id)).toEqual([{ key: 'API_KEY', value: 'orig123' }])
    expect(out.credentials).toEqual([{ key: 'API_KEY', masked: 'orig…' }])
  })

  it('updateForRedeploy replaces credentials when new text is supplied', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentialsText: 'API_KEY=orig123' })
    s.updateForRedeploy(d.id, { image: 'i', policy: 'p', envVars: [], credentialsText: 'API_KEY=new456\nEXTRA=xyz789' })
    expect(s.getCredentials(d.id)).toEqual([
      { key: 'API_KEY', value: 'new456' },
      { key: 'EXTRA', value: 'xyz789' },
    ])
  })
})
