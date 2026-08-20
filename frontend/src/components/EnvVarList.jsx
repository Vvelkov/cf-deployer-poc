import React from 'react'

// Renders KEY=value rows with full (unmasked) values — for plain env vars.
export default function EnvVarList({ env }) {
  if (!env || env.length === 0) return null
  return (
    <ul style={{ listStyle: 'none', padding: 0, fontFamily: 'monospace', fontSize: 13 }}>
      {env.map((e) => (
        <li key={e.key}>{e.key}={e.value}</li>
      ))}
    </ul>
  )
}
