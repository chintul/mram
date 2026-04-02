import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      // Vercel CDN: cache API data responses at the edge
      source: "/api/data",
      headers: [
        {
          key: "CDN-Cache-Control",
          value: "public, max-age=3600, stale-while-revalidate=86400",
        },
      ],
    },
    {
      source: "/api/layers",
      headers: [
        {
          key: "CDN-Cache-Control",
          value: "public, max-age=600, stale-while-revalidate=3600",
        },
      ],
    },
  ],
};

export default nextConfig;
