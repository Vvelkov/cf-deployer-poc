import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StepProgress from '../src/components/StepProgress.jsx'

describe('StepProgress', () => {
  it('shows the full log on failure, not just the last few lines', () => {
    const log = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\ndocker not found'
    render(<StepProgress name="Sandboxify" step={{ status: 'failed', log, exitCode: 1 }} />)
    // An early line that a 4-line tail would have dropped is still present.
    expect(screen.getByText(/line 1\b/)).toBeInTheDocument()
    expect(screen.getByText(/docker not found/)).toBeInTheDocument()
  })

  it('surfaces the exit code when a step failed', () => {
    render(<StepProgress name="Deploy to CF" step={{ status: 'failed', log: 'boom', exitCode: 42 }} />)
    expect(screen.getByText(/exit code 42/i)).toBeInTheDocument()
  })
})
