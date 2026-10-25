import type { NextConfig } from "next";

// Applied to every response; the Content-Security-Policy is set per request in middleware.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  // Statements are uploaded through a server action; Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  serverExternalPackages: ["exceljs", "jspdf", "jspdf-autotable"],
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Financial pages must not be kept by shared caches or the back-forward cache after sign-out.
      { source: "/((?!_next/static|_next/image|favicon.ico).*)", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
