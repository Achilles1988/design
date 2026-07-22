// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AssetFilterChips } from './AssetFilterChips'
import { chipId, type Filter } from '@/lib/ai/filterState'

afterEach(() => {
  cleanup()
})

const filter: Filter = {
  chips: [
    { id: chipId('tag', 'spec'), kind: 'tag', label: 'spec', value: 'spec', addedBy: 'ai' },
    { id: chipId('freeform', 'dark|neon'), kind: 'freeform', label: '冷色调', value: 'dark|neon', addedBy: 'user' },
  ],
}

describe('AssetFilterChips', () => {
  it('renders one chip per entry', () => {
    render(<AssetFilterChips filter={filter} onRemove={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByText('spec')).toBeTruthy()
    expect(screen.getByText('冷色调')).toBeTruthy()
  })

  it('fires onRemove with chip id', () => {
    const onRemove = vi.fn()
    render(<AssetFilterChips filter={filter} onRemove={onRemove} onReset={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Remove spec/i))
    expect(onRemove).toHaveBeenCalledWith(chipId('tag', 'spec'))
  })

  it('fires onReset', () => {
    const onReset = vi.fn()
    render(<AssetFilterChips filter={filter} onRemove={vi.fn()} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset all/i }))
    expect(onReset).toHaveBeenCalled()
  })

  it('renders nothing when filter empty', () => {
    const { container } = render(
      <AssetFilterChips filter={{ chips: [] }} onRemove={vi.fn()} onReset={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
