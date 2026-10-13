import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../Button'

describe('Button', () => {
  it('ignores repeat taps while an async action is running, then works again', async () => {
    let finish!: () => void
    const onClick = vi.fn(() => new Promise<void>((r) => (finish = r)))
    render(<Button onClick={onClick}>Save expense</Button>)
    const b = screen.getByRole('button', { name: 'Save expense' })
    fireEvent.click(b)
    fireEvent.click(b) // same tick, before React re-renders
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b).toBeDisabled()
    finish()
    await waitFor(() => expect(b).toBeEnabled())
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(2)
  })
  it('recovers after a failed action', async () => {
    const onClick = vi.fn(async () => {
      throw new Error('nope')
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    errors.mockRestore()
  })
  it('leaves synchronous handlers alone', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Open</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onClick).toHaveBeenCalledTimes(2)
  })
})
