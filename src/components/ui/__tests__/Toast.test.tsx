import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '../Toast'

function Trigger({ undo }: { undo?: () => void }) {
  const toast = useToast()
  return <button onClick={() => toast.show('Expense saved', undo ? { undo } : undefined)}>go</button>
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('Undo calls back once and closes', () => {
    const undo = vi.fn()
    render(<ToastProvider><Trigger undo={undo} /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByText('Expense saved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Expense saved')).toBeNull()
  })
  it('disappears after 5 seconds with no Undo button when none given', () => {
    render(<ToastProvider><Trigger /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    act(() => { vi.advanceTimersByTime(5001) })
    expect(screen.queryByText('Expense saved')).toBeNull()
  })
})
