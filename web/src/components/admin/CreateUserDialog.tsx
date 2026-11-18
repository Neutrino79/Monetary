import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { FormField, Input, Select } from "@/components/ui/form";
import { appConfig } from "@/config/app";
import { timezoneOptions } from "@/config/timezones";
import type { AccountRole } from "@/types";
import type { IssuedPassword, NewUserInput } from "@/types/admin";
import { adminService } from "@/lib/api/services/adminService";
import { useAdminMutation } from "@/hooks/admin";

/** An administrator creates an account directly; the person gets a temporary password to change at first sign-in. */
export function CreateUserDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; onCreated: (issued: IssuedPassword) => void;
}) {
  const create = useAdminMutation((input: NewUserInput) => adminService.createUser(input));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState(appConfig.currencyCode);
  const [timezone, setTimezone] = useState(appConfig.defaultTimezone);
  const [role, setRole] = useState<AccountRole>("user");
  const [error, setError] = useState("");

  function reset() {
    setName(""); setEmail(""); setError(""); setRole("user");
  }

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Enter the person's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email.");
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError("Enter a 3-letter currency code, e.g. INR.");
    try {
      const issued = await create.mutateAsync({ name: name.trim(), email: email.trim(), homeCurrencyCode: currency.toUpperCase(), timezone, role });
      reset();
      onOpenChange(false);
      onCreated(issued);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Create user"
      subtitle="They get a temporary password and their own empty ledger."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create user"}</Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-3 text-[12.8px] text-danger">
          <TriangleAlert size={15} className="flex-none" /> {error}
        </div>
      )}
      <div className="mb-4">
        <FormField label="Full name" htmlFor="cu-name">
          <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </div>
      <div className="mb-4">
        <FormField label="Email" htmlFor="cu-email">
          <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
        <FormField label="Home currency" htmlFor="cu-cur" hint="3-letter code">
          <Input id="cu-cur" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </FormField>
        <FormField label="Timezone" htmlFor="cu-tz">
          <Select id="cu-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezoneOptions().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
        </FormField>
      </div>
      <FormField label="Role" htmlFor="cu-role" hint="Superusers manage accounts but never see anyone's ledger">
        <Select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as AccountRole)}>
          <option value="user">User</option>
          <option value="superuser">Superuser</option>
        </Select>
      </FormField>
    </Modal>
  );
}
