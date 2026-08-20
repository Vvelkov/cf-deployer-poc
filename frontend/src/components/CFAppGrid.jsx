import React from 'react'

export default function CFAppGrid({ apps }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
          <th style={{ padding: 6 }}>name</th>
          <th style={{ padding: 6 }}>state</th>
          <th style={{ padding: 6 }}>processes</th>
          <th style={{ padding: 6 }}>routes</th>
        </tr>
      </thead>
      <tbody>
        {(apps || []).map((a) => (
          <tr key={a.name} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 6 }}>{a.name}</td>
            <td style={{ padding: 6 }}>{a.requestedState}</td>
            <td style={{ padding: 6 }}>{a.processes}</td>
            <td style={{ padding: 6 }}>{a.routes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
