// ============================================================================
// Webhook host allow-list — the only destinations a TEAM may point an alert
// channel at. Team webhooks are user-supplied, and the server POSTs to them
// from inside our network: without a host check that is an SSRF primitive
// (cloud metadata at 169.254.169.254, internal services, localhost). The
// alert adapters only understand Slack and Discord anyway, so the honest
// bound is "those two hosts, over https, nothing else".
//
// Operator webhooks (DEVBRAIN_OPS_WEBHOOK) are exempt — they come from an env
// var, not a user, and an operator pointing at their own host is not SSRF.
// ============================================================================

const ALLOWED_HOSTS = [/^hooks\.slack\.com$/, /^(canary\.)?discord(app)?\.com$/];

export function isAllowedWebhookHost(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false; // no creds-in-URL smuggling
  return ALLOWED_HOSTS.some((re) => re.test(u.hostname));
}
