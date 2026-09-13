// The two app builds and their URL schemes. The browser learns the channel
// from the sign-in hand-off (COOKIE.channel); anything unrecognised is stable.
const BUILDS = {
  stable: { scheme: "devbrain", name: "DevBrain" },
  beta: { scheme: "devbrain-beta", name: "DevBrain Beta" },
} as const;

export type Channel = keyof typeof BUILDS;

export function appChannel(raw: string | undefined): { channel: Channel; scheme: string; name: string; other: { scheme: string; name: string } } {
  const channel: Channel = raw === "beta" ? "beta" : "stable";
  const other: Channel = channel === "beta" ? "stable" : "beta";
  return { channel, ...BUILDS[channel], other: BUILDS[other] };
}
