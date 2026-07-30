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
  async rewrites() {
    return [
      // Discover is disabled for V1 (see the destination page's comment for
      // why this has to be a rewrite to a route outside app/dashboard/,
      // rather than a page living directly at this path).
      { source: "/dashboard/discover", destination: "/dashboard-discover-disabled" },
    ];
  },
};

export default nextConfig;
