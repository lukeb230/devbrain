// Next.js instrumentation hook. register() boots the Sentry SDK for the
// runtime that is starting; onRequestError hands every unhandled error in a
// route handler, server action or server component to BOTH the error
// tracker (the record: stack, release, who was affected) and the native ops
// alert (the pager: fingerprinted by route + message so one bad deploy is
// one alert). Neither may stop the other, and nothing here may throw.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

// Next's installed `Instrumentation.onRequestError` type requires a
// `revalidateReason` field on the context that Next itself does not always
// pass (and that our tests, matching the brief, don't construct), so this
// keeps the explicit shape and casts only at the Sentry boundary.
export const onRequestError = async (
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const Sentry = await import("@sentry/nextjs");
    await Sentry.captureRequestError(err, request, context);
  } catch { /* the tracker being down is not our user's problem */ }
  try {
    const { alert } = await import("@/lib/alerts");
    const message = String((err as Error)?.message ?? err).slice(0, 300);
    const stack = String((err as Error)?.stack ?? "").split("\n").slice(1, 4).join("\n");
    await alert({
      scope: "ops",
      key: `http.${context.routePath || request.path}`,
      title: `Unhandled error in ${request.method} ${context.routePath || request.path}`,
      detail: `${message}\n${stack}`,
    });
  } catch { /* never throw from here */ }
};
