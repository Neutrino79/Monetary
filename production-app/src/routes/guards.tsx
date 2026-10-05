import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { appConfig } from "@/config/app";

function HydratingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" />
        <span className="text-[12.5px] text-ink-faint">Loading {appConfig.name}…</span>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isHydrating) return <HydratingScreen />;
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
