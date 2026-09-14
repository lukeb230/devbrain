import type { Metadata } from "next";
import { LegalPage } from "@/app/legal-page";

// The prose is read from disk at build time; keep these pages static so the
// files are never needed at request time.
export const dynamic = "force-static";
export const metadata: Metadata = { title: "Privacy", description: "What DevBrain collects, why, who sees it, and what you can do about it." };

// The prose lives in src/content/legal/privacy.md; the facts in src/lib/legal.ts.
export default function Privacy() {
  return <LegalPage doc="privacy" />;
}
