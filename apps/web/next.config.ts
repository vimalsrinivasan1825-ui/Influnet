import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace packages ship raw TypeScript (no build step), so Next has to
  // compile them the same way it compiles src/.
  transpilePackages: [
    "@influnet/api",
    "@influnet/core",
    "@influnet/tokens",
    "@influnet/types",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
