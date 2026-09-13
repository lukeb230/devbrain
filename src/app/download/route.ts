import { NextResponse } from "next/server";
import { pickDmg, type Asset } from "@/lib/release-asset";

// GET /download[?channel=beta] → 302 to the latest DMG on GitHub Releases,
// or to the releases page when no asset resolves. Not gated behind sign-in.
// The lookup is cached for five minutes (fetch revalidate).
const REPO = "lukeb230/devbrain";
const RELEASES = `https://github.com/${REPO}/releases/latest`;

export async function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get("channel") === "beta" ? "beta" : "stable";
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "devbrain-site" },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const rel = (await res.json()) as { assets?: Asset[] };
      const url = pickDmg(rel.assets ?? [], channel);
      if (url) return NextResponse.redirect(url, 302);
    }
  } catch { /* fall through to the releases page */ }
  return NextResponse.redirect(RELEASES, 302);
}
