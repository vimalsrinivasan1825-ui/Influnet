import type { NextConfig } from "next";

// Same baseline the web app sends (apps/web/next.config.ts). Before 2026-11-10
// this site sent none of them (SYSTEM_AUDIT_2026-11-05, N7).
//
// HSTS is deliberately absent: Azure Static Web Apps already adds it, and a
// second copy would send the header twice.
//
// Check after a deploy with `curl -sI https://influnet.io`. If these do not
// appear, the Static Web Apps host is serving the page without going through
// Next; the fallback is `globalHeaders` in a `staticwebapp.config.json`.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
