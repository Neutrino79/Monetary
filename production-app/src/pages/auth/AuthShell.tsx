import type { ReactNode } from "react";
import { appConfig } from "@/config/app";
import { useBranding } from "@/hooks/queries";

export function AuthBrand() {
  const { name, tagline } = useBranding();
  return (
    <div className="mb-6 flex items-center justify-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-ink font-semibold text-paper" style={{ fontFamily: "var(--font-ledger)", fontSize: 19 }}>
        {appConfig.logoMark}
      </span>
      <div className="text-left">
        <div className="text-[17px] font-semibold">{name}</div>
        <div className="text-[11.5px] text-ink-faint">{tagline}</div>
      </div>
    </div>
  );
}

export function AuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-sunken p-5">
      <div className={`w-full ${wide ? "max-w-110" : "max-w-100"}`}>
        <AuthBrand />
        <div className="rounded-2xl border border-line bg-paper-raised p-7 shadow-lg max-[480px]:p-5">{children}</div>
      </div>
    </div>
  );
}
