import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getStripeClient } from '../_shared/stripe.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE'))!,
);

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_CONNECT_REFRESH_URL =
  Deno.env.get('STRIPE_CONNECT_REFRESH_URL') ?? 'https://yakka.app/connect/refresh';
const STRIPE_CONNECT_RETURN_URL =
  Deno.env.get('STRIPE_CONNECT_RETURN_URL') ?? 'https://yakka.app/connect/return';
const stripe = STRIPE_SECRET_KEY ? getStripeClient(STRIPE_SECRET_KEY) : null;

function isMissingStripeConnectSchema(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('stripe_connect_accounts') || message.includes('schema cache');
}

async function saveConnectedAccountId(userId: string, accountId: string) {
  const { error } = await supabase
    .from('stripe_connect_accounts')
    .upsert({
      user_id: userId,
      stripe_account_id: accountId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) {
    if (isMissingStripeConnectSchema(error)) {
      throw new Error('Stripe payout storage is not installed. Apply the latest Supabase migration and try again.');
    }
    throw error;
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!STRIPE_SECRET_KEY) return jsonResponse({ error: 'STRIPE_SECRET_KEY is missing in Supabase secrets.' }, 500);

  try {
    const requestBody = await req.json().catch(() => ({}));
    const refreshUrl =
      typeof requestBody?.refreshUrl === 'string' && requestBody.refreshUrl.trim()
        ? requestBody.refreshUrl.trim()
        : STRIPE_CONNECT_REFRESH_URL;
    const returnUrl =
      typeof requestBody?.returnUrl === 'string' && requestBody.returnUrl.trim()
        ? requestBody.returnUrl.trim()
        : STRIPE_CONNECT_RETURN_URL;

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData.user) return jsonResponse({ error: 'Not signed in' }, 401);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single();
    if (profileError || !profile) {
      return jsonResponse({ error: profileError?.message ?? 'Profile not found' }, 404);
    }

    const { data: connectRow, error: connectError } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (connectError) {
      const message = isMissingStripeConnectSchema(connectError)
        ? 'Stripe payout storage is not installed. Apply the latest Supabase migration and try again.'
        : connectError.message;
      return jsonResponse({ error: message }, 500);
    }

    const { data: teamAccount } = await supabase
      .from('team_accounts')
      .select('*')
      .eq('owner_user_id', userData.user.id)
      .maybeSingle();

    let connectedAccountId = String(connectRow?.stripe_account_id || '').trim();

    if (!connectedAccountId) {
      const firstName = String(profile?.name || '').trim().split(/\s+/)[0] || undefined;
      const lastNameParts = String(profile?.name || '').trim().split(/\s+/).slice(1).join(' ');
      const account = await stripe!.accounts.create({
        country: String(profile?.country_code || 'GB').toUpperCase(),
        email: userData.user.email ?? undefined,
        controller: {
          fees: { payer: 'application' },
          losses: { payments: 'application' },
          stripe_dashboard: { type: 'express' },
        },
        capabilities: { transfers: { requested: true } },
        metadata: {
          yakka_user_id: userData.user.id,
          yakka_role: String(profile?.role ?? 'trader'),
          ...(teamAccount?.company_registration_number
            ? { yakka_company_number: String(teamAccount.company_registration_number) }
            : {}),
        },
        business_profile: {
          ...(teamAccount?.business_name ? { name: String(teamAccount.business_name) } : {}),
          product_description: 'Tradesperson services sold and paid through YAKKA.',
        },
        business_type: teamAccount ? 'company' : 'individual',
        ...(!teamAccount ? { individual: { first_name: firstName, last_name: lastNameParts || undefined } } : {}),
        ...(teamAccount?.business_name ? { company: { name: String(teamAccount.business_name) } } : {}),
      }, { idempotencyKey: `yakka-connect-account-${userData.user.id}` });

      connectedAccountId = String(account.id);
      await saveConnectedAccountId(userData.user.id, connectedAccountId);
    }

    const accountLink = await stripe!.accountLinks.create({
      account: connectedAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
      collection_options: { fields: 'eventually_due' },
    });

    if (teamAccount?.id) {
      await supabase
        .from('team_accounts')
        .update({ payout_provider: 'stripe', payout_status: 'pending' })
        .eq('id', teamAccount.id);
    }

    return jsonResponse({
      accountId: connectedAccountId,
      url: accountLink.url,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
