import { describe, it, expect } from 'vitest'
import { parseEnvFile, maskValue, toMaskedList } from '../src/parsers/credentials.js'

describe('credentials', () => {
  it('parses KEY=VALUE, skipping blanks and comments', () => {
    const text = 'A=1\n\n# c\nB=two=parts'
    expect(parseEnvFile(text)).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'two=parts' },
    ])
  })
  it('masks values keeping first 4 chars', () => {
    expect(maskValue('asd123abc')).toBe('asd1…')
    expect(maskValue('ab')).toBe('…')
  })
  it('produces a masked list', () => {
    expect(toMaskedList('AI_CORE_SECRET=asd123')).toEqual([
      { key: 'AI_CORE_SECRET', masked: 'asd1…' },
    ])
  })
})
