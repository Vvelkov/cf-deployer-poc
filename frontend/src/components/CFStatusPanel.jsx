import React, { useEffect, useState } from 'react'
import { openCfStatus } from '../api.js'
import CFAppGrid from './CFAppGrid.jsx'

// Live CF app landscape, shown as a right-hand side panel alongside the
// Deployment and A2A tabs. Subscribes to the CF status SSE stream for `mode`.
export default function CFStatusPanel({ mode = 'mock' }) {
  const [apps, setApps] = useState([])

  useEffect(() => {
    const unsub = openCfStatus(mode, (snapshot) => setApps(snapshot.apps || []))
    return unsub
  }, [mode])

  return (
    <aside
      data-testid="cf-status-panel"
      style={{
        width: 360,
        flexShrink: 0,
        borderLeft: '1px solid #eee',
        padding: 16,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        maxHeight: '100vh',
        overflowY: 'auto',
      }}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 15 }}>CF Status</h2>
      <p style={{ color: '#666', fontSize: 12, marginTop: 0 }}>
        Apps in the target org/space (label poc=sandbox-router), updating live.
      </p>
      <CFAppGrid apps={apps} />
    </aside>
  )
}
