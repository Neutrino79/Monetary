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
  primary: "bg-ink text-paper hover:opacity-90 dark:bg-accent dark:text-accent-ink",
  secondary: "bg-paper-sunken text-ink border border-line hover:border-line-strong",
  ghost: "bg-transparent text-ink-soft hover:bg-paper-sunken hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", block, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        size === "md" ? "px-4 py-2.5 text-[13.5px]" : "px-3 py-1.5 text-[12.5px]",
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
