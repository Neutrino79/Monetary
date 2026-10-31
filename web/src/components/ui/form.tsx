import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactElement } from "react";
import { forwardRef, useId, isValidElement, cloneElement } from "react";
import { cn } from "@/lib/utils/cn";
import { currencySymbol } from "@/lib/utils/format";

import { fieldBase } from "@/components/ui/Select";

export { Select } from "@/components/ui/Select";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-18 resize-y", className)} {...props} />;
});

const DECIMAL = /^\d*\.?\d{0,2}$/;

/**
 * A money-style number box: plain text with a decimal keypad on phones, so there are no spinner arrows
 * and the mouse wheel can't change the value. Anything that isn't digits plus up to two decimals is ignored.
 */
export const DecimalInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "min" | "max" | "step">>(function DecimalInput({ onChange, ...props }, ref) {
  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      onChange={(e) => {
        if (DECIMAL.test(e.target.value)) onChange?.(e);
      }}
      {...props}
    />
  );
});

export function AmountInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "min" | "max" | "step"> & { max?: number; min?: number }) {
  const { max: _max, min: _min, ...rest } = props;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">{currencySymbol()}</span>
      <DecimalInput className={cn("pl-6.5", className)} {...rest} />
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  full,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  full?: boolean;
  children: ReactElement<{ id?: string }>;
}) {
  // Every field gets a stable, unique id so the <label> is always correctly
  // associated with its control — callers no longer need to hand-thread
  // htmlFor/id pairs (and tests/screen readers can find fields by label).
  const generatedId = useId();
  const childId = isValidElement(children) ? (children.props as { id?: string }).id : undefined;
  const fieldId = htmlFor ?? childId ?? generatedId;
  const extra: { id?: string; "aria-invalid"?: boolean } = {};
  if (!childId) extra.id = fieldId;
  if (error) extra["aria-invalid"] = true; // lets the control draw a red border
  const control = isValidElement(children) && Object.keys(extra).length ? cloneElement(children, extra) : children;

  return (
    <div className={cn("flex flex-col gap-1.5", full && "col-span-full")}>
      <label htmlFor={fieldId} className="text-caption font-semibold text-ink-soft">
        {label}
      </label>
      {control}
      {hint && !error && <p className="text-caption text-ink-faint">{hint}</p>}
      {error && <span className="text-caption text-danger">{error}</span>}
    </div>
  );
}
