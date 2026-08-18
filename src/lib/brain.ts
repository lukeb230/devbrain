// Second Brain parsing: Obsidian-style notes with YAML-ish frontmatter,
// [[wikilinks]] as graph edges, and `touches:` as the file→feature map.

export interface BrainNote {
  slug: string; // "index" or "notes/<slug>" normalized to just the slug
  title: string;
  type: string;
  touches: string[];
  body: string; // markdown without frontmatter
  links: string[]; // resolved slugs of [[wikilinks]]
}

export interface BrainGraph {
  notes: BrainNote[];
  bySlug: Map<string, BrainNote>;
  backlinks: Map<string, string[]>; // slug -> slugs linking to it
}

function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: content };
  const meta: Record<string, unknown> = {};
  let currentList: string[] | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const listItem = raw.match(/^\s*-\s+(.*)$/);
    if (listItem && currentList) {
      currentList.push(listItem[1].trim());
      continue;
    }
    const kv = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) {
      const [, key, val] = kv;
      if (val === "" || val === "[]") {
        currentList = val === "[]" ? null : [];
        meta[key] = val === "[]" ? [] : currentList;
      } else {
        currentList = null;
        meta[key] = val.trim();
      }
    }
  }
  return { meta, body: content.slice(m[0].length) };
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

// When a note's frontmatter doesn't declare a `type:`, infer one from its
// name so graphs generated without types still get meaningful colors.
function inferType(base: string, title: string): string {
  const s = `${base} ${title}`.toLowerCase();
  if (base === "index" || /overview|index|readme/.test(s)) return "overview";
  if (/decision/.test(s)) return "decision";
  if (/gotcha|pitfall|warning/.test(s)) return "gotcha";
  if (/screen|page|view|ui|theme|theming|layout|shell/.test(s)) return "screen";
  if (/data|model|schema|store|storage|state/.test(s)) return "data";
  if (/service|api|client|server|hook/.test(s)) return "service";
  if (/feature|notes?$|tracking|form|list|log|stats/.test(s)) return "feature";
  return "module";
}

export function parseBrain(files: { name: string; content: string }[]): BrainGraph {
  const notes: BrainNote[] = [];
  for (const f of files) {
    const { meta, body } = parseFrontmatter(f.content);
    const base = f.name.replace(/^notes\//, "").replace(/\.md$/, "");
    const title = String(meta.title || base);
    notes.push({
      slug: base === "index" ? "index" : slugify(title),
      title,
      type: String(meta.type || inferType(base, title)),
      touches: Array.isArray(meta.touches) ? (meta.touches as string[]) : [],
      body,
      links: [],
    });
  }
  const byTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n.slug]));
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  const backlinks = new Map<string, string[]>();
  for (const n of notes) {
    const seen = new Set<string>();
    for (const m of n.body.matchAll(WIKILINK)) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (target && target !== n.slug && !seen.has(target)) {
        seen.add(target);
        n.links.push(target);
        if (!backlinks.has(target)) backlinks.set(target, []);
        backlinks.get(target)!.push(n.slug);
      }
    }
  }
  return { notes, bySlug, backlinks };
}

/** Replace [[wikilinks]] with markdown links into the brain viewer. */
export function linkifyBody(
  body: string,
  byTitle: Map<string, string>,
  hrefFor: (slug: string) => string,
): string {
  return body.replace(WIKILINK, (full, title: string) => {
    const slug = byTitle.get(title.trim().toLowerCase());
    return slug ? `[${title.trim()}](${hrefFor(slug)})` : title.trim();
  });
}
