import { describe, it, expect } from 'vitest'
import { extractRouterUrl } from '../src/parsers/routerUrl.js'

describe('extractRouterUrl', () => {
  it('reads the router URL line', () => {
    const out = '=== bundle ready ===\n  router URL:    https://sbx-poc-sandbox-router.cfapps.example.io\n'
    expect(extractRouterUrl(out)).toBe('https://sbx-poc-sandbox-router.cfapps.example.io')
  })
  it('returns null when absent', () => {
    expect(extractRouterUrl('no url')).toBeNull()
  })
})
