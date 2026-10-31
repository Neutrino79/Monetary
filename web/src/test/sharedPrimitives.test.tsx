import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadFailed, SectionLabel } from '@/components/ui/primitives'
import { FilterChip, Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/utils/cn'

describe('shared primitives', () => {
  it('LoadFailed names what failed, shows the reason and retries', async () => {
    const retry = vi.fn()
    render(<LoadFailed what="budgets" error={new Error('Server said no')} onRetry={retry} />)
    expect(screen.getByText("Couldn't load budgets")).toBeInTheDocument()
    expect(screen.getByText('Server said no')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('LoadFailed has no Retry button without a handler and falls back to a generic reason', () => {
    render(<LoadFailed what="the outlook" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Try again in a moment.')).toBeInTheDocument()
  })

  it('Segmented marks the current choice and reports a new one', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Paid by" value="all" onChange={onChange} options={[{ value: 'all', label: 'All' }, { value: 'me', label: 'Me' }]} />)
    expect(screen.getByRole('group', { name: 'Paid by' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Me' }))
    expect(onChange).toHaveBeenCalledWith('me')
  })

  it('FilterChip toggles through aria-pressed', async () => {
    const onClick = vi.fn()
    render(<FilterChip active onClick={onClick}>Out</FilterChip>)
    expect(screen.getByRole('button', { name: 'Out' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Out' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('SectionLabel renders its text', () => {
    render(<SectionLabel>Tags</SectionLabel>)
    expect(screen.getByText('Tags')).toBeInTheDocument()
  })

  it('the class merger keeps a type token and a colour together but resolves two sizes', () => {
    expect(cn('text-caption text-ink-faint')).toBe('text-caption text-ink-faint')
    expect(cn('text-caption', 'text-body')).toBe('text-body')
    expect(cn('rounded-control', 'rounded-card')).toBe('rounded-card')
  })
})
