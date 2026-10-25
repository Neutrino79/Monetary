import { expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

type User = ReturnType<typeof userEvent.setup>

/** Opens a custom Select and picks the option with the given value (what `user.selectOptions` did for a native one). */
export async function selectValue(user: User, trigger: HTMLElement, value: string) {
  await user.click(trigger)
  const list = await screen.findByRole('listbox')
  const find = () => list.querySelector<HTMLElement>(`[role="option"][data-value="${CSS.escape(value)}"]`)
  // Options can arrive after the first render (they come from the API), so wait for this one.
  await waitFor(() => expect(find(), `No option with value "${value}"`).not.toBeNull())
  await user.click(find()!)
}

/** Opens a custom Select and picks the option whose visible text matches. */
export async function selectLabel(user: User, trigger: HTMLElement, name: string | RegExp) {
  await user.click(trigger)
  await user.click(await screen.findByRole('option', { name }))
}
