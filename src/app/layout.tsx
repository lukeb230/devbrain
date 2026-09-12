import type { Metadata } from "next";
import { WidgetGuard } from "@/components/WidgetGuard";
import "./globals.css";

const DESCRIPTION =
  "Your coding agents have no idea what your team is doing. DevBrain gives every agent live presence, collision warnings and shared memory — Claude Code, Cursor and Codex, on any GitHub repo.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://devbrain-seven.vercel.app"),
  title: { default: "DevBrain — shared awareness for teams running coding agents", template: "%s · DevBrain" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "DevBrain",
    title: "DevBrain — shared awareness for teams running coding agents",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "DevBrain", description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <WidgetGuard />
        {children}
      </body>
    </html>
  );
}
