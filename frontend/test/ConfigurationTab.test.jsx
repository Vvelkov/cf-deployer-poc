import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ConfigurationTab from '../src/tabs/ConfigurationTab.jsx'
import * as api from '../src/api.js'

describe('ConfigurationTab', () => {
  it('loads config and saves edits', async () => {
    vi.spyOn(api, 'getConfig').mockResolvedValue({ cfApi: 'https://api' })
    const put = vi.spyOn(api, 'putConfig').mockResolvedValue({})
    render(<ConfigurationTab />)
    await waitFor(() => expect(screen.getByLabelText(/CF API URL/i)).toHaveValue('https://api'))
    fireEvent.change(screen.getByLabelText(/Docker Username/i), { target: { value: 'me' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.objectContaining({ dockerUsername: 'me' })))
  })

  it('has a Docker Registry field that is saved', async () => {
    vi.spyOn(api, 'getConfig').mockResolvedValue({})
    const put = vi.spyOn(api, 'putConfig').mockResolvedValue({})
    render(<ConfigurationTab />)
    const reg = await screen.findByLabelText(/Docker Registry/i)
    fireEvent.change(reg, { target: { value: 'reg.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.objectContaining({ dockerRegistry: 'reg.example.com' })))
  })

  it('has a JWT Secret field that is saved', async () => {
    vi.spyOn(api, 'getConfig').mockResolvedValue({})
    const put = vi.spyOn(api, 'putConfig').mockResolvedValue({})
    render(<ConfigurationTab />)
    const jwt = await screen.findByLabelText(/JWT Secret/i)
    fireEvent.change(jwt, { target: { value: 'b722f7d5' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.objectContaining({ jwtSecret: 'b722f7d5' })))
  })
})
