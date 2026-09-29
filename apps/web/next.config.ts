import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Emit browser source maps so a Sentry stack trace names a real file and
  // line instead of a minified chunk offset.
  //
  // These maps are NOT served to users: the runner stage of apps/web/Dockerfile
  // deletes every .map after copying the static assets, and the deploy uploads
  // them to Sentry first (scripts/upload-sentry-sourcemaps.sh). A .map sitting
  // next to a bundle would hand any visitor the original TypeScript.
  //
  // Cost is build time and image-build disk, both in CI only.
  productionBrowserSourceMaps: true,
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
  // Baseline hardening headers. A CSP is deliberately not set here: it needs an
  // inventory of every script/style/img origin (Razorpay, Stream, Cloudinary,
  // Sentry) and would break pages if guessed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
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
