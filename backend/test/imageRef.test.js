import { describe, it, expect } from 'vitest'
import { extractImageRef } from '../src/parsers/imageRef.js'

describe('extractImageRef', () => {
  it('reads the ref from the "building sandboxed image" line', () => {
    const out = '==> building sandboxed image: my.reg/sbx-app:20260820120000 (base pkg-mgr: apt)'
    expect(extractImageRef(out)).toBe('my.reg/sbx-app:20260820120000')
  })
  it('prefers the "Built + pushed" line when present', () => {
    const out = [
      '==> building sandboxed image: my.reg/sbx-app:1 (base pkg-mgr: apt)',
      'Built + pushed my.reg/sbx-app:2 (skipping deploy).',
    ].join('\n')
    expect(extractImageRef(out)).toBe('my.reg/sbx-app:2')
  })
  it('returns null when no ref present', () => {
    expect(extractImageRef('nothing here')).toBeNull()
  })
})
