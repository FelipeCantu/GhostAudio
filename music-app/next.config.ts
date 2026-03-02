import type { NextConfig } from "next";

const isElectronBuild = process.env.ELECTRON_BUILD === "true";

const nextConfig: NextConfig = {
  // Static export only for Electron packaging; Vercel uses full SSR
  ...(isElectronBuild ? { output: "export" } : {}),
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coverartarchive.org",
      },
      {
        protocol: "https",
        hostname: "pub-72ff760424884b299f39ed9ed1354674.r2.dev",
      },
    ],
  },
};

export default nextConfig;
