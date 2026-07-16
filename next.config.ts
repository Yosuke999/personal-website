import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
