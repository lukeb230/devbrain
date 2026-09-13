"use client";

import type { ReactNode } from "react";

// A link that leaves the app: inside the Desk it goes through the shell's
// open_external command (the default browser); in a plain browser it's a new
// tab. Never let GitHub load inside the Desk window — the window's lock allows
// github.com only for the OAuth hop.
export function ExternalLink({ href, children, className, title = "Opens in your browser" }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={title}
      onClick={(e) => {
        const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
        if (!core) return;
        e.preventDefault();
        void core.invoke("open_external", { url: href }).catch(() => window.open(href, "_blank"));
      }}
    >
      {children}
    </a>
  );
}
