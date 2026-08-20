import React, { useEffect, useState } from 'react'
import { getConfig, putConfig } from '../api.js'

const FIELDS = [
  { key: 'cfApi', label: 'CF API URL', type: 'text' },
  { key: 'cfUsername', label: 'CF Username', type: 'text' },
  { key: 'cfPassword', label: 'CF Password', type: 'password' },
  { key: 'dockerRegistry', label: 'Docker Registry', type: 'text' },
  { key: 'dockerUsername', label: 'Docker Username', type: 'text' },
  { key: 'dockerPassword', label: 'Docker Password', type: 'password' },
  { key: 'jwtSecret', label: 'JWT Secret', type: 'password' },
]

export default function ConfigurationTab() {
  const [values, setValues] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { getConfig().then((c) => setValues(c || {})) }, [])

  const onChange = (key) => (e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setSaved(false) }
  const onSave = async () => { await putConfig(values); setSaved(true) }

  return (
    <div>
      <p style={{ color: '#666', fontSize: 13 }}>
        Credentials for the private registry and Cloud Foundry landscape. Kept in memory only.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); onSave() }}>
        {FIELDS.map((f) => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label htmlFor={f.key} style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{f.label}</label>
            <input
              id={f.key}
              type={f.type}
              value={values[f.key] || ''}
              onChange={onChange(f.key)}
              style={{ width: '100%', padding: 6 }}
            />
          </div>
        ))}
        <button type="submit">Save</button>
        {saved && <span style={{ marginLeft: 8, color: '#0a7' }}>Saved</span>}
      </form>
    </div>
  )
}
