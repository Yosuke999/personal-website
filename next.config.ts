import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
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
