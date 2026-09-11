import type { NextConfig } from "next";

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

export default nextConfig;
