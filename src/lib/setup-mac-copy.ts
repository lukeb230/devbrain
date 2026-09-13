// ============================================================================
// Step 3 of the walkthrough, "Set up this Mac". `done` is the SERVER's view
// (a live dev token for this user in THIS team); `hasToken` is the MAC's view
// (config.json holds some token — for any team). The two disagree exactly
// when the Mac was set up for a different team, and that is the one case
// that needs a sentence before the click.
// ============================================================================
export function setupMacCopy(i: { done: boolean; hasToken: boolean; orgName: string }): { button: string; note: string | null } {
  if (i.done) return { button: "Re-run setup", note: null };
  if (i.hasToken) {
    return {
      button: `Switch this Mac to ${i.orgName}`,
      note: `This Mac is set up for a different team. Switching it to ${i.orgName} means your editor sessions show up here instead.`,
    };
  }
  return { button: "Set up this Mac", note: null };
}
