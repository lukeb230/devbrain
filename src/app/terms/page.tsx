import type { Metadata } from "next";
import { LegalPage } from "@/app/legal-page";

export const metadata: Metadata = { title: "Terms", description: "The terms of use for DevBrain." };

// The prose lives in src/content/legal/terms.md; the facts in src/lib/legal.ts.
export default function Terms() {
  return <LegalPage doc="terms" />;
}
