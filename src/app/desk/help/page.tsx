import { redirect } from "next/navigation";
import { currentOrg } from "@/lib/org";
import { currentUser } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";
import { Reading } from "../panes";
import { HelpForms } from "./help-forms";

// ============================================================================
// Desk · Help (Dusk) — report a bug or request a feature from inside the
// app. Same gate as every Desk page: a person, in a team.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskHelp() {
  const user = await currentUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  return (
    <Reading className="mx-auto max-w-[980px]">
      <div className="mb-6">
        <h1 className="font-display text-[30px] font-bold leading-none tracking-[-.03em] text-txt">Help</h1>
        <p className="mt-2 text-[13px] text-muted">Goes straight to the person who builds DevBrain · you get a copy at {user.email ?? "your email"} · replies come from {LEGAL.contact}</p>
      </div>
      <HelpForms />
    </Reading>
  );
}
