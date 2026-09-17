import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Webhook payloads can be large (PR sync events with many files).
  experimental: {
    // Spec uploads (PDFs/briefs) post through a server action.
    serverActions: { bodySizeLimit: "4mb" },
    // Console tabs are dynamic pages; keep the ones just visited in the client
    // router cache so switching back and forth is instant, and refresh from
    // the server after 30s.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

// Source maps go up at build only when SENTRY_AUTH_TOKEN is set (Vercel);
// without it the wrapper is a no-op apart from the tunnel rewrite, so local
// builds and CI never need a Sentry credential.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/sentry-tunnel",
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: { treeshake: { removeDebugLogging: true } },
});
