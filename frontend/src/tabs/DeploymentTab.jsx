import React, { useEffect, useState } from 'react'
import { listDeployments, openDeploymentEvents, undeployDeployment, openUndeployEvents } from '../api.js'
import NewDeploymentForm from '../components/NewDeploymentForm.jsx'
import StepProgress from '../components/StepProgress.jsx'

export default function DeploymentTab({ mode = 'mock' }) {
  const [deployments, setDeployments] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [live, setLive] = useState({}) // id -> { steps, routerUrl }
  const [undeploying, setUndeploying] = useState({}) // id -> undeploy step

  useEffect(() => { listDeployments().then(setDeployments) }, [])

  const subscribe = (id) => {
    openDeploymentEvents(id, (evt) => {
      if (evt.steps) setLive((l) => ({ ...l, [id]: { steps: evt.steps, routerUrl: evt.routerUrl } }))
    })
  }

  const onCreated = (d) => {
    setShowForm(false)
    setDeployments((list) => [...list, d])
    setLive((l) => ({ ...l, [d.id]: { steps: d.steps, routerUrl: d.routerUrl } }))
    subscribe(d.id)
  }

  const onSaved = (d) => {
    // Redeploy started: replace the card's deployment data, reset its progress,
    // and follow the fresh pipeline.
    setEditingId(null)
    setDeployments((list) => list.map((x) => (x.id === d.id ? d : x)))
    setLive((l) => ({ ...l, [d.id]: { steps: d.steps, routerUrl: d.routerUrl } }))
    subscribe(d.id)
  }

  const remove = (id) => {
    setDeployments((list) => list.filter((x) => x.id !== id))
    setUndeploying((u) => { const n = { ...u }; delete n[id]; return n })
  }

  const onDelete = async (d) => {
    if (!window.confirm(`Delete deployment “${d.appName}”? This tears down its CF apps and cannot be undone.`)) return
    setUndeploying((u) => ({ ...u, [d.id]: { status: 'running', log: '' } }))
    await undeployDeployment(d.id)
    openUndeployEvents(d.id, (evt) => {
      if (evt.undeploy) setUndeploying((u) => ({ ...u, [d.id]: evt.undeploy }))
      if (evt.removed) remove(d.id)
    })
  }

  return (
    <div>
      <button onClick={() => setShowForm((s) => !s)} style={{ fontSize: 18, padding: '10px 24px' }}>New</button>
      {showForm && <div style={{ marginTop: 12 }}><NewDeploymentForm mode={mode} onCreated={onCreated} /></div>}

      {deployments.length === 0 && !showForm && (
        <p style={{ color: '#666' }}>No deployments yet. Click “New” to create one.</p>
      )}

      {deployments.map((d) => {
        const state = live[d.id] || { steps: d.steps, routerUrl: d.routerUrl }
        const und = undeploying[d.id]
        const isEditing = editingId === d.id
        return (
          <div key={d.id} style={{ border: '1px solid #eee', padding: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{d.appName} — {d.image}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditingId(isEditing ? null : d.id)} disabled={!!und} style={{ fontSize: 14 }}>
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
                <button onClick={() => onDelete(d)} disabled={!!und} style={{ color: '#c33', fontSize: 14 }}>
                  {und ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>

            {isEditing && (
              <div style={{ marginTop: 12 }}>
                <NewDeploymentForm mode={mode} deployment={d} onSaved={onSaved} />
              </div>
            )}

            <StepProgress name="Sandboxify" step={state.steps.sandboxify} />
            <StepProgress name="Deploy to CF" step={state.steps.deploy} />
            {state.routerUrl && (
              <div style={{ fontSize: 15 }}>Router URL: <a href={state.routerUrl} target="_blank" rel="noreferrer">{state.routerUrl}</a></div>
            )}
            {und && <StepProgress name="Delete (undeploy)" step={und} />}
          </div>
        )
      })}
    </div>
  )
}
