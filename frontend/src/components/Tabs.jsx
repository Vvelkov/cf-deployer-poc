import React, { useState, useEffect } from 'react'

// Accessible tab bar. `tabs` is [{ id, label, render }]. Renders the active
// panel below the tab list. Optional `onActiveChange(id)` fires on mount and
// whenever the active tab changes, so a parent can react to the selection
// (e.g. show a side panel on some tabs only).
export default function Tabs({ tabs, onActiveChange }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    onActiveChange?.(tabs[active]?.id)
  }, [active, tabs, onActiveChange])

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 8, borderBottom: '1px solid #ccc' }}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: i === active ? '3px solid #0a7' : '3px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 20,
              fontWeight: i === active ? 700 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ padding: 16 }}>
        {tabs[active].render()}
      </div>
    </div>
  )
}
