// Test-only stand-in for next/font/google.
//
// The real package's named exports (Bricolage_Grotesque, IBM_Plex_Sans, ...)
// only work inside Next's own build: its compiler swaps each call for a
// generated CSS module, so calling the published package directly under
// Vitest throws ("X is not a function" — the package has no runtime exports
// outside that transform). Rendering src/app/landing/landing.tsx (and other
// pages under src/app/fonts.ts) in a Vitest test needs a stand-in that is
// merely callable and returns the one field these components read: `.variable`.
//
// Wired in via vitest.config.ts's resolve.alias; production and `next build`
// never see this file.
const font = (name: string) => (_options?: Record<string, unknown>) => ({
  variable: `--font-mock-${name}`,
  className: `font-mock-${name}`,
  style: { fontFamily: `mock-${name}` },
});

export const Bricolage_Grotesque = font("bricolage-grotesque");
export const IBM_Plex_Mono = font("ibm-plex-mono");
export const IBM_Plex_Sans = font("ibm-plex-sans");
export const Instrument_Sans = font("instrument-sans");
