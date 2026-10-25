import { useState } from "react";

export type FieldErrors = Record<string, string>;

/**
 * Field errors that go away on their own. Each error remembers what its field held when it was raised
 * and is hidden as soon as that changes, so correcting a field clears its message straight away and
 * nothing else on the form is affected.
 *
 * `watch` maps an error key to the value(s) the error depends on (for example `shares` depends on the
 * amount and every share). Keys not listed fall back to `watch["*"]` (the whole form), which suits
 * form-level messages.
 */
export function useFormErrors(watch: Record<string, unknown>) {
  const [state, setState] = useState<{ errors: FieldErrors; snap: Record<string, string> }>({ errors: {}, snap: {} });
  const sig = (key: string) => JSON.stringify(key in watch ? watch[key] : watch["*"]) ?? "";

  const errors: FieldErrors = {};
  for (const [key, message] of Object.entries(state.errors)) {
    if (state.snap[key] === sig(key)) errors[key] = message;
  }

  function setErrors(next: FieldErrors) {
    setState({ errors: next, snap: Object.fromEntries(Object.keys(next).map((k) => [k, sig(k)])) });
  }
  return { errors, setErrors, clearErrors: () => setState({ errors: {}, snap: {} }) };
}

/** The same for a form that shows one message: hidden once any watched value changes. */
export function useFormError(watch: unknown) {
  const { errors, setErrors } = useFormErrors({ "*": watch });
  return [errors.error ?? "", (message: string) => setErrors(message ? { error: message } : {})] as const;
}
