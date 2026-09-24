import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'gnashstudio@gmail.com';
const FROM_EMAIL = Deno.env.get('SUPPORT_FROM_EMAIL') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

const allowedCategories = new Set(['get_help', 'report_bug', 'account', 'payment', 'other']);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    get_help: 'Get help',
    report_bug: 'Report a bug',
    account: 'Account',
    payment: 'Payment',
    other: 'Other',
  };
  return labels[value] || 'Other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Please sign in again.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Please sign in again.' }, 401);

    const body = await req.json().catch(() => ({}));
    const category = String(body?.category || '').trim();
    const subject = String(body?.subject || '').trim();
    const message = String(body?.message || '').trim();
    const jobId = body?.jobId ? String(body.jobId).trim() : null;

    if (!allowedCategories.has(category)) return jsonResponse({ error: 'Choose a support category.' }, 400);
    if (subject.length < 3 || subject.length > 140) {
      return jsonResponse({ error: 'Add a subject between 3 and 140 characters.' }, 400);
    }
    if (message.length < 10 || message.length > 5000) {
      return jsonResponse({ error: 'Add a message between 10 and 5,000 characters.' }, 400);
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('name,email,phone,role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const userEmail = String(profile?.email || authData.user.email || '').trim().toLowerCase();
    if (!userEmail) return jsonResponse({ error: 'Your account does not have an email address.' }, 400);

    const { data: requestRow, error: insertError } = await adminClient
      .from('support_requests')
      .insert({
        user_id: authData.user.id,
        user_role: profile?.role || null,
        name: profile?.name || null,
        email: userEmail,
        phone: profile?.phone || null,
        category,
        subject,
        message,
        job_id: jobId || null,
      })
      .select('id,request_number,created_at')
      .single();

    if (insertError || !requestRow) {
      throw new Error(insertError?.message || 'Could not save the support request.');
    }

    if (!RESEND_API_KEY || !FROM_EMAIL) {
      await adminClient
        .from('support_requests')
        .update({ email_status: 'not_configured', email_error: 'Email provider is not configured.' })
        .eq('id', requestRow.id);

      return jsonResponse({
        requestNumber: requestRow.request_number,
        emailSent: false,
        emailWarning: 'Your request was saved, but the confirmation email service is not configured yet.',
      }, 201);
    }

    const safeMessage = escapeHtml(message).replaceAll('\n', '<br />');
    const safeName = escapeHtml(profile?.name || 'YAKKA user');
    const safeSubject = escapeHtml(subject);
    const safeRequest = escapeHtml(requestRow.request_number);
    const safeCategory = escapeHtml(categoryLabel(category));
    const safeJob = escapeHtml(jobId || 'Not linked to a job');
    const supportSubject = `[${requestRow.request_number}] ${categoryLabel(category)}: ${subject}`;

    const emailResponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `support-${requestRow.id}`,
      },
      body: JSON.stringify([
        {
          from: FROM_EMAIL,
          to: [SUPPORT_EMAIL],
          reply_to: userEmail,
          subject: supportSubject,
          html: `<h2>New YAKKA support request ${safeRequest}</h2>
            <p><strong>Category:</strong> ${safeCategory}</p>
            <p><strong>User:</strong> ${safeName} (${escapeHtml(userEmail)})</p>
            <p><strong>User ID:</strong> ${escapeHtml(authData.user.id)}</p>
            <p><strong>Job:</strong> ${safeJob}</p>
            <p><strong>Subject:</strong> ${safeSubject}</p>
            <hr /><p>${safeMessage}</p>`,
        },
        {
          from: FROM_EMAIL,
          to: [userEmail],
          reply_to: SUPPORT_EMAIL,
          subject: `We received your YAKKA request ${requestRow.request_number}`,
          html: `<p>Hi ${safeName},</p>
            <p>We have received your message and will get back to you as soon as possible.</p>
            <p><strong>Your request number is ${safeRequest}.</strong></p>
            <p>Subject: ${safeSubject}</p>
            <p>Please keep this number if you contact us again about the same request.</p>
            <p>Thanks,<br />YAKKA Support</p>`,
        },
      ]),
    });

    if (!emailResponse.ok) {
      const providerError = await emailResponse.text();
      await adminClient
        .from('support_requests')
        .update({ email_status: 'failed', email_error: providerError.slice(0, 1000) })
        .eq('id', requestRow.id);

      return jsonResponse({
        requestNumber: requestRow.request_number,
        emailSent: false,
        emailWarning: 'Your request was saved, but the confirmation email could not be sent.',
      }, 201);
    }

    await adminClient
      .from('support_requests')
      .update({ email_status: 'sent', email_error: null })
      .eq('id', requestRow.id);

    return jsonResponse({ requestNumber: requestRow.request_number, emailSent: true }, 201);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not send the request.' }, 500);
  }
});
