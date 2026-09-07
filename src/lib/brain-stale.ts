// ============================================================================
// "Brain stale" — merged branches that changed code but touched nothing in
// .brain/. One rule, used by the context digest (what Claude sees) and the
// Desk's Brain page (what the team sees), so they never disagree.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface StaleBranch {
  branch: string;
  pr: number | null;
  title: string | null;
  merged_at: string;
  code_files: string[];
}

export const isCodeFile = (f: string) =>
  !f.startsWith(".brain/") && !f.startsWith(".github/") && !/package-lock|\.lock$|\.min\.|\.map$/.test(f);

export function staleBrain(mergedBranches: Row[], mergedPrs: Row[], limit = 5): StaleBranch[] {
  const prByBranch = new Map((mergedPrs ?? []).map((p) => [p.head_branch, p]));
  return (mergedBranches ?? [])
    .filter((b) => {
      const files = (b.changed_files as string[]) ?? [];
      return files.some(isCodeFile) && !files.some((f) => f.startsWith(".brain/"));
    })
    .map((b) => {
      const pr = prByBranch.get(b.name);
      return {
        branch: b.name,
        pr: pr?.number ?? null,
        title: pr?.title ?? null,
        merged_at: b.merged_at,
        code_files: ((b.changed_files as string[]) ?? []).filter(isCodeFile).slice(0, 12),
      };
    })
    .slice(0, limit);
}
