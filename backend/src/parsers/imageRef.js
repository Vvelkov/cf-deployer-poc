const REF = /([^\s]+\/[^\s]+:[^\s)]+)/

export function extractImageRef(stdout) {
  const lines = stdout.split(/\r?\n/)
  const built = [...lines].reverse().find(l => l.includes('Built + pushed'))
  const building = [...lines].reverse().find(l => l.includes('building sandboxed image:'))
  const line = built || building
  if (!line) return null
  const m = line.match(REF)
  return m ? m[1] : null
}
