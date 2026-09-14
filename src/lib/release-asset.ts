// The latest widget release carries both builds under one tag:
// DevBrain.dmg (stable) and DevBrain-Beta.dmg (beta), see
// .github/workflows/widget-release.yml.
export type Asset = { name: string; browser_download_url: string };
export function pickDmg(assets: Asset[], channel: "stable" | "beta"): string | null {
  const want = channel === "beta" ? "DevBrain-Beta.dmg" : "DevBrain.dmg";
  return assets.find((a) => a.name === want)?.browser_download_url ?? null;
}
