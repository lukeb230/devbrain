import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevBrain",
  description:
    "A shared second brain for dev teams and their coding agents — live presence, PRs, memory, restore points.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
