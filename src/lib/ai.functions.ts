import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "openai/gpt-6-astra";

type InputPart = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type InputMsg = { role: "system" | "user" | "assistant"; content: string | InputPart[] };

/** Streams a Responses API call over SSE and returns the concatenated output text. */
async function callGateway(input: InputMsg[], format?: Record<string, unknown>) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      ...(format ? { text: { format } } : {}),
    }),
  });
  if (res.status === 429) throw new Error("Too many requests, please try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
  if (!res.ok || !res.body) {
    console.error("AI gateway error", res.status, await res.text());
    throw new Error("AI service unavailable");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as { type?: string; delta?: string };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
      } catch {
        /* ignore partial */
      }
    }
  }
  return out;
}

const extractSchema = {
  type: "json_schema",
  name: "document_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["category", "document_type", "fields", "issue_date", "expiry_date", "summary"],
    properties: {
      category: { type: "string", enum: ["Identity", "Education", "Insurance", "Financial", "Others"] },
      document_type: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: { label: { type: "string" }, value: { type: "string" } },
        },
      },
      issue_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      expiry_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      summary: { type: "string" },
    },
  },
};

export const extractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase.from("documents").select("*").eq("id", data.id).single();
    if (error || !doc) throw new Error("Document not found");

    const parts: InputPart[] = [
      {
        type: "input_text",
        text: `Analyse this personal document named "${doc.name}". Classify it, list its key details (holder name, numbers, dates, provider, etc.) as label/value fields, and give issue/expiry dates as YYYY-MM-DD when present. Respond as JSON.`,
      },
    ];
    if (doc.mime_type?.startsWith("image/")) {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300);
      if (signed?.signedUrl) parts.push({ type: "input_image", image_url: signed.signedUrl });
    }

    let parsed: {
      category: string; document_type: string; fields: { label: string; value: string }[];
      issue_date: string | null; expiry_date: string | null; summary: string;
    };
    try {
      parsed = JSON.parse(await callGateway([{ role: "user", content: parts }], extractSchema));
    } catch (e) {
      console.error(e);
      await supabase.from("documents").update({ status: "ready" }).eq("id", doc.id);
      return { ok: false };
    }
    const dateOk = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const fields = Object.fromEntries(parsed.fields.map((f) => [f.label, f.value]));
    await supabase.from("documents").update({
      category: parsed.category,
      extracted: { document_type: parsed.document_type, fields },
      issue_date: doc.issue_date ?? dateOk(parsed.issue_date),
      expiry_date: doc.expiry_date ?? dateOk(parsed.expiry_date),
      summary: parsed.summary,
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", doc.id);
    return { ok: true };
  });

export const askVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: docs } = await context.supabase
      .from("documents")
      .select("id,name,category,issue_date,expiry_date,extracted,summary")
      .limit(100);
    const vault = (docs ?? []).map((d) => ({
      id: d.id, name: d.name, category: d.category, issue_date: d.issue_date,
      expiry_date: d.expiry_date, summary: d.summary, details: d.extracted,
    }));
    const system = `You are SafeVault AI, a helpful assistant answering questions about the user's own documents. Today is ${new Date().toISOString().slice(0, 10)}. Use ONLY this vault data (JSON): ${JSON.stringify(vault)}. Be concise (under 150 words), plain text with "- " bullet points for details. If the answer is not in the data, say so. At the very end, if you used a document, add a line "SOURCE: <document id>".`;
    const text = await callGateway([{ role: "system", content: system }, ...data.messages]);
    const m = text.match(/SOURCE:\s*([0-9a-f-]{36})/i);
    const answer = text.replace(/SOURCE:[\s\S]*$/i, "").trim();
    const src = m ? vault.find((v) => v.id === m[1]) : undefined;
    return { answer, source: src ? { id: src.id, name: src.name } : null };
  });
