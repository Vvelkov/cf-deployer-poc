import React, { useEffect, useState } from 'react'
import { getDefaultPolicy, parseCredentials, parseEnv, createDeployment, redeployDeployment } from '../api.js'
import MaskedCredList from './MaskedCredList.jsx'
import EnvVarList from './EnvVarList.jsx'

// Deployment form used for both create and edit.
//
// Create mode (default): all fields editable; submit calls createDeployment and
// then onCreated(deployment).
//
// Edit mode (pass `deployment`): org/space/app-name are read-only (they identify
// the deployment); image/policy/env are prefilled and editable; existing
// credentials show masked and are kept unless a new file is uploaded. Submit
// calls redeployDeployment (full undeploy + fresh sandboxify/deploy) then
// onSaved(deployment).
export default function NewDeploymentForm({ mode = 'mock', onCreated, deployment, onSaved }) {
  const editing = !!deployment
  const [image, setImage] = useState(deployment?.image || '')
  const [org, setOrg] = useState(deployment?.org || '')
  const [space, setSpace] = useState(deployment?.space || '')
  const [appName, setAppName] = useState(deployment?.appName || '')
  const [policy, setPolicy] = useState(deployment?.policy || '')
  const [credentials, setCredentials] = useState(deployment?.credentials || [])
  const [credentialsText, setCredentialsText] = useState('')
  const [envVars, setEnvVars] = useState(deployment?.envVars || [])
  const [error, setError] = useState(null)

  // Only prefill the default policy for a fresh create (edit keeps the
  // deployment's current policy).
  useEffect(() => {
    if (!editing) getDefaultPolicy().then((r) => setPolicy(r.policy || ''))
  }, [editing])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    // Keep the raw text to send to the backend (which retains real values
    // server-side); the browser only ever displays the masked list.
    setCredentialsText(text)
    const r = await parseCredentials(text)
    setCredentials(r.credentials || [])
  }

  const onUploadEnv = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const r = await parseEnv(text)
    setEnvVars(r.env || [])
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (editing) {
      // Only send credentialsText if the user re-uploaded (else keep existing).
      const body = { image, policy, envVars }
      if (credentialsText) body.credentialsText = credentialsText
      const d = await redeployDeployment(deployment.id, body)
      if (d?.error) { setError(d.error); return }
      onSaved?.(d)
    } else {
      const d = await createDeployment({ image, org, space, appName, policy, credentialsText, envVars, mode })
      if (d?.error) { setError(d.error); return }
      onCreated?.(d)
    }
  }

  const labelStyle = { display: 'block', fontSize: 17, fontWeight: 600, marginBottom: 5 }
  const field = (id, label, value, setter, readOnly = false) => (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={labelStyle}>{label}{readOnly && ' (fixed)'}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => setter(e.target.value)}
        readOnly={readOnly}
        style={{ width: '100%', padding: 8, fontSize: 16, background: readOnly ? '#f0f0f0' : 'white' }}
      />
    </div>
  )

  return (
    <form onSubmit={onSubmit} style={{ border: '1px solid #ddd', padding: 16, marginBottom: 16 }}>
      {field('image', 'Container image', image, setImage)}
      {field('org', 'Org', org, setOrg, editing)}
      {field('space', 'Space', space, setSpace, editing)}
      {field('appName', 'App name', appName, setAppName, editing)}
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="policy" style={labelStyle}>Policy</label>
        <textarea id="policy" value={policy} onChange={(e) => setPolicy(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="creds" style={labelStyle}>
          Credentials (upload KEY=VALUE file){editing && ' — leave empty to keep existing'}
        </label>
        <input id="creds" type="file" onChange={onUpload} style={{ fontSize: 15 }} />
        <MaskedCredList credentials={credentials} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="envfile" style={labelStyle}>Environment variables (upload KEY=VALUE file)</label>
        <input id="envfile" type="file" onChange={onUploadEnv} style={{ fontSize: 15 }} />
        <EnvVarList env={envVars} />
      </div>
      <button type="submit" style={{ fontSize: 17, padding: '10px 24px' }}>
        {editing ? 'Save & Redeploy' : 'Create deployment'}
      </button>
      {error && (
        <div style={{ marginTop: 10, color: '#c33', background: '#fff0f0', border: '1px solid #f3c2c2', padding: 8, fontSize: 15 }}>
          {error}
        </div>
      )}
    </form>
  )
}
