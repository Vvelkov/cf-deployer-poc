import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import A2AClientTab from '../src/tabs/A2AClientTab.jsx'
import * as api from '../src/api.js'

describe('A2AClientTab', () => {
  it('sends tenant + message and shows the response', async () => {
    vi.spyOn(api, 'listDeployments').mockResolvedValue([{ id: '1', appName: 'app', routerUrl: 'https://r' }])
    const send = vi.spyOn(api, 'sendA2A').mockResolvedValue({ status: 200, body: { ok: true } })
    render(<A2AClientTab />)
    await waitFor(() => screen.getByLabelText(/tenant/i))
    fireEvent.change(screen.getByLabelText(/tenant/i), { target: { value: 't1' } })
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('1', { tenant: 't1', message: 'hi' }))
    await waitFor(() => expect(screen.getByText(/"ok": true/)).toBeInTheDocument())
  })

  it('extracts and displays the agent text from result.artifacts', async () => {
    vi.spyOn(api, 'listDeployments').mockResolvedValue([{ id: '1', appName: 'app', routerUrl: 'https://r' }])
    vi.spyOn(api, 'sendA2A').mockResolvedValue({
      status: 200,
      body: { result: { artifacts: [{ parts: [{ kind: 'text', text: 'Here are the open issues: #1, #2' }] }] } },
    })
    render(<A2AClientTab />)
    await waitFor(() => screen.getByLabelText(/tenant/i))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText('Here are the open issues: #1, #2')).toBeInTheDocument())
    expect(screen.getByText(/agent response/i)).toBeInTheDocument()
  })

  it('shows a waiting indicator while the request is in flight', async () => {
    vi.spyOn(api, 'listDeployments').mockResolvedValue([{ id: '1', appName: 'app', routerUrl: 'https://r' }])
    let resolveSend
    vi.spyOn(api, 'sendA2A').mockReturnValue(new Promise((res) => { resolveSend = res }))
    render(<A2AClientTab />)
    await waitFor(() => screen.getByLabelText(/tenant/i))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    // While pending: status indicator visible, button shows Sending…
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/waiting for the agent/i))
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
    // Resolve and confirm the indicator clears.
    resolveSend({ status: 200, body: { result: { artifacts: [{ parts: [{ text: 'done' }] }] } } })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
})
