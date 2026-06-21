// Supabase Edge Function: notify-commission
//
// Emails a new commission inquiry to Nia via Resend. The site calls this with
// `sb.functions.invoke("notify-commission", { body: {...} })` after saving the
// inquiry to the `commissions` table (see SUPABASE_SETUP.md §8).
//
// Env (set with `supabase secrets set ...`):
//   RESEND_API_KEY     – required, from https://resend.com  (same key as winner emails)
//   COMMISSION_TO      – optional, where inquiries go (default nia@artwithnia.com)
//   COMMISSION_FROM    – optional, verified sender (default "Art with Nia <nia@artwithnia.com>")

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const TO   = Deno.env.get("COMMISSION_TO")   ?? "nia@artwithnia.com";
const FROM = Deno.env.get("COMMISSION_FROM") ?? "Art with Nia <nia@artwithnia.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(d: Record<string, string>) {
  const row = (k: string, v: string) =>
    v ? `<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:14px;color:#56514a"><strong style="color:#211f1b">${k}:</strong> ${esc(v)}</p>` : "";
  return `
  <div style="background:#fff;padding:36px 0;font-family:Georgia,serif;color:#211f1b">
    <div style="max-width:520px;margin:0 auto;border:1px solid #e2dccf;border-radius:14px;padding:32px 30px">
      <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#a14b35;font-weight:bold">New commission inquiry</p>
      ${row("Name", d.name)}
      ${row("Email", d.email)}
      ${row("Project type", d.project_type)}
      ${row("Location", d.location)}
      ${row("Budget", d.budget)}
      <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#211f1b;white-space:pre-wrap">${esc(d.message)}</p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const d = await req.json();
    if (!d?.name || !d?.email || !d?.message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        reply_to: d.email,
        subject: `Commission inquiry — ${d.name}`,
        html: html(d),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
