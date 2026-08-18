// Shared graph palette — lives in a plain module (no "use client") so both
// the server-rendered page (legend) and the client graph can import it.
// Light-mode: saturated-but-tasteful marks that hold up on white.
export const GRAPH_COLORS: Record<string, string> = {
  overview: "#0d9488",
  feature: "#059669",
  module: "#2563eb",
  service: "#4f46e5",
  screen: "#0891b2",
  data: "#7c3aed",
  decision: "#d97706",
  gotcha: "#dc2626",
};
