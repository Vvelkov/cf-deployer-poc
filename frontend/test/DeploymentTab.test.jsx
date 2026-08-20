import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DeploymentTab from '../src/tabs/DeploymentTab.jsx'
import * as api from '../src/api.js'

describe('DeploymentTab', () => {
  it('starts empty and reveals the New form', async () => {
    vi.spyOn(api, 'listDeployments').mockResolvedValue([])
    vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: '' })
    render(<DeploymentTab mode="mock" />)
    await waitFor(() => expect(screen.getByText(/no deployments/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByLabelText(/container image/i)).toBeInTheDocument()
  })

  it('deletes a deployment after confirm, then removes the card', async () => {
    const dep = {
      id: '1', appName: 'app', image: 'i', routerUrl: null,
      steps: { sandboxify: { status: 'done', log: '' }, deploy: { status: 'done', log: '' }, undeploy: { status: 'pending', log: '' } },
    }
    vi.spyOn(api, 'listDeployments').mockResolvedValue([dep])
    vi.spyOn(api, 'undeployDeployment').mockResolvedValue({ ...dep })
    vi.spyOn(api, 'openUndeployEvents').mockImplementation((id, onEvent) => {
      onEvent({ removed: true, done: true })
      return () => {}
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<DeploymentTab mode="mock" />)
    await waitFor(() => expect(screen.getByText(/app — i/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(api.undeployDeployment).toHaveBeenCalledWith('1'))
    await waitFor(() => expect(screen.queryByText(/app — i/)).not.toBeInTheDocument())
  })

  it('does not delete when confirm is cancelled', async () => {
    const dep = {
      id: '1', appName: 'app', image: 'i', routerUrl: null,
      steps: { sandboxify: { status: 'done', log: '' }, deploy: { status: 'done', log: '' }, undeploy: { status: 'pending', log: '' } },
    }
    vi.spyOn(api, 'listDeployments').mockResolvedValue([dep])
    const undeploy = vi.spyOn(api, 'undeployDeployment').mockResolvedValue({})
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<DeploymentTab mode="mock" />)
    await waitFor(() => expect(screen.getByText(/app — i/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(undeploy).not.toHaveBeenCalled()
  })

  it('edits a deployment and triggers a redeploy with the edited policy', async () => {
    const dep = {
      id: '1', appName: 'app', image: 'old-img', org: 'o', space: 'sp', policy: 'old-policy',
      credentials: [], envVars: [], routerUrl: null,
      steps: { sandboxify: { status: 'done', log: '' }, deploy: { status: 'done', log: '' }, undeploy: { status: 'pending', log: '' } },
    }
    vi.spyOn(api, 'listDeployments').mockResolvedValue([dep])
    const redeploy = vi.spyOn(api, 'redeployDeployment').mockResolvedValue({
      ...dep, image: 'old-img', policy: 'new-policy',
      steps: { sandboxify: { status: 'pending', log: '' }, deploy: { status: 'pending', log: '' }, undeploy: { status: 'pending', log: '' } },
    })
    vi.spyOn(api, 'openDeploymentEvents').mockImplementation(() => () => {})

    render(<DeploymentTab mode="mock" />)
    await waitFor(() => expect(screen.getByText(/app — old-img/)).toBeInTheDocument())

    // Open edit; org/space/app-name are read-only, policy prefilled+editable.
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    const policyBox = await screen.findByLabelText(/policy/i)
    expect(policyBox.value).toBe('old-policy')
    expect(screen.getByLabelText(/^org/i)).toHaveAttribute('readonly')

    fireEvent.change(policyBox, { target: { value: 'new-policy' } })
    fireEvent.click(screen.getByRole('button', { name: /save & redeploy/i }))

    await waitFor(() => expect(redeploy).toHaveBeenCalledWith('1', expect.objectContaining({ policy: 'new-policy' })))
  })
})
