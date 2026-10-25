import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFormErrors, useFormError } from '@/lib/hooks/useFormErrors'

function Form() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const { errors, setErrors } = useFormErrors({ a, b, sum: [a, b], '*': [a, b] })
  return (
    <div>
      <input aria-label="a" value={a} onChange={(e) => setA(e.target.value)} />
      <input aria-label="b" value={b} onChange={(e) => setB(e.target.value)} />
      <button onClick={() => setErrors({ a: 'A needed', b: 'B needed', sum: 'Too small', form: 'Server said no' })}>go</button>
      {Object.entries(errors).map(([k, m]) => (
        <p key={k}>{m}</p>
      ))}
    </div>
  )
}

describe('useFormErrors', () => {
  it('hides each error when the value it depends on changes, and only that one', async () => {
    const user = userEvent.setup()
    render(<Form />)
    await user.click(screen.getByText('go'))
    expect(screen.getAllByRole('paragraph')).toHaveLength(4)
    await user.type(screen.getByLabelText('a'), 'x')
    expect(screen.queryByText('A needed')).not.toBeInTheDocument()
    expect(screen.getByText('B needed')).toBeInTheDocument()
    expect(screen.queryByText('Too small')).not.toBeInTheDocument() // depends on a and b
    expect(screen.queryByText('Server said no')).not.toBeInTheDocument() // form-level: any edit
  })
})

function One() {
  const [v, setV] = useState('')
  const [error, setError] = useFormError(v)
  return (
    <div>
      <input aria-label="v" value={v} onChange={(e) => setV(e.target.value)} />
      <button onClick={() => setError('Bad')}>go</button>
      {error && <p>{error}</p>}
    </div>
  )
}

describe('useFormError', () => {
  it('shows one message until the form changes', async () => {
    const user = userEvent.setup()
    render(<One />)
    await user.click(screen.getByText('go'))
    expect(screen.getByText('Bad')).toBeInTheDocument()
    await user.type(screen.getByLabelText('v'), 'q')
    expect(screen.queryByText('Bad')).not.toBeInTheDocument()
  })
})
