import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false, // Recommended for socket apps to prevent double-connection in dev
  devIndicators: false,
};

export default nextConfig;
