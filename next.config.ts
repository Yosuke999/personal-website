import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    qualities: [60, 65, 72, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cjabfhiukpjhvmdgfzpn.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
    minimumCacheTTL: 3600,
  },
  turbopack: {
    root: projectRoot,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "yosuke-travel-atlas.vercel.app",
          },
        ],
        destination: "https://yosukegogogo.cn/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/login", destination: "/" },
      { source: "/reset-password", destination: "/" },
      { source: "/map", destination: "/" },
      { source: "/wall", destination: "/" },
      { source: "/notifications", destination: "/" },
      { source: "/profile", destination: "/" },
      { source: "/province/:name", destination: "/" },
      { source: "/story/:id", destination: "/" },
      { source: "/admin/:path*", destination: "/" },
    ];
  },
};

export default nextConfig;
