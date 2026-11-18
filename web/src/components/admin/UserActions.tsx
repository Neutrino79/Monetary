import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { useAdminMutation } from "@/hooks/admin";
import type { AdminUser, IssuedPassword } from "@/types/admin";
import { ReasonDialog } from "./adminUi";

type Pending = null | "reject" | "suspend" | "delete" | "reset" | "revoke" | "role";

const itemClass = "flex w-full cursor-pointer items-center rounded-[8px] px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-paper-sunken";

/**
 * The actions an administrator can take on one account. Only moves the server allows for the
 * account's current state are offered; the server re-checks every one (and answers 409 otherwise).
 */
export function UserActions({ user, isSelf, onIssued }: { user: AdminUser; isSelf: boolean; onIssued: (issued: IssuedPassword) => void }) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const run = useAdminMutation(async (job: () => Promise<unknown>) => job());

  const done = (message: string) => toast.show(message, { variant: "success" });
  const attempt = async (job: () => Promise<unknown>, message: string) => {
    try {
      await run.mutateAsync(job);
      done(message);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  };

  const s = user.status;
  const nextRole = user.role === "superuser" ? "user" : "superuser";

  return (
    <div className="flex items-center justify-end gap-2">
      {s === "pending_approval" && (
        <>
          <Button size="sm" onClick={() => attempt(() => adminService.approve(user.id), `${user.name} approved.`)}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => setPending("reject")}>Reject</Button>
        </>
      )}
      {s === "suspended" && (
        <Button size="sm" variant="secondary" onClick={() => attempt(() => adminService.reactivate(user.id), `${user.name} reactivated.`)}>Reactivate</Button>
      )}
      {s === "pending_delete" && (
        <Button size="sm" variant="secondary" onClick={() => attempt(() => adminService.restore(user.id), `${user.name} restored.`)}>Restore</Button>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton aria-label={`More actions for ${user.name}`}><MoreHorizontal size={17} /></IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="z-[90] min-w-48 rounded-[12px] border border-line bg-paper-raised p-1 shadow-xl">
            {s === "active" && !isSelf && <DropdownMenu.Item className={itemClass} onSelect={() => setPending("suspend")}>Suspend…</DropdownMenu.Item>}
            {(s === "active" || s === "suspended") && (
              <DropdownMenu.Item className={itemClass} onSelect={() => setPending("reset")}>Reset password…</DropdownMenu.Item>
            )}
            {(s === "active" || s === "suspended") && (
              <DropdownMenu.Item className={itemClass} onSelect={() => setPending("revoke")}>Sign out everywhere…</DropdownMenu.Item>
            )}
            {s === "active" && (
              <DropdownMenu.Item className={itemClass} onSelect={() => setPending("role")}>
                {nextRole === "superuser" ? "Make superuser…" : "Make regular user…"}
              </DropdownMenu.Item>
            )}
            {s !== "pending_delete" && !isSelf && (
              <DropdownMenu.Item className={`${itemClass} text-danger`} onSelect={() => setPending("delete")}>Delete…</DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ReasonDialog
        open={pending === "reject"} title="Reject request" subtitle={user.email} confirmLabel="Reject"
        onCancel={() => setPending(null)}
        onConfirm={(reason) => { setPending(null); attempt(() => adminService.reject(user.id, reason), `${user.name} rejected.`); }}
      />
      <ReasonDialog
        open={pending === "suspend"} title="Suspend account" subtitle={`${user.email} is signed out at once and cannot sign in until reactivated.`}
        confirmLabel="Suspend"
        onCancel={() => setPending(null)}
        onConfirm={(reason) => { setPending(null); attempt(() => adminService.suspend(user.id, reason), `${user.name} suspended.`); }}
      />
      <ConfirmDialog
        open={pending === "delete"} onOpenChange={(o) => !o && setPending(null)}
        title={`Delete ${user.name}?`}
        message="The account is locked now and its data is removed after 30 days. You can restore it until then."
        confirmLabel="Delete" onConfirm={() => attempt(() => adminService.remove(user.id), `${user.name} scheduled for deletion.`)}
      />
      <ConfirmDialog
        open={pending === "reset"} onOpenChange={(o) => !o && setPending(null)} variant="primary"
        title={`Reset password for ${user.name}?`}
        message="They are signed out everywhere and get a new temporary password, which you will see once."
        confirmLabel="Reset password"
        onConfirm={async () => {
          try {
            onIssued(await run.mutateAsync(() => adminService.resetPassword(user.id)) as IssuedPassword);
          } catch (e) {
            toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
          }
        }}
      />
      <ConfirmDialog
        open={pending === "revoke"} onOpenChange={(o) => !o && setPending(null)} variant="primary"
        title={`Sign ${user.name} out everywhere?`} message="All of their sessions end now. They can sign in again."
        confirmLabel="Sign out" onConfirm={() => attempt(() => adminService.revokeSessions(user.id), "Sessions revoked.")}
      />
      <ConfirmDialog
        open={pending === "role"} onOpenChange={(o) => !o && setPending(null)} variant="primary"
        title={`Make ${user.name} a ${nextRole === "superuser" ? "superuser" : "regular user"}?`}
        message={nextRole === "superuser" ? "They will be able to approve, suspend and delete accounts. They still cannot see anyone's ledger." : "They lose access to the Admin area and are signed out so the change applies."}
        confirmLabel="Change role" onConfirm={() => attempt(() => adminService.setRole(user.id, nextRole), `${user.name} is now a ${nextRole}.`)}
      />
    </div>
  );
}
