export const HOLD_WARNING_DAYS = 80;
export const HOLD_LIMIT_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function getHeldAgeDays(heldSince: string | Date, now: string | Date = new Date()) {
  const heldAt = new Date(heldSince).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(heldAt) || !Number.isFinite(current) || current <= heldAt) return 0;
  return Math.floor((current - heldAt) / DAY_MS);
}

export function getHoldAgeState(heldSince: string | Date, now: string | Date = new Date()) {
  const ageDays = getHeldAgeDays(heldSince, now);
  return {
    ageDays,
    warning: ageDays >= HOLD_WARNING_DAYS,
    overdue: ageDays >= HOLD_LIMIT_DAYS,
    daysRemaining: Math.max(0, HOLD_LIMIT_DAYS - ageDays),
  };
}
