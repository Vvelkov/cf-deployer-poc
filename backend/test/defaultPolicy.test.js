import { describe, it, expect } from 'vitest'
import { DEFAULT_POLICY_YAML } from '../src/defaults/defaultPolicy.js'

describe('DEFAULT_POLICY_YAML', () => {
  it('is the OpenShell policy with the three network policies', () => {
    expect(DEFAULT_POLICY_YAML).toContain('version: 1')
    expect(DEFAULT_POLICY_YAML).toContain('allow_github')
    expect(DEFAULT_POLICY_YAML).toContain('allow_aicore')
    expect(DEFAULT_POLICY_YAML).toContain('allow_oauth')
    expect(DEFAULT_POLICY_YAML).toContain('landlock')
  })
})
