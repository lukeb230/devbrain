// One-shot messages keyed by COOKIE.notice's value. Read by the Desk layout
// so a notice renders on every page, not only when the onboarding wall is
// mounted (a teammate past onboarding still needs to see install_owned).
export const NOTICES: Record<string, string> = {
  install_owned: "That repository's GitHub App installation already belongs to another DevBrain team. Pick a different repository, or ask that team to unlink it first.",
  preset_failed: "Saving the rules didn't go through. Try the preset again; if it keeps failing, open Rules and set them one by one.",
  token_label_taken: "A live token with that label already exists. Revoke it first, or pick another label. Nothing was created.",
  token_failed: "The token could not be created. Try again; if it keeps failing, check Team settings.",
};
