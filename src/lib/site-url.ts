// The single source of truth for the public site's canonical URL. No imports
// of its own, so anything (middleware included) can pull it in cheaply. ||,
// not ??: an empty-string env value must still fall through to the default,
// or `new URL(SITE_URL)` throws on every request.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://getdevbrain.com").replace(/\/+$/, "");
