import React from 'react'

// Renders masked KEY=masked rows.
export default function MaskedCredList({ credentials }) {
  if (!credentials || credentials.length === 0) return null
  return (
    <ul style={{ listStyle: 'none', padding: 0, fontFamily: 'monospace', fontSize: 13 }}>
      {credentials.map((c) => (
        <li key={c.key}>{c.key}={c.masked}</li>
      ))}
    </ul>
  )
}
