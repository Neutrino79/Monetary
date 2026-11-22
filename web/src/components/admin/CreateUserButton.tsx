import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { TemporaryPasswordDialog } from "@/components/admin/adminUi";
import type { IssuedPassword } from "@/types/admin";

/** "Create user" in the admin top bar, with the one-time temporary password shown afterwards. */
export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Create user
      </Button>
      <CreateUserDialog open={open} onOpenChange={setOpen} onCreated={setIssued} />
      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </>
  );
}
