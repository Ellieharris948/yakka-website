export const MIN_PASSWORD_LENGTH = 12;

export function passwordValidationError(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return 'Use at least 12 characters. A memorable passphrase works well.';
  if (password.length > 128) return 'Use no more than 128 characters.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

export function passwordResetRedirect(webOrigin?: string, webPath = '/reset-password') {
  return webOrigin ? `${webOrigin}${webPath}` : 'yakka://reset-password';
}

export function parseRecoveryUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isWebAppRecovery = url.pathname.replace(/\/+$/, '') === '/app'
      && url.searchParams.get('reset-password') === '1';
    const isRecovery = url.protocol === 'yakka:'
      ? url.hostname === 'reset-password' && (!url.pathname || url.pathname === '/')
      : ['https:', 'http:'].includes(url.protocol)
        && (url.pathname === '/reset-password' || isWebAppRecovery);
    if (!isRecovery) return null;
    const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (params.get('error') || params.get('error_code')) {
      return { error: 'This reset link has expired or has already been used. Request a new link from the login screen.' };
    }
    if (params.get('type') !== 'recovery' || !access_token || !refresh_token) {
      return { error: 'Open the secure password reset link from your email, or request a new link from the login screen.' };
    }
    return { tokens: { access_token, refresh_token } };
  } catch {
    return null;
  }
}
