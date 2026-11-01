import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormField, Input } from '@/components/ui/form'

function Demo({ a, b }: { a?: string; b?: string }) {
  return (
    <form>
      <FormField label="Amount" error={a}><Input /></FormField>
      <FormField label="Name" error={b}><Input /></FormField>
    </form>
  )
}

describe('FormField error focus', () => {
  it('moves focus to the first invalid field when errors appear', () => {
    const { rerender } = render(<Demo />)
    rerender(<Demo a="Enter an amount" b="Enter a name" />)
    expect(screen.getByLabelText('Amount')).toHaveFocus()
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('focuses the only invalid field and does not steal focus back while it is being fixed', () => {
    const { rerender } = render(<Demo />)
    rerender(<Demo b="Enter a name" />)
    expect(screen.getByLabelText('Name')).toHaveFocus()
    screen.getByLabelText('Amount').focus()
    rerender(<Demo b="Still needs a name" />)
    expect(screen.getByLabelText('Amount')).toHaveFocus()
  })
})
