import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TallyMarks } from '../TallyMarks'

const strokes = (c: HTMLElement) => c.querySelectorAll('[data-stroke]')

describe('TallyMarks', () => {
  it('draws one stroke per 5%', () => {
    const { container } = render(<TallyMarks percent={68} seed="a" label="Holiday 2026, 68% saved, £640 to go" />)
    expect(strokes(container)).toHaveLength(13)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Holiday 2026, 68% saved, £640 to go')
  })
  it('caps at 20', () => {
    expect(strokes(render(<TallyMarks percent={100} seed="a" label="x" />).container)).toHaveLength(20)
    expect(strokes(render(<TallyMarks percent={140} seed="a" label="x" />).container)).toHaveLength(20)
  })
  it('zero keeps the label', () => {
    const { container } = render(<TallyMarks percent={0} seed="a" label="Empty" />)
    expect(strokes(container)).toHaveLength(0)
    expect(screen.getByRole('img', { name: 'Empty' })).toBeInTheDocument()
  })
  it('is stable for the same seed', () => {
    const a = render(<TallyMarks percent={50} seed="same" label="x" />).container.innerHTML
    const b = render(<TallyMarks percent={50} seed="same" label="x" />).container.innerHTML
    expect(a).toBe(b)
  })
})
