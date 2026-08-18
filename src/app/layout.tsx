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
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
