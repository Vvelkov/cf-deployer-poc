import React, { useEffect, useState } from 'react'
import { listDeployments, sendA2A } from '../api.js'

// Pull the human-readable agent text out of an A2A response, falling back to
// pretty-printed JSON when the shape isn't what we expect. Handles both the
// task shape (result.artifacts[].parts[].text) and the direct-message shape
// (result.message.parts[].text).
function extractText(body) {
  try {
    const r = body?.result
    const parts = r?.artifacts?.[0]?.parts || r?.message?.parts
    const text = parts?.map((p) => p.text).filter(Boolean).join('\n')
    if (text) return text
  } catch { /* fall through */ }
  return null
}

export default function A2AClientTab() {
  const [deployments, setDeployments] = useState([])
  const [selected, setSelected] = useState('')
  const [tenant, setTenant] = useState('')
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    listDeployments().then((list) => {
      setDeployments(list)
      if (list.length) setSelected(list[0].id)
    })
  }, [])

  const onSend = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await sendA2A(selected, { tenant, message })
      setResponse(r.body ?? r)
    } finally {
      setLoading(false)
    }
  }

  const labelStyle = { display: 'block', fontSize: 18, fontWeight: 600, marginBottom: 6 }
  const controlStyle = { width: '100%', padding: 8, fontSize: 16 }

  const text = response ? extractText(response) : null

  return (
    <form onSubmit={onSend}>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="deployment" style={labelStyle}>Deployment</label>
        <select id="deployment" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...controlStyle, width: 'auto' }}>
          {deployments.map((d) => <option key={d.id} value={d.id}>{d.appName}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="tenant" style={labelStyle}>Tenant</label>
        <input id="tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} style={controlStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="message" style={labelStyle}>Message</label>
        <textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={8} style={{ ...controlStyle, lineHeight: 1.4 }} />
      </div>
      <button type="submit" disabled={loading} style={{ fontSize: 16, padding: '8px 20px' }}>
        {loading ? 'Sending…' : 'Send'}
      </button>

      {loading && (
        <div role="status" style={{ marginTop: 14, fontSize: 16, color: '#c80' }}>
          ⏳ Waiting for the agent to respond… (this can take a while)
        </div>
      )}

      {!loading && text && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Agent response</div>
          <div style={{ background: '#f5f7f5', border: '1px solid #cfe3cf', padding: 12, fontSize: 18, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {text}
          </div>
        </div>
      )}

      {!loading && response && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 14, cursor: 'pointer', color: '#666' }}>Raw response</summary>
          <pre style={{ background: '#f5f5f5', padding: 8, fontSize: 13, marginTop: 8, overflowX: 'auto' }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        </details>
      )}
    </form>
  )
}
