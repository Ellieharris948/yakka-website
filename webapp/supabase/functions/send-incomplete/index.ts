// supabase/functions/send-incomplete/index.ts
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const TO_EMAIL = Deno.env.get("OPS_EMAIL")!; // set to your support address

type Payload = { jobId: string; reason: string };

async function fetchJob(jobId: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/jobs?select=id,ref_code,title,description,status,start_date,end_date,price_cents,trader_id,client_id&id=eq.${jobId}`;
  const res = await fetch(url, {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      Prefer: "return=representation"
    }
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function fetchProfile(id: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/profiles?select=id,name,email&id=eq.${id}`;
  const res = await fetch(url, {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      Prefer: "return=representation"
    }
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

serve(async (req) => {
  try {
    const { jobId, reason } = (await req.json()) as Payload;
    const job = await fetchJob(jobId);
    const trader = job?.trader_id ? await fetchProfile(job.trader_id) : null;
    const client = job?.client_id ? await fetchProfile(job.client_id) : null;

    const subject = `Yakka – Job Incomplete: ${job?.title ?? jobId}`;
    const text = `
Job ID: ${job?.id}
Ref Code: ${job?.ref_code}
Title: ${job?.title}
Status: ${job?.status}
Start → End: ${job?.start_date} → ${job?.end_date}
Price (cents): ${job?.price_cents}

Client: ${client?.name} <${client?.email}> (${client?.id})
Trader: ${trader?.name} <${trader?.email}> (${trader?.id})

Client reason:
${reason}
`.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Yakka <noreply@yakka.app>",
        to: [TO_EMAIL],
        subject,
        text
      })
    });

    if (!res.ok) throw new Error(`Email send failed: ${await res.text()}`);

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
