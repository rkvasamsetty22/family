import { auth } from "@/auth";
import { lookupActiveUser } from "@/lib/users";
import { REPORT_IDS, buildReport, resolvePeriod, type ReportId } from "@/lib/reports";
import { EXPORT_FORMATS, reportFilename, toCsv, toPdf, toXlsx, type ExportFormat } from "@/lib/report-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

// Financial data: never cache it anywhere, never let the browser sniff it into something else.
const PRIVATE = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  // Middleware already requires a session; check the user is still active as pages do.
  const session = await auth();
  const user = await lookupActiveUser(session?.user?.email);
  if (!user) return new Response("Not signed in", { status: 401, headers: PRIVATE });

  const { report } = await params;
  const q = new URL(req.url).searchParams;
  const format = q.get("format") as ExportFormat;
  const id = report as ReportId | "all";
  if (!(EXPORT_FORMATS as readonly string[]).includes(format) || !(id === "all" || REPORT_IDS.includes(id as ReportId)))
    return new Response("Unknown report or format", { status: 400, headers: PRIVATE });

  const period = resolvePeriod({ period: q.get("period") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  const data = await buildReport(id, period);
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const body = format === "csv" ? toCsv(data) : format === "xlsx" ? new Uint8Array(await toXlsx(data)) : toPdf(data, generatedAt);
  return new Response(body, {
    headers: {
      ...PRIVATE,
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${reportFilename(data, period.from, period.to, format)}"`,
    },
  });
}
