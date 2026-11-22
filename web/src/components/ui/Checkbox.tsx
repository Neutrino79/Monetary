import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/** The one checkbox: same size and colour wherever a list lets you pick rows. */
export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="checkbox" className={cn("h-4 w-4 flex-none cursor-pointer rounded-[4px] accent-[var(--accent)]", className)} {...props} />;
}
