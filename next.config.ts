import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webhook payloads can be large (PR sync events with many files).
  experimental: {
    // Spec uploads (PDFs/briefs) post through a server action.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
