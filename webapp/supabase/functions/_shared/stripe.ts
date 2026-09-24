import Stripe from 'npm:stripe@22.4.0';

let stripeClient: Stripe | null = null;
let configuredKey = '';

export function getStripeClient(secretKey: string) {
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is missing in Supabase secrets.');
  if (!stripeClient || configuredKey !== secretKey) {
    stripeClient = new Stripe(secretKey, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
    configuredKey = secretKey;
  }
  return stripeClient;
}

export function stripeObjectId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export function stripeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) return message;
  }
  return fallback;
}

export async function constructStripeEvent(
  stripe: Stripe,
  payload: string,
  signature: string,
  secrets: string[],
) {
  let lastError: unknown = null;
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        secret,
        undefined,
        cryptoProvider,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Invalid Stripe signature');
}
