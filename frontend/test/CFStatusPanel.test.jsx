import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CFStatusPanel from '../src/components/CFStatusPanel.jsx'
import * as api from '../src/api.js'

describe('CFStatusPanel', () => {
  it('renders apps from a snapshot', async () => {
    vi.spyOn(api, 'openCfStatus').mockImplementation((_mode, onSnapshot) => {
      onSnapshot({ apps: [{ name: 'sbx-poc-sandbox-router', requestedState: 'started', processes: 'web:1/1', routes: 'r' }] })
      return () => {}
    })
    render(<CFStatusPanel mode="mock" />)
    await waitFor(() => expect(screen.getByText('sbx-poc-sandbox-router')).toBeInTheDocument())
    expect(screen.getByText('started')).toBeInTheDocument()
    expect(screen.getByTestId('cf-status-panel')).toBeInTheDocument()
  })
})
