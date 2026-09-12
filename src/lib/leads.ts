// ============================================================================
// Lead capture — the address someone leaves when they are not signing up
// today. Validation is pure and tested; the write is one insert.
//
// The bar for "valid" here is deliberately low: this is a list to write to
// later, not an auth boundary. Reject what is obviously not an address, keep
// everything else, and never make someone fight a regex to give you their
// email. Duplicates are not an error — a second submit looks the same as the
// first from the person's side.
// ============================================================================

export const LEAD_SOURCES = ["landing", "beta_full"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** A normalised address, or null when it is not one. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  // one @, something either side, a dot in the domain, no whitespace
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

export function isLeadSource(v: unknown): v is LeadSource {
  return typeof v === "string" && (LEAD_SOURCES as readonly string[]).includes(v);
}
