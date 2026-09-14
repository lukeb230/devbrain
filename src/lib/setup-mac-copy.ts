// ============================================================================
// Step 3 of the walkthrough, "Set up this Mac". `done` is per-machine,
// computed by `macSetupState`; `hasToken` is the MAC's view (config.json
// holds some token — for any team). The two disagree either when
// config.json's token is for another team, or when it was for this team
// but has since been revoked (e.g. from Settings → Tokens) — the app cannot
// tell those apart, so the copy below covers both.
// ============================================================================
export function setupMacCopy(i: { done: boolean; hasToken: boolean; orgName: string }): { button: string; note: string | null } {
  if (i.done) return { button: "Re-run setup", note: null };
  if (i.hasToken) {
    return {
      button: `Set up this Mac for ${i.orgName}`,
      note: `This Mac was set up before, but not for ${i.orgName}. Setting it up again points it at ${i.orgName}, so your editor sessions show up here.`,
    };
  }
  return { button: "Set up this Mac", note: null };
}

/** Whether THIS Mac is set up for THIS team. The server hands over the live
 *  top-level token labels for the team; the app reports the Mac's hostname
 *  (its token label), whether config.json holds a token, and how the last
 *  bootstrap ended. All three must agree — a token from another machine with
 *  the same name, or a token for another team, is not "done here". */
export function macSetupState(i: { liveLabels: string[]; hostname: string | null | undefined; hasToken: boolean; bootstrapOk: boolean | null | undefined }): { doneHere: boolean } {
  const host = (i.hostname ?? "").trim().toLowerCase();
  if (!host || !i.hasToken || i.bootstrapOk === false) return { doneHere: false };
  const named = i.liveLabels.some((l) => l.trim().toLowerCase() === host);
  return { doneHere: named };
}
