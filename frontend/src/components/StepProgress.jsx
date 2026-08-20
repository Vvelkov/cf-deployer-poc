import React from 'react'

const COLOR = { pending: '#999', running: '#c80', done: '#0a7', failed: '#c33' }

// Shows one step's status and its log. While running/succeeding we show only
// the last few lines to keep the card compact; on failure we show the FULL log
// (scrollable) plus the exit code, so the real error is never hidden.
export default function StepProgress({ name, step }) {
  const failed = step.status === 'failed'
  const lines = (step.log || '').split('\n')
  const shown = failed ? lines.join('\n') : lines.slice(-4).join('\n')
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600 }}>
        {name}: <span style={{ color: COLOR[step.status] }}>{step.status}</span>
        {failed && step.exitCode !== undefined && (
          <span style={{ color: COLOR.failed, marginLeft: 8, fontWeight: 400 }}>
            (exit code {step.exitCode})
          </span>
        )}
      </div>
      {shown && (
        <pre
          style={{
            background: failed ? '#fff0f0' : '#f5f5f5',
            border: failed ? '1px solid #f3c2c2' : 'none',
            padding: 8,
            fontSize: 12,
            overflow: 'auto',
            maxHeight: failed ? 320 : 'none',
            margin: '4px 0',
            whiteSpace: 'pre-wrap',
          }}
        >
          {shown}
        </pre>
      )}
    </div>
  )
}
