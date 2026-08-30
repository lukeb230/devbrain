// ============================================================================
// Pure helpers for the devbrain CLI — no side effects, no process/global
// state, so they can be unit-tested (cli/bin/__tests__) and shared with the
// plugin hooks without executing the CLI.
// ============================================================================

/** Semver-ish compare of "a.b.c[-pre]" (optional leading v). Returns -1/0/1,
 *  or null when either side is not parseable ("unknown", null…) — callers
 *  must treat null as "don't act". Numeric per component (0.3.10 > 0.3.9). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = String(v ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] ?? null } : null;
  };
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa.n[i] !== pb.n[i]) return pa.n[i] < pb.n[i] ? -1 : 1;
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1; // release > prerelease
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
}

/** Step-result contract for `updateAll`:
 *    { ok: true,  msg }                 reconciled (or already correct)
 *    { ok: true,  msg, skipped: true }  nothing attempted (offline, no release yet)
 *    { ok: false, msg, code }           NOT in the desired state; code is a
 *                                       stable identifier the app switches on
 *  Legacy string returns are treated as ok. Thrown errors become
 *  { ok:false, code:"exception", msg:"FAILED: …" }. */
export function normalizeStep(value) {
  if (value && typeof value === "object" && "ok" in value) return { ...value, msg: String(value.msg ?? "") };
  return { ok: true, msg: String(value ?? "ok") };
}
export function stepFromError(err) {
  return { ok: false, code: "exception", msg: `FAILED: ${String(err?.message ?? err).split("\n")[0]}` };
}

/** Aggregate results → { ok, failed: [names], skipped: [names], lines } */
export function summarizeResults(results) {
  const failed = [], skipped = [], lines = [];
  const pad = (s) => (s + "         ").slice(0, 10);
  for (const [name, r0] of Object.entries(results)) {
    const r = normalizeStep(r0);
    if (!r.ok) failed.push(name);
    else if (r.skipped) skipped.push(name);
    lines.push(`  ${pad(name)}${r.ok ? (r.skipped ? "· " : "") : "✗ "}${r.msg}`);
  }
  return { ok: failed.length === 0, failed, skipped, lines };
}

/** One-line hint for a failed API call from a hook, or null for silence.
 *  401 = this Mac's token is dead — the one failure a user must hear about
 *  because every DevBrain feature fails open on it. 404 (repo not linked) is
 *  the normal state for personal repos, so it stays silent. */
export function httpHint(status, cmd = "devbrain") {
  if (status === 401) return `DevBrain: this Mac's token was rejected — run \`${cmd} setup --reconfigure\` (new token from Settings → Tokens).`;
  return null;
}

/** Filesystem-safe slug for a session label: "Luke · 2" → "luke-2". */
export function sessionSlug(label) {
  const s = String(label ?? "").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "session";
}

/** Next free clone directory name for a repo: "owner/name" → "name-2", "name-3"… */
export function nextCloneName(repoFull, existing) {
  const base = String(repoFull).split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "-") || "repo";
  const taken = new Set(existing);
  for (let n = 2; n <= 99; n++) {
    const c = `${base}-${n}`;
    if (!taken.has(c)) return c;
  }
  throw new Error("no free clone name");
}
