import { Button } from "@/components/ui/Button";
import type { AccountStateCode } from "@/lib/api/services/authService";

const COPY: Record<AccountStateCode, { title: string; body: string }> = {
  AccountPendingApproval: {
    title: "Waiting for approval",
    body: "Your request was received. An administrator needs to approve it before you can sign in. Please check back later.",
  },
  AccountRejected: {
    title: "Request not approved",
    body: "Your account request was not approved. If you think this is a mistake, contact the administrator.",
  },
  AccountSuspended: {
    title: "Account suspended",
    body: "This account is suspended. Contact the administrator to have it restored.",
  },
  AccountPendingDelete: {
    title: "Account scheduled for deletion",
    body: "This account is scheduled for deletion. Contact the administrator soon if you want it restored.",
  },
};

/** What a signed-out person sees when their password was right but the account cannot be used yet (or any more). */
export function AccountStatusNotice({ code, reason, onBack }: { code: AccountStateCode; reason?: string | null; onBack: () => void }) {
  const copy = COPY[code];
  return (
    <>
      <h1 className="mb-1 text-[19px] font-semibold">{copy.title}</h1>
      <p className="mb-4 text-[12.8px] text-ink-faint">{copy.body}</p>
      {reason && <p className="mb-4 rounded-[10px] bg-paper-sunken px-3 py-3 text-[12.8px]">Reason given: {reason}</p>}
      <Button block variant="secondary" onClick={onBack}>
        Back to sign in
      </Button>
    </>
  );
}
