import { describe, it, expect, vi } from 'vitest'
import { startCfStatusStream } from '../src/cfstatus/cfStatus.js'

describe('startCfStatusStream', () => {
  it('emits an initial snapshot from the executor', async () => {
    const executor = { cfApps: vi.fn().mockResolvedValue([{ name: 'r', requestedState: 'started', processes: 'web:1/1', routes: 'x' }]) }
    const emits = []
    const stop = startCfStatusStream({ executor, intervalMs: 1000, emit: e => emits.push(e), setInterval: () => 1, clearInterval: () => {} })
    await new Promise(r => setImmediate(r))
    expect(emits[0].apps[0].name).toBe('r')
    stop()
  })
})
