// src/utils/money.ts
export function parseGBPToCents(input: string | number): number {
  let str = String(input ?? '').trim();
  str = str.replace(/[£,\s]/g, ''); // remove £, commas, spaces
  if (!str) throw new Error('Enter an amount in GBP.');
  if (!/^\d+(\.\d{0,2})?$/.test(str)) {
    throw new Error('Use up to 2 decimals, e.g. 60 or 60.50');
  }
  const [poundsStr, decStr = ''] = str.split('.');
  const pounds = Number(poundsStr);
  const dec2 = (decStr + '00').slice(0, 2);
  const cents = pounds * 100 + Number(dec2);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
  return cents;
}

export function formatGBPCents(cents: number): string {
  return (cents / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}
