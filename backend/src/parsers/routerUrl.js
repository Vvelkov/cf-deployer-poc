export function extractRouterUrl(stdout) {
  const line = stdout.split(/\r?\n/).find(l => l.includes('router URL:'))
  if (!line) return null
  const m = line.match(/(https?:\/\/[^\s]+)/)
  return m ? m[1] : null
}
