export function normalizeUkPhone(value: string | null | undefined) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0044')) digits = digits.slice(4);
  else if (digits.startsWith('44')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits ? `+44${digits}` : '';
}

export function isValidUkMobile(value: string | null | undefined) {
  return /^\+447\d{9}$/.test(normalizeUkPhone(value));
}
