import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, GuestOnlyRoute } from "@/routes/guards";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { ComingSoonPage } from "@/pages/ComingSoonPage";

export default function App() {
  return (
    <BrowserRouter>
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
            <Route path="/income" element={<ComingSoonPage title="Income" />} />
            <Route path="/expenses" element={<ComingSoonPage title="Expenses" />} />
            <Route path="/transfers" element={<ComingSoonPage title="Transfers" />} />
            <Route path="/splits" element={<ComingSoonPage title="Splits" />} />
            <Route path="/friends" element={<ComingSoonPage title="Friends" />} />
            <Route path="/accounts" element={<ComingSoonPage title="Accounts" />} />
            <Route path="/categories" element={<ComingSoonPage title="Categories" />} />
            <Route path="/reports" element={<ComingSoonPage title="Reports & Trends" />} />
            <Route path="/settings" element={<ComingSoonPage title="Settings" />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
