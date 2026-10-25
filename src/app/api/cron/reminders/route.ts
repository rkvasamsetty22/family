import { NextResponse } from "next/server";
import { upcomingReminders } from "@/lib/queries";
import { getSetting } from "@/lib/settings";
import { daysBetween, todayIST } from "@/lib/dates";
import { fmtDate, money } from "@/lib/format";
import { safeEqual } from "@/lib/password";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Called daily by Vercel Cron (see vercel.json). Emails what is due soon or overdue.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const days = Number(await getSetting("reminderDays")) || 7;
  const today = todayIST();
  const items = await upcomingReminders(days, today);
  if (!items.length) return NextResponse.json({ sent: false, items: 0 });
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_TO) {
    return NextResponse.json({ sent: false, items: items.length, reason: "email not configured" });
  }

  const rows = items
    .map((r) => {
      const d = daysBetween(today, r.date);
      const when = d < 0 ? `<b style="color:#c43c3b">${-d} days overdue</b>` : d === 0 ? "<b>Today</b>" : fmtDate(r.date);
      return `<tr><td style="padding:4px 8px">${when}</td><td style="padding:4px 8px">${r.kind}</td><td style="padding:4px 8px">${esc(r.title)}</td><td style="padding:4px 8px;text-align:right">${r.amount ? money(r.amount) : ""}</td></tr>`;
    })
    .join("");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REMINDER_FROM || "Family Finance Manager <onboarding@resend.dev>",
      to: process.env.REMINDER_TO.split(",").map((s) => s.trim()),
      subject: `${items.length} payment${items.length > 1 ? "s" : ""} due in the next ${days} days`,
      html: `<p>Coming up:</p><table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>`,
    }),
  });
  return NextResponse.json({ sent: res.ok, items: items.length });
}
