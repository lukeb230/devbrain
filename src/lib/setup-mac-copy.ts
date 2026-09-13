// ============================================================================
// Step 3 of the walkthrough, "Set up this Mac". `done` is the SERVER's view
// (a live dev token for this user in THIS team); `hasToken` is the MAC's view
// (config.json holds some token — for any team). The two disagree either
// when config.json's token is for another team, or when it was for this
// team but has since been revoked (e.g. from Settings → Tokens) — the app
// cannot tell those apart, so the copy below covers both.
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
