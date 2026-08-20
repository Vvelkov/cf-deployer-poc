export function parseEnvFile(text) {
  return text.split(/\r?\n/)
    .filter(l => l.trim() !== '' && !l.trimStart().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return { key: l.slice(0, i), value: l.slice(i + 1) }
    })
}

export function maskValue(value) {
  return value.length > 4 ? value.slice(0, 4) + '…' : '…'
}

export function toMaskedList(text) {
  return parseEnvFile(text).map(({ key, value }) => ({ key, masked: maskValue(value) }))
}
