export const DEFAULT_FONT_SCALE = 1;
export const MIN_FONT_SCALE = 0.8;
export const MAX_FONT_SCALE = 1.6;
export const FONT_SCALE_STEP = 0.05;

const LEGACY_NAMED_SCALES: Record<string, number> = {
  small: 0.9,
  standard: 1,
  large: 1.1,
};

export function clampFontScale(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));
  const stepped = Math.round((clamped - MIN_FONT_SCALE) / FONT_SCALE_STEP) * FONT_SCALE_STEP + MIN_FONT_SCALE;
  return Number(stepped.toFixed(2));
}

/** Accepts both the previous named presets and persisted numeric slider values. */
export function normalizeFontScale(value: string | null): number {
  if (value == null || value.trim() === '') return DEFAULT_FONT_SCALE;
  if (value in LEGACY_NAMED_SCALES) return LEGACY_NAMED_SCALES[value];

  const numericValue = Number(value);
  return clampFontScale(numericValue);
}
