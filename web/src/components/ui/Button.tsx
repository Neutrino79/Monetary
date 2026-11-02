import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-btn text-btn-ink hover:opacity-90",
  secondary: "bg-paper-sunken text-ink border border-line hover:border-line-strong",
  ghost: "bg-transparent text-ink-soft hover:bg-paper-sunken hover:text-ink",
  danger: "bg-danger text-danger-ink hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", block, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        size === "md" ? "px-4 py-2.5 text-body pointer-coarse:min-h-11" : "px-3 py-1.5 text-caption pointer-coarse:min-h-11",
        variantClasses[variant],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
