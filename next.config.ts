import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statements are uploaded through a server action; Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  serverExternalPackages: ["exceljs", "jspdf", "jspdf-autotable"],
};

export default nextConfig;
