export const UK_VAT_RATE_BPS = 2_000;
export const VAT_NUMBER_CHECK_URL = 'https://www.gov.uk/check-uk-vat-number';
export const VAT_REGISTRATION_URL = 'https://www.gov.uk/register-for-vat';

export function normalizeVatRegistrationNumber(value: string) {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = compact.replace(/^GB/, '');
  if (!digits) return '';
  if (!/^\d{9}(?:\d{3})?$/.test(digits)) return String(value || '').toUpperCase().trim();

  const base = `GB ${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 9)}`;
  return digits.length === 12 ? `${base} ${digits.slice(9)}` : base;
}

export function isValidVatRegistrationNumber(value: string) {
  const digits = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GB/, '');
  return /^\d{9}(?:\d{3})?$/.test(digits);
}
