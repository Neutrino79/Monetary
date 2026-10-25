import { useEffect, useState } from "react";
import { Moon, Server, Sun } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/primitives";
import { TagManager } from "@/components/domain/TagManager";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/form";
import { timezoneOptions } from "@/config/timezones";
import { appConfig } from "@/config/app";
import { useBranding } from "@/hooks/queries";
import { authService } from "@/lib/api/services/authService";
import { currencySymbol } from "@/lib/utils/format";
import type { LedgerMode } from "@/types";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toast = useToast();
  const { name: appName, tagline } = useBranding();

  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? appConfig.defaultTimezone);
  const [ledgerMode, setLedgerMode] = useState<LedgerMode>(user?.ledgerMode ?? "DIRECT");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setTimezone(user.timezone ?? appConfig.defaultTimezone);
    setLedgerMode(user.ledgerMode);
  }, [user]);

  async function saveProfile() {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), timezone });
      toast.show("Profile updated.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function changeLedgerMode(mode: LedgerMode) {
    setLedgerMode(mode);
    try {
      await updateProfile({ ledgerMode: mode });
      toast.show(`Ledger mode set to ${mode}.`, { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">Your profile, ledger behavior, and how {appName} is configured.</p>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-5 max-[900px]:grid-cols-1">
        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-4 text-[14.5px] font-semibold">Profile</div>
            <div className="grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
              <FormField label="Full name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="Email" hint="Contact support to change your email.">
                <Input value={user?.email ?? ""} disabled />
              </FormField>
              <FormField label="Timezone">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezoneOptions(user?.timezone).map((tz: string) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Home currency" hint="Set at setup; can't be changed.">
                <Input value={`${user?.homeCurrencyCode ?? appConfig.currencyCode} (${currencySymbol()})`} disabled />
              </FormField>
            </div>
            <div className="mt-4">
              <Button onClick={saveProfile} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Card>

          <ChangePasswordCard />

          <Card>
            <div className="mb-1 text-[14.5px] font-semibold">Ledger mode</div>
            <p className="mb-4 text-[12.8px] text-ink-faint">Controls how edits and deletes to posted transactions are handled.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => changeLedgerMode("DIRECT")}
                className={`rounded-[10px] border p-3.5 text-left ${ledgerMode === "DIRECT" ? "border-ink bg-paper-sunken" : "border-line"}`}
              >
                <div className="text-[13.3px] font-semibold">DIRECT</div>
                <div className="mt-1 text-[12px] text-ink-faint">Edits and deletes change the record in place. Simple, no trace left behind.</div>
              </button>
              <button
                onClick={() => changeLedgerMode("STRICT")}
                className={`rounded-[10px] border p-3.5 text-left ${ledgerMode === "STRICT" ? "border-ink bg-paper-sunken" : "border-line"}`}
              >
                <div className="text-[13.3px] font-semibold">STRICT</div>
                <div className="mt-1 text-[12px] text-ink-faint">Edits and deletes post a reversal instead — the original always stays in history.</div>
              </button>
            </div>
          </Card>

          <TagManager />

          <Card>
            <div className="mb-4 text-[14.5px] font-semibold">Appearance</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13.3px]">
                {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                {theme === "dark" ? "Dark theme" : "Light theme"}
              </div>
              <Button variant="secondary" size="sm" onClick={toggleTheme}>
                Switch to {theme === "dark" ? "light" : "dark"}
              </Button>
            </div>
          </Card>
        </div>

        <Card className="self-start">
          <div className="mb-4 text-[14.5px] font-semibold">About this instance</div>
          <div className="flex items-center gap-3 border-b border-dashed border-line py-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-paper-sunken text-ink-soft">{appConfig.logoMark}</span>
            <div>
              <div className="text-[13.3px] font-semibold">{appName}</div>
              <div className="text-[11.5px] text-ink-faint">{tagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-b border-dashed border-line py-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-paper-sunken text-ink-soft">
              <Server size={15} />
            </span>
            <div>
              <div className="text-[13.3px] font-semibold">Backend</div>
              <div className="text-[11.5px] text-ink-faint">{appConfig.apiBaseUrl}</div>
            </div>
          </div>
          <div className="py-3 text-[11.5px] text-ink-faint">
            Questions? Reach out at <span className="font-medium text-ink-soft">{appConfig.supportEmail}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError("");
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next.length > 128) return setError("New password must be at most 128 characters.");
    if (next !== confirm) return setError("New passwords don't match.");
    setSaving(true);
    try {
      await authService.changePassword(current, next);
      toast.show("Password changed.", { variant: "success" });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-1 text-[14.5px] font-semibold">Password</div>
      <p className="mb-4 text-[12.8px] text-ink-faint">Changing your password signs you out of any other devices.</p>
      <div className="grid grid-cols-3 gap-4 max-[640px]:grid-cols-1">
        <FormField label="Current password" error={error && !next ? error : undefined}>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormField>
        <FormField label="New password">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </FormField>
        <FormField label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </FormField>
      </div>
      {error && next && <div className="mt-3 text-[12.5px] text-danger">{error}</div>}
      <div className="mt-4">
        <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Change password"}</Button>
      </div>
    </Card>
  );
}
