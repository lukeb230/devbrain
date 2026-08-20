import { unstable_cache } from "next/cache";
import { fetchBrainDocs } from "@/lib/github";

// Cached brain fetch. The raw fetch is ~1 GitHub API call PER NOTE, serially
// (2-4s) — far too slow to run on every widget render (which happens on every
// poll, realtime event, and server action). The brain only changes on pushes,
// so a 5-minute cache is invisible to users and turns renders into ~200ms.
export async function cachedBrainDocs(
  installationId: number,
  fullName: string,
  ref: string,
): Promise<{ name: string; content: string }[]> {
  const cached = unstable_cache(
    () => fetchBrainDocs(installationId, fullName, ref),
    ["brain-docs", String(installationId), fullName, ref],
    { revalidate: 300 },
  );
  return cached();
}
