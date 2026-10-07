import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3-flash-preview";

async function callGateway(body: unknown) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Too many requests, please try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
  if (!res.ok) {
    console.error("AI gateway error", res.status, await res.text());
    throw new Error("AI service unavailable");
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content ?? "";
}

export const extractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase.from("documents").select("*").eq("id", data.id).single();
    if (error || !doc) throw new Error("Document not found");

    const content: unknown[] = [
      {
        type: "text",
        text: `Analyse this personal document named "${doc.name}". Return ONLY JSON: {"category": one of Identity|Education|Insurance|Financial|Others, "document_type": string, "fields": {label: value} with the key details (name, numbers, dates, provider, etc.), "issue_date": "YYYY-MM-DD"|null, "expiry_date": "YYYY-MM-DD"|null, "summary": one sentence}.`,
      },
    ];
    if (doc.mime_type?.startsWith("image/")) {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300);
      if (signed?.signedUrl) content.push({ type: "image_url", image_url: { url: signed.signedUrl } });
    }

    let parsed: {
      category?: string; document_type?: string; fields?: Record<string, string>;
      issue_date?: string | null; expiry_date?: string | null; summary?: string;
    } = {};
    try {
      const text = await callGateway({ model: MODEL, messages: [{ role: "user", content }], response_format: { type: "json_object" } });
      parsed = JSON.parse(text.replace(/^```json|```$/g, "").trim());
    } catch (e) {
      console.error(e);
      await supabase.from("documents").update({ status: "ready" }).eq("id", doc.id);
      return { ok: false };
    }
    const dateOk = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const cats = ["Identity", "Education", "Insurance", "Financial", "Others"];
    await supabase.from("documents").update({
      category: cats.includes(parsed.category ?? "") ? parsed.category! : doc.category,
      extracted: { document_type: parsed.document_type ?? null, fields: parsed.fields ?? {} },
      issue_date: doc.issue_date ?? dateOk(parsed.issue_date),
      expiry_date: doc.expiry_date ?? dateOk(parsed.expiry_date),
      summary: parsed.summary ?? null,
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
    const system = `You are SafeVault AI, a helpful assistant answering questions about the user's own documents. Today is ${new Date().toISOString().slice(0, 10)}. Use ONLY this vault data (JSON): ${JSON.stringify(vault)}. Be concise, use bullet points for details. If the answer is not in the data, say so. At the very end, if you used a document, add a line "SOURCE: <document id>".`;
    const text = await callGateway({ model: MODEL, messages: [{ role: "system", content: system }, ...data.messages] });
    const m = text.match(/SOURCE:\s*([0-9a-f-]{36})/i);
    const answer = text.replace(/SOURCE:.*$/is, "").trim();
    const src = m ? vault.find((v) => v.id === m[1]) : undefined;
    return { answer, source: src ? { id: src.id, name: src.name } : null };
  });
