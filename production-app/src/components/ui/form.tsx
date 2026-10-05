import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactElement } from "react";
import { forwardRef, useId, isValidElement, cloneElement } from "react";
import { cn } from "@/lib/utils/cn";
import { appConfig } from "@/config/app";

const fieldBase =
  "w-full rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2.5 text-[13.3px] text-ink transition-colors focus:border-focus-ring focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-18 resize-y", className)} {...props} />;
});

export function AmountInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">{appConfig.currencySymbol}</span>
      <Input type="number" min={0} step={0.01} className={cn("pl-6.5", className)} {...props} />
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
  const control = isValidElement(children) && !childId ? cloneElement(children, { id: fieldId }) : children;

  return (
    <div className={cn("flex flex-col gap-1.5", full && "col-span-full")}>
      <label htmlFor={fieldId} className="text-[12.5px] font-semibold text-ink-soft">
        {label}
      </label>
      {control}
      {hint && !error && <p className="text-[12px] text-ink-faint">{hint}</p>}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
