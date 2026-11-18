import { Navigate, Outlet } from "react-router-dom";
import { selectIsAdmin, useAuthStore } from "@/store/authStore";
import { useBranding, useDemoMode } from "@/hooks/queries";
import { Button } from "@/components/ui/Button";
import { PasswordChangeRequiredPage } from "@/pages/auth/PasswordChangeRequiredPage";

function HydratingScreen() {
  const { name } = useBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" />
        <span className="text-[12.5px] text-ink-faint">Loading {name}…</span>
      </div>
    </div>
  );
}

function UnreachableScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { name } = useBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-[17px] font-semibold">Can't reach {name}</h1>
        <p className="mb-5 text-[13px] text-ink-faint">{message}</p>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { isHydrating, isAuthenticated, hydrateError, hydrate, account } = useAuthStore();
  if (isHydrating) return <HydratingScreen />;
  if (hydrateError) return <UnreachableScreen message={hydrateError} onRetry={hydrate} />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // A temporary password (set by an administrator) must be replaced before anything else is reachable.
  if (account?.mustChangePassword) return <PasswordChangeRequiredPage />;
  return <Outlet />;
}

export function GuestOnlyRoute() {
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isHydrating) return <HydratingScreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Only superusers reach the Admin area; everyone else goes back to their own ledger. (The server checks too.) */
export function AdminRoute() {
  const isAdmin = useAuthStore(selectIsAdmin);
  const { isDemo } = useDemoMode();
  if (!isAdmin || isDemo) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
