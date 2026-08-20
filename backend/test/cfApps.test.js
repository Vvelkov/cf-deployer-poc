import { describe, it, expect } from 'vitest'
import { parseCfApps, externalRouterUrl } from '../src/parsers/cfApps.js'

describe('parseCfApps', () => {
  it('parses rows below the header', () => {
    const out = [
      'Getting apps in org test / space sample_apps...',
      '',
      'name                    requested state   processes   routes',
      'sbx-poc-sandbox-router  started           web:1/1     r1.example.io',
      'agent-sandbox-t1        started           web:1/1     t1.example.io',
    ].join('\n')
    const rows = parseCfApps(out)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      name: 'sbx-poc-sandbox-router', requestedState: 'started',
      processes: 'web:1/1', routes: 'r1.example.io',
    })
    expect(rows[1].name).toBe('agent-sandbox-t1')
  })
  it('returns [] when no table', () => {
    expect(parseCfApps('No apps found')).toEqual([])
  })
})

describe('externalRouterUrl', () => {
  const out = [
    'Getting apps in org gvisor-eval / space stock-apps...',
    '',
    'name                    requested state   processes           routes',
    'roko-app-template       stopped           web:0/1             ',
    'roko-sandbox-router     started           web:1/1, task:0/0   roko-sandbox-router.cfapps.lod-aws-0723.cfrt-sof.sapcloud.io, roko-sandbox-router.apps.internal',
  ].join('\n')

  it('returns the external route of the <appName>-sandbox-router, dropping apps.internal', () => {
    expect(externalRouterUrl(out, 'roko')).toBe('https://roko-sandbox-router.cfapps.lod-aws-0723.cfrt-sof.sapcloud.io')
  })
  it('returns null when the router app is absent', () => {
    expect(externalRouterUrl(out, 'nope')).toBeNull()
  })
  it('returns null when the router has no external route', () => {
    const noExt = [
      'name                 requested state   processes   routes',
      'x-sandbox-router     started           web:1/1     x-sandbox-router.apps.internal',
    ].join('\n')
    expect(externalRouterUrl(noExt, 'x')).toBeNull()
  })
})
