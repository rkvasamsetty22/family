import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ParsedTxn } from "./statements/parse";

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const model = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Server-side fallback reroutes a declined request to another model inside the same call.
const fallback = () => ({
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
});

const PdfResult = z.object({
  transactions: z.array(
    z.object({
      date: z.string().describe("yyyy-mm-dd"),
      description: z.string(),
      amount: z.number().describe("positive number in rupees"),
      direction: z.enum(["in", "out"]).describe("in = credit/deposit, out = debit/withdrawal"),
      balance: z.number().nullable(),
    }),
  ),
});

export async function extractFromPdf(buf: ArrayBuffer): Promise<ParsedTxn[]> {
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    ...fallback(),
    model: model(),
    max_tokens: 64000,
    output_config: { effort: "low", format: betaZodOutputFormat(PdfResult) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(buf).toString("base64"),
            },
          },
          {
            type: "text",
            text:
              "This is an Indian bank, credit card or wallet statement. Extract every transaction row in order. " +
              "Dates are day-first in the statement; return them as yyyy-mm-dd. Join wrapped narration lines into one description. " +
              "Skip opening/closing balance lines, totals and summaries.",
          },
        ],
      },
    ],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The statement could not be read automatically.");
  const parsed = PdfResult.safeParse(
    JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")),
  );
  if (!parsed.success) throw new Error("Could not read transactions from the PDF.");
  return parsed.data.transactions.map((t) => ({ ...t, balance: t.balance ?? undefined }));
}

const HeadResult = z.object({
  suggestions: z.array(z.object({ index: z.number(), head: z.string() })),
});

// Suggest a head name for each line. Returns index -> head name (only names from `heads`).
export async function suggestHeads(
  lines: { description: string; amount: number; direction: "in" | "out" }[],
  heads: { name: string; kind: string }[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!lines.length || !aiEnabled()) return out;
  const client = new Anthropic();
  const names = new Set(heads.map((h) => h.name));
  const headList = heads.map((h) => `- ${h.name} (${h.kind})`).join("\n");
  const BATCH = 150;
  for (let off = 0; off < lines.length; off += BATCH) {
    const chunk = lines.slice(off, off + BATCH);
    const body = chunk
      .map((l, i) => `${i}\t${l.direction === "in" ? "CREDIT" : "DEBIT"}\t${l.amount}\t${l.description}`)
      .join("\n");
    const res = await client.beta.messages.parse({
      ...fallback(),
      model: model(),
      max_tokens: 16000,
      output_config: { effort: "low", format: betaZodOutputFormat(HeadResult) },
      system:
        "You categorise an Indian household's bank transactions into the family's account heads. " +
        "Pick exactly one head name from the list for each line, copied verbatim. Credits usually map to income, loan or transfer heads; debits to expense, investment, loan or transfer heads. " +
        "UPI/NEFT/IMPS narrations name the merchant or person; use it. If unsure, use 'Other expenses' or 'Other income'.\n\nHeads:\n" +
        headList,
      messages: [{ role: "user", content: `index\ttype\tamount (INR)\tnarration\n${body}` }],
    });
    for (const s of res.parsed_output?.suggestions ?? []) {
      if (s.index >= 0 && s.index < chunk.length && names.has(s.head)) out.set(off + s.index, s.head);
    }
  }
  return out;
}
