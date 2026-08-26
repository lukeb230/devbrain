// Reminders → task mapping helpers. Pure; tested in src/lib/__tests__.
// Apple's CalDAV priority scale: 0 none, 1 high, 5 medium, 9 low → P1..P3.
export const PRIORITY_MAP: Record<number, number> = { 1: 1, 5: 2, 9: 3, 0: 3 };

export function parseTitle(raw: string): { title: string; assignee: string | null; tags: string[] } {
  let title = String(raw || "").slice(0, 300);
  // A tag needs at least one letter — "#212" is a PR reference, not a tag.
  const TAG = /#(?=[\w-]*[a-z])([a-z0-9][\w-]*)/gi;
  const tags = [...title.matchAll(TAG)].map((m) => m[1].toLowerCase());
  const at = title.match(/@([a-z0-9][\w-]*)/i);
  const assignee = at ? at[1].toLowerCase() : null;
  title = title
    .replace(TAG, "")
    .replace(/@[a-z0-9][\w-]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { title: title.slice(0, 200), assignee, tags: [...new Set(tags)].slice(0, 8) };
}

