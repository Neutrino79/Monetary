import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { Check, TriangleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variant = "default" | "success" | "error" | "warning";

interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (message: string, opts?: { variant?: Variant; action?: ToastItem["action"] }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const VARIANT_ICON: Record<Variant, ReactNode> = {
  default: <Info size={16} />,
  success: <Check size={16} />,
  error: <TriangleAlert size={16} />,
  warning: <TriangleAlert size={16} />,
};
const VARIANT_ICON_CLASS: Record<Variant, string> = {
  default: "text-ink-faint",
  success: "text-[#6FDBA8]",
  error: "text-[#F09A9A]",
  warning: "text-[#F0CE7C]",
};

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback<ToastContextValue["show"]>((message, opts) => {
    const id = ++idCounter;
    const item: ToastItem = { id, message, variant: opts?.variant ?? "default", action: opts?.action };
    setItems((prev) => [...prev, item]);
    const timer = setTimeout(() => remove(id), 4200);
    timers.current.set(id, timer);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ show }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            className={cn(
              "flex items-start gap-3 rounded-control bg-ink px-3.5 py-3 text-paper shadow-2xl",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=open]:fade-in",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out",
              "data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right",
            )}
            duration={4200}
            onOpenChange={(open) => !open && remove(item.id)}
          >
            <span className={cn("mt-0.5", VARIANT_ICON_CLASS[item.variant])}>{VARIANT_ICON[item.variant]}</span>
            <div className="flex-1">
              <ToastPrimitive.Description className="text-body">{item.message}</ToastPrimitive.Description>
              {item.action && (
                <ToastPrimitive.Action asChild altText={item.action.label}>
                  <button onClick={item.action.onClick} className="mt-1 text-caption font-bold text-[#9FD8FF]">
                    {item.action.label}
                  </button>
                </ToastPrimitive.Action>
              )}
            </div>
            <ToastPrimitive.Close aria-label="Dismiss" className="text-base leading-none text-white/60 hover:text-white">
              ✕
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-5 right-5 z-[100] flex w-90 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
