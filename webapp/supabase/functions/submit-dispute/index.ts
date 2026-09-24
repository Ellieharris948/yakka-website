import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { markPaymentDisputed } from '../_shared/payment_ledger.ts';

const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'gnashstudio@gmail.com';
const FROM_EMAIL = Deno.env.get('SUPPORT_FROM_EMAIL') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return jsonResponse({ error: 'Please sign in again.' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Please sign in again.' }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || '');
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!jobId || !items.length) return jsonResponse({ error: 'Select at least one disputed item.' }, 400);

    const { data: job, error: jobError } = await admin.from('jobs').select('*').eq('id', jobId).single();
    if (jobError || !job) return jsonResponse({ error: 'Job not found.' }, 404);
    if (job.client_id !== user.id) return jsonResponse({ error: 'Only this job’s customer can raise a dispute.' }, 403);
    if (!['in_progress', 'seller_done'].includes(job.status)) return jsonResponse({ error: 'This job cannot be disputed at this stage.' }, 400);

    for (const item of items) {
      if (String(item?.details || '').trim().length < 30) return jsonResponse({ error: 'Each disputed item needs at least 30 characters of detail.' }, 400);
      if (!Array.isArray(item?.evidencePhotoIds) || !item.evidencePhotoIds.length) return jsonResponse({ error: 'Each disputed item needs photo evidence.' }, 400);
      if (item.scopeChangeId) {
        const { data: change, error } = await admin.from('job_scope_changes').select('*').eq('id', item.scopeChangeId).eq('job_id', jobId).eq('status', 'funded').maybeSingle();
        const line = Number.isInteger(item.scopeLineIndex) && item.scopeLineIndex >= 0 ? change?.items?.[item.scopeLineIndex] : null;
        if (error || !line || item.jobItemId) return jsonResponse({ error: 'A selected extra-work line is invalid.' }, 400);
        item.title = `Extra work: ${line.title}`; item.amountCents = Number(line.qty) * Number(line.price_cents);
      }
      if (item.jobItemId) {
        const { count } = await admin.from('job_items').select('id', { head: true, count: 'exact' }).eq('id', item.jobItemId).eq('job_id', jobId);
        if (!count) return jsonResponse({ error: 'A selected job item is invalid.' }, 400);
      }
      const { data: evidenceRows } = await admin.from('job_photos').select('id').eq('job_id', jobId).eq('uploaded_by', user.id).in('id', item.evidencePhotoIds);
      if ((evidenceRows || []).length !== item.evidencePhotoIds.length) return jsonResponse({ error: 'Some dispute evidence is invalid.' }, 400);
    }

    const requestNumber = `DSP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const summary = `Disputed items: ${items.map((item: any) => item.title).join(', ')}`;
    const { data: dispute, error: disputeError } = await admin.from('disputes').insert({
      job_id: jobId, raised_by: user.id, status: 'open', summary,
      request_number: requestNumber, submitted_at: new Date().toISOString(),
    }).select('id').single();
    if (disputeError || !dispute) throw new Error(disputeError?.message || 'Could not save dispute.');

    const { error: itemError } = await admin.from('dispute_items').insert(items.map((item: any) => ({
      dispute_id: dispute.id,
      job_item_id: item.jobItemId || null,
      scope_change_id: item.scopeChangeId || null, scope_line_index: item.scopeLineIndex ?? null,
      title: String(item.title || 'Job item'),
      amount_cents: Math.max(0, Number(item.amountCents || 0)),
      details: String(item.details).trim(),
      photo_count: item.evidencePhotoIds.length,
      evidence_photo_ids: item.evidencePhotoIds,
      outcome: 'under_review',
    })));
    if (itemError) throw itemError;
    const { error: statusError } = await admin.from('jobs').update({ status: 'disputed' }).eq('id', jobId);
    if (statusError) throw statusError;
    const { data: payments, error: paymentError } = await admin
      .from('payments')
      .select('*')
      .eq('job_id', jobId)
      .in('status', ['funded'])
      .order('created_at', { ascending: true });
    if (paymentError) throw paymentError;
    for (const payment of payments || []) {
      await markPaymentDisputed(admin, {
        ...payment,
        tradie_id: payment.tradie_id || job.trader_id,
      }, dispute.id);
    }

    const [{ data: messages }, { data: photos }, { data: profile }] = await Promise.all([
      admin.from('messages').select('sender_id,body,created_at').eq('job_id', jobId).order('created_at'),
      admin.from('job_photos').select('stage,note,file_url,uploaded_by,created_at').eq('job_id', jobId).order('created_at'),
      admin.from('profiles').select('name,email').eq('id', user.id).maybeSingle(),
    ]);
    const customerEmail = profile?.email || user.email || '';
    const itemHtml = items.map((item: any) => `<li><strong>${escapeHtml(item.title)}</strong> — £${(Number(item.amountCents || 0) / 100).toFixed(2)}<br>${escapeHtml(item.details)}<br>Evidence IDs: ${escapeHtml(item.evidencePhotoIds.join(', '))}</li>`).join('');
    const chatHtml = (messages || []).map((message: any) => `<li>${escapeHtml(message.created_at)} — ${escapeHtml(message.sender_id)}: ${escapeHtml(message.body)}</li>`).join('');
    const photoHtml = (photos || []).map((photo: any) => `<li>${escapeHtml(photo.stage)} — <a href="${escapeHtml(photo.file_url)}">view image</a> ${escapeHtml(photo.note || '')}</li>`).join('');

    let emailSent = false;
    if (RESEND_API_KEY && FROM_EMAIL && customerEmail) {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `dispute-${dispute.id}` },
        body: JSON.stringify([
          { from: FROM_EMAIL, to: [SUPPORT_EMAIL], reply_to: customerEmail, subject: `[${requestNumber}] YAKKA dispute — ${job.title}`,
            html: `<h2>New dispute ${requestNumber}</h2><p>Job: ${escapeHtml(job.ref_code || job.id)} — ${escapeHtml(job.title)}</p><h3>Disputed items</h3><ul>${itemHtml}</ul><h3>Full job chat</h3><ul>${chatHtml}</ul><h3>All job images</h3><ul>${photoHtml}</ul>` },
          { from: FROM_EMAIL, to: [customerEmail], reply_to: SUPPORT_EMAIL, subject: `We received your YAKKA dispute ${requestNumber}`,
            html: `<p>Hi ${escapeHtml(profile?.name || 'there')},</p><p>We received your dispute and your evidence is now under review. Payment for the disputed items remains protected.</p><p><strong>Reference: ${requestNumber}</strong></p><p>We aim to respond within 5 working days.</p><p>YAKKA Support</p>` },
        ]),
      });
      emailSent = response.ok;
    }
    return jsonResponse({ requestNumber, emailSent }, 201);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not submit dispute.' }, 500);
  }
});
