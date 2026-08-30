"use client";

import { useSearchParams } from "next/navigation";
import type { DeniedCode } from "@/lib/org";

// A refused action used to do nothing at all. Actions now bounce back with
// ?error=<code>; this reads it wherever AppNav is rendered, so every
// dashboard page explains a refusal the same way the panel does.
const TEXT: Record<DeniedCode, string> = {
  admin_only: "Only team admins and owners can do that.",
  owner_only: "Only the team owner can do that.",
  link_repo_admin: "Only team admins and owners can link a repo.",
  no_access: "That didn't go through — you're not signed in to this team, or your session expired. Reload and try again.",
  webhook_host: "Alert webhooks must be a Slack or Discord URL (https). Other hosts aren't allowed.",
  install_owned: "That GitHub installation already belongs to another DevBrain team. Ask its owner, or install the app fresh for this team.",
};

export function DeniedNotice() {
  const code = useSearchParams().get("error") as DeniedCode | null;
  if (!code || !(code in TEXT)) return null;
  return (
    <div className="mx-auto max-w-[1440px] px-6 pt-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{TEXT[code]}</div>
    </div>
  );
}
