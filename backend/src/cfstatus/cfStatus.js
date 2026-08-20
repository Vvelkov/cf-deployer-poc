export function startCfStatusStream({ executor, intervalMs, emit, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval }) {
  const tick = async () => { emit({ apps: await executor.cfApps() }) }
  tick()
  const id = setInterval(tick, intervalMs)
  return () => clearInterval(id)
}
