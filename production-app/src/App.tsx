import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, GuestOnlyRoute } from "@/routes/guards";
import { AppShell } from "@/components/layout/AppShell";
import { appConfig } from "@/config/app";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("@/pages/auth/SignupPage").then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));

const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage").then((m) => ({ default: m.TransactionsPage })));
const IncomePage = lazy(() => import("@/pages/IncomePage").then((m) => ({ default: m.IncomePage })));
const ExpensesPage = lazy(() => import("@/pages/ExpensesPage").then((m) => ({ default: m.ExpensesPage })));
const TransfersPage = lazy(() => import("@/pages/TransfersPage").then((m) => ({ default: m.TransfersPage })));
const SplitsPage = lazy(() => import("@/pages/SplitsPage").then((m) => ({ default: m.SplitsPage })));
const FriendsPage = lazy(() => import("@/pages/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const AccountsPage = lazy(() => import("@/pages/AccountsPage").then((m) => ({ default: m.AccountsPage })));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" aria-label={`Loading ${appConfig.name}…`} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<GuestOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/income" element={<IncomePage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/splits" element={<SplitsPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
