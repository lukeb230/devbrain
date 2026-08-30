// ============================================================================
// Required environment — checked on every tick, not just at boot.
//
// A missing secret fails quietly: no webhook secret means every GitHub
// delivery is a 401 forever; no cron secret means the tick 503s and the
// panel just goes stale. Naming the missing variable in an ops alert turns
// "DevBrain seems off" into "set DEVBRAIN_GH_WEBHOOK_SECRET".
// ============================================================================

/** Variables without which a core path is silently dead. */
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEVBRAIN_CRON_SECRET",
  "DEVBRAIN_GH_APP_ID",
  "DEVBRAIN_GH_APP_PRIVATE_KEY",
  "DEVBRAIN_GH_WEBHOOK_SECRET",
  "NEXT_PUBLIC_GH_APP_SLUG",
] as const;

/** Variables whose absence degrades a feature rather than breaking one. */
export const RECOMMENDED_ENV = ["ANTHROPIC_API_KEY", "DEVBRAIN_OPS_WEBHOOK"] as const;

export function missingEnv(env: Record<string, string | undefined> = process.env): { required: string[]; recommended: string[] } {
  const blank = (k: string) => !env[k] || !String(env[k]).trim();
  return {
    required: REQUIRED_ENV.filter(blank),
    recommended: RECOMMENDED_ENV.filter(blank),
  };
}
