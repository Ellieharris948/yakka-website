import { Platform } from 'react-native';

export type StripeConnectIntent = 'return' | 'refresh';

function resolveWebOrigin() {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.location?.origin) return null;
  return window.location.origin;
}

export function buildStripeConnectUrls(returnPath = 'Onboarding') {
  const webOrigin = resolveWebOrigin();
  if (webOrigin) {
    const target = encodeURIComponent(returnPath);
    return {
      returnUrl: `${webOrigin}/app/?connect=return&target=${target}`,
      refreshUrl: `${webOrigin}/app/?connect=refresh&target=${target}`,
    };
  }

  return {
    returnUrl: `yakka://${returnPath}?connect=return`,
    refreshUrl: `yakka://${returnPath}?connect=refresh`,
  };
}

export function parseStripeConnectIntent(url: string | null | undefined): StripeConnectIntent | null {
  if (!url) return null;

  try {
    const normalized = url.startsWith('yakka://')
      ? url.replace('yakka://', 'https://yakka.local/')
      : url;
    const parsed = new URL(normalized);
    const intent = parsed.searchParams.get('connect');
    return intent === 'return' || intent === 'refresh' ? intent : null;
  } catch {
    return null;
  }
}
