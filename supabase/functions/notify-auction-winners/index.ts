// Supabase Edge Function: notify-auction-winners
//
// Runs on a schedule (see SUPABASE_SETUP.md §5). For every auction whose
// `closes_at` has passed and that hasn't been settled yet, it finds the highest
// bid in `orders`, emails that bidder "you won", and marks the work settled
// (winner_notified = true, ended = true, final_price = winning amount) so it is
// never processed twice.
//
// Env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically):
//   RESEND_API_KEY      – required, from https://resend.com
//   WINNER_FROM_EMAIL   – optional, e.g. "Art with Nia <nia@artwithnia.com>"
//   SITE_URL            – optional, link in the email (default https://artwithnia.com)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("WINNER_FROM_EMAIL") ?? "Art with Nia <nia@artwithnia.com>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://artwithnia.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

function winnerHtml(title: string, amount: string) {
  return `
  <div style="background:#f6f3ec;padding:40px 0;font-family:Georgia,'Times New Roman',serif;color:#211f1b">
    <div style="max-width:480px;margin:0 auto;background:#fffdf9;border:1px solid #e2dccf;border-radius:14px;padding:36px 34px">
      <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#a14b35;font-weight:bold">Auction won</p>
      <h1 style="margin:0 0 14px;font-weight:normal;font-size:30px;line-height:1.15;letter-spacing:-.01em">Congratulations — the piece is yours.</h1>
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#56514a">
        You placed the winning bid on <strong style="color:#211f1b">${title}</strong>.
      </p>
      <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#56514a">
        Winning bid: <strong style="color:#211f1b">${amount}</strong>.
      </p>
      <p style="margin:0 0 28px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#56514a">
        Nia will be in touch shortly to arrange payment and delivery. No action is needed right now — just keep an eye on your inbox.
      </p>
      <a href="${SITE_URL}" style="display:inline-block;background:#211f1b;color:#f6f3ec;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.02em;padding:13px 22px;border-radius:6px">View at Art with Nia</a>
      <p style="margin:28px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#8d867a">Art with Nia · New York</p>
    </div>
  </div>`;
}

Deno.serve(async () => {
  // auctions that have closed but aren't settled yet
  const { data: works, error } = await admin
    .from("works")
    .select("id,title")
    .eq("type", "auction")
    .eq("winner_notified", false)
    .lt("closes_at", new Date().toISOString());

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: unknown[] = [];

  for (const w of works ?? []) {
    // highest bid (earliest wins ties)
    const { data: bids } = await admin
      .from("orders")
      .select("user_id,amount")
      .eq("work_id", w.id)
      .eq("kind", "bid")
      .order("amount", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    const top = bids?.[0];

    if (top?.user_id) {
      const { data: u } = await admin.auth.admin.getUserById(top.user_id);
      const email = u?.user?.email;
      if (email) {
        try {
          await sendEmail(email, `You won "${w.title}"`, winnerHtml(w.title, usd(Number(top.amount))));
          results.push({ work: w.id, emailed: email, amount: top.amount });
        } catch (e) {
          // leave unsettled so the next run retries the email
          results.push({ work: w.id, error: String(e) });
          continue;
        }
      }
      await admin.from("works").update({ winner_notified: true, ended: true, final_price: top.amount }).eq("id", w.id);
    } else {
      // no bids — settle silently, no email
      await admin.from("works").update({ winner_notified: true, ended: true }).eq("id", w.id);
      results.push({ work: w.id, emailed: null });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
