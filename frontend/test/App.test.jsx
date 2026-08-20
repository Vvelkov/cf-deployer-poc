import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from '../src/App.jsx'
import * as api from '../src/api.js'

// Keep network-touching tabs quiet during the shell test.
vi.spyOn(api, 'getConfig').mockResolvedValue({})
vi.spyOn(api, 'listDeployments').mockResolvedValue([])
vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: '' })
vi.spyOn(api, 'openCfStatus').mockImplementation((_mode, onSnapshot) => {
  onSnapshot({ apps: [{ name: 'sbx-poc-sandbox-router', requestedState: 'started', processes: 'web:1/1', routes: 'r' }] })
  return () => {}
})

describe('App', () => {
  it('shows three tabs (CF Status is no longer a tab)', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /deployment/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /a2a/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /cf status/i })).not.toBeInTheDocument()
  })

  it('shows the CF Status side panel on Deployment and A2A, hidden on Configuration', () => {
    render(<App />)
    // Deployment is the default-active? No — Configuration is first. Panel hidden there.
    expect(screen.queryByTestId('cf-status-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /deployment/i }))
    expect(screen.getByTestId('cf-status-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /a2a/i }))
    expect(screen.getByTestId('cf-status-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /configuration/i }))
    expect(screen.queryByTestId('cf-status-panel')).not.toBeInTheDocument()
  })
})
