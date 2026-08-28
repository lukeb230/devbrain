// Next.js instrumentation hook: every unhandled error in a route handler,
// server action or server component lands here → ops alert (fingerprinted
// by route + message so one bad deploy is one alert, not one per request).
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
}
