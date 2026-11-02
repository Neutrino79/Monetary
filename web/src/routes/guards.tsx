import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useBranding } from "@/hooks/queries";
import { Button } from "@/components/ui/Button";

function HydratingScreen() {
  const { name } = useBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" />
        <span className="text-caption text-ink-faint">Loading {name}…</span>
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
        <p className="mb-5 text-body text-ink-faint">{message}</p>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { isHydrating, isAuthenticated, hydrateError, hydrate } = useAuthStore();
  if (isHydrating) return <HydratingScreen />;
  if (hydrateError) return <UnreachableScreen message={hydrateError} onRetry={hydrate} />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function GuestOnlyRoute() {
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isHydrating) return <HydratingScreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
