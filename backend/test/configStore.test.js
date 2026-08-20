import { describe, it, expect } from 'vitest'
import { createConfigStore } from '../src/config/configStore.js'

describe('configStore', () => {
  it('defaults to empty strings', () => {
    expect(createConfigStore().get().cfApi).toBe('')
  })
  it('merges partial updates', () => {
    const s = createConfigStore()
    s.set({ cfApi: 'https://api', dockerUsername: 'u' })
    expect(s.get().cfApi).toBe('https://api')
    expect(s.get().dockerUsername).toBe('u')
  })
  it('maps to script env names, including REGISTRY', () => {
    const s = createConfigStore()
    s.set({ cfApi: 'a', cfUsername: 'b', cfPassword: 'c', dockerRegistry: 'reg.example.com', dockerUsername: 'd', dockerPassword: 'e' })
    expect(s.toEnv()).toEqual({
      CF_API: 'a', CF_USERNAME: 'b', CF_PASSWORD: 'c',
      REGISTRY: 'reg.example.com', REGISTRY_USER: 'd', REGISTRY_PASS: 'e',
    })
  })
})
