import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./primitives";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onOpenChange, title, subtitle, children, footer, size = "md" }: BaseProps & { size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClass = { sm: "max-w-[400px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[900px]" }[size];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[81] w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-raised shadow-2xl flex flex-col max-h-[92vh]",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95",
            sizeClass,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-semibold text-ink">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="mt-0.5 text-[12.5px] text-ink-faint">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label="Close">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface DrawerProps extends BaseProps {
  /** Small line above the title (a type, a date). */
  eyebrow?: string;
  /** Keep the title for screen readers only, when the body already shows it as its headline. */
  hideTitle?: boolean;
  /** A fixed block under the header that does not scroll with the body (a balance, a summary). */
  hero?: ReactNode;
}

/**
 * Detail panel: slides in from the right on a wide screen and rises from the bottom as a sheet on a phone.
 * The header and the action bar stay put; only the body scrolls.
 */
export function Drawer({ open, onOpenChange, title, subtitle, eyebrow, hideTitle, hero, children, footer }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className={cn(
            "drawer-panel fixed z-[81] flex flex-col bg-paper-raised shadow-2xl outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[22px]",
            "sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-[440px] sm:rounded-none",
          )}
        >
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-line-strong" />
          </div>
          <div className={cn("flex items-start justify-between gap-3 px-5 pb-3 pt-2 sm:pt-4", !hero && "border-b border-line")}>
            <div className="min-w-0">
              {eyebrow && <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">{eyebrow}</div>}
              <Dialog.Title className={cn("text-[17px] font-semibold text-ink", hideTitle && "sr-only")}>{title}</Dialog.Title>
              {subtitle ? (
                <Dialog.Description className="mt-0.5 text-[12.5px] text-ink-faint">{subtitle}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label="Close" className="-mr-2 -mt-1 h-11 w-11">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          {hero}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
          {footer && (
            <div className="flex gap-2 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:justify-end sm:pb-4 [&>*]:min-h-11 [&>*]:flex-1 sm:[&>*]:flex-none">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Dialog.Close asChild>
            <button className="rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft hover:bg-paper-sunken">Cancel</button>
          </Dialog.Close>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={cn(
              "rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white",
              variant === "danger" ? "bg-danger hover:opacity-90" : "bg-ink hover:opacity-90",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="leading-relaxed text-ink-soft">{message}</p>
    </Modal>
  );
}
