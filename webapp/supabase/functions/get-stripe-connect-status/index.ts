import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getStripeClient } from '../_shared/stripe.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE'))!,
);

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const stripe = STRIPE_SECRET_KEY ? getStripeClient(STRIPE_SECRET_KEY) : null;

function normalizeError(error: any) {
  return {
    code: error?.code ? String(error.code) : null,
    reason: error?.reason ? String(error.reason) : null,
    requirement: error?.requirement ? String(error.requirement) : null,
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!STRIPE_SECRET_KEY) return jsonResponse({ error: 'STRIPE_SECRET_KEY is missing in Supabase secrets.' }, 500);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData.user) return jsonResponse({ error: 'Not signed in' }, 401);

    const { data: connectRow, error: connectError } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (connectError) return jsonResponse({ error: connectError.message }, 500);
    const connectedAccountId = String(connectRow?.stripe_account_id || '').trim();
    if (!connectedAccountId) {
      return jsonResponse({
        status: {
          accountId: null,
          detailsSubmitted: false,
          payoutsEnabled: false,
          chargesEnabled: false,
          disabledReason: null,
          currentlyDue: [],
          pastDue: [],
          pendingVerification: [],
          eventuallyDue: [],
          errors: [],
        },
      });
    }

    const account = await stripe!.accounts.retrieve(connectedAccountId);
    const requirements = account?.requirements || {};
    const errors = Array.isArray(requirements.errors)
      ? requirements.errors.map(normalizeError)
      : [];

    const status = {
      accountId: String(account.id),
      detailsSubmitted: !!account.details_submitted,
      payoutsEnabled: !!account.payouts_enabled,
      chargesEnabled: !!account.charges_enabled,
      disabledReason: requirements.disabled_reason ? String(requirements.disabled_reason) : null,
      currentlyDue: Array.isArray(requirements.currently_due) ? requirements.currently_due : [],
      pastDue: Array.isArray(requirements.past_due) ? requirements.past_due : [],
      pendingVerification: Array.isArray(requirements.pending_verification) ? requirements.pending_verification : [],
      eventuallyDue: Array.isArray(requirements.eventually_due) ? requirements.eventually_due : [],
      errors,
    };

    const { error: statusError } = await supabase
      .from('stripe_connect_accounts')
      .update({
        details_submitted: status.detailsSubmitted,
        payouts_enabled: status.payoutsEnabled,
        charges_enabled: status.chargesEnabled,
        disabled_reason: status.disabledReason,
        requirements,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userData.user.id);
    if (statusError) throw statusError;

    const { data: teamAccount } = await supabase
      .from('team_accounts')
      .select('id')
      .eq('owner_user_id', userData.user.id)
      .maybeSingle();

    if (teamAccount?.id) {
      const verificationStatus = status.payoutsEnabled
        ? 'approved'
        : status.pastDue.length || errors.length
          ? 'rejected'
          : status.detailsSubmitted || status.pendingVerification.length
            ? 'reviewing'
            : 'pending';
      const payoutStatus = status.payoutsEnabled
        ? 'ready'
        : status.pastDue.length || errors.length
          ? 'restricted'
          : 'pending';

      await supabase
        .from('team_accounts')
        .update({
          verification_status: verificationStatus,
          payout_status: payoutStatus,
        })
        .eq('id', teamAccount.id);
    }

    return jsonResponse({ status });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
