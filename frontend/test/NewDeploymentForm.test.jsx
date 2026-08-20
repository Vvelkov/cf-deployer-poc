import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NewDeploymentForm from '../src/components/NewDeploymentForm.jsx'
import * as api from '../src/api.js'

describe('NewDeploymentForm', () => {
  it('prefills the policy textarea from the default policy', async () => {
    vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: 'version: 1\nallow_github: {}' })
    render(<NewDeploymentForm onCreated={() => {}} />)
    await waitFor(() =>
      expect(screen.getByLabelText(/policy/i).value).toContain('version: 1'))
  })

  it('shows the rejection error and does not call onCreated on 409', async () => {
    vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: '' })
    vi.spyOn(api, 'createDeployment').mockResolvedValue({ error: 'Space gvisor-eval/sandboxed-apps already has a deployment.' })
    const onCreated = vi.fn()
    render(<NewDeploymentForm onCreated={onCreated} />)
    fireEvent.click(screen.getByRole('button', { name: /create deployment/i }))
    await waitFor(() => expect(screen.getByText(/already has a deployment/i)).toBeInTheDocument())
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('uploads an env file, shows full values, and includes them in the payload', async () => {
    vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: '' })
    vi.spyOn(api, 'parseEnv').mockResolvedValue({ env: [{ key: 'LOG_LEVEL', value: 'debug' }, { key: 'REGION', value: 'eu-central-1' }] })
    const create = vi.spyOn(api, 'createDeployment').mockResolvedValue({ id: '1', steps: {} })
    render(<NewDeploymentForm mode="mock" onCreated={() => {}} />)

    const file = new File(['LOG_LEVEL=debug\nREGION=eu-central-1'], 'app.env', { type: 'text/plain' })
    // jsdom's File.text() can be flaky; provide it explicitly.
    file.text = async () => 'LOG_LEVEL=debug\nREGION=eu-central-1'
    fireEvent.change(screen.getByLabelText(/environment variables/i), { target: { files: [file] } })

    // Full values are shown (not masked).
    await waitFor(() => expect(screen.getByText(/LOG_LEVEL=debug/)).toBeInTheDocument())
    expect(screen.getByText(/REGION=eu-central-1/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /create deployment/i }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      envVars: [{ key: 'LOG_LEVEL', value: 'debug' }, { key: 'REGION', value: 'eu-central-1' }],
    })))
  })

  it('uploads credentials, shows masked values, and sends raw text (not raw values in DOM)', async () => {
    vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: '' })
    vi.spyOn(api, 'parseCredentials').mockResolvedValue({ credentials: [{ key: 'API_KEY', masked: 'supe…' }] })
    const create = vi.spyOn(api, 'createDeployment').mockResolvedValue({ id: '1', steps: {} })
    render(<NewDeploymentForm mode="mock" onCreated={() => {}} />)

    const file = new File(['API_KEY=supersecret'], 'creds.env', { type: 'text/plain' })
    file.text = async () => 'API_KEY=supersecret'
    fireEvent.change(screen.getByLabelText(/credentials/i), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText(/API_KEY=supe/)).toBeInTheDocument())
    expect(screen.queryByText(/supersecret/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /create deployment/i }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      credentialsText: 'API_KEY=supersecret',
    })))
  })
})
