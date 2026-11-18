import React, { useState } from 'react'
import Tabs from './components/Tabs.jsx'
import ConfigurationTab from './tabs/ConfigurationTab.jsx'
import DeploymentTab from './tabs/DeploymentTab.jsx'
import A2AClientTab from './tabs/A2AClientTab.jsx'
import CFStatusPanel from './components/CFStatusPanel.jsx'

// Tabs that show the live CF Status side panel alongside their content.
const PANEL_TABS = new Set(['deployment', 'a2a'])

export default function App() {
  const [mode, setMode] = useState('mock')
  const [activeTab, setActiveTab] = useState('config')

  const tabs = [
    { id: 'config', label: 'Configuration', render: () => <ConfigurationTab /> },
    { id: 'deployment', label: 'Deployment', render: () => <DeploymentTab mode={mode} /> },
    { id: 'a2a', label: 'HTTP Client', render: () => <A2AClientTab /> },
  ]

  const showPanel = PANEL_TABS.has(activeTab)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1320, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>CF Deployer</h1>
        <label style={{ fontSize: 13 }}>
          mode:{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="mock">mock (demo/rehearsal)</option>
            <option value="real">real</option>
          </select>
        </label>
      </header>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <main style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={tabs} onActiveChange={setActiveTab} />
        </main>
        {showPanel && <CFStatusPanel mode={mode} />}
      </div>
    </div>
  )
}
