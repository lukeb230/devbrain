import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webhook payloads can be large (PR sync events with many files).
  experimental: {},
};

export default nextConfig;
