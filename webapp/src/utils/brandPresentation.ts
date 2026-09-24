/** Exact colours from the YAKKA July 2026 brand palette. */
export const BRAND_ACTION_COLORS = {
  accent: '#fe4d00',
  // Burgundy and cream keep normal-size action labels readable for older
  // users, while orange remains the high-visibility accent and focus colour.
  filled: '#581a1f',
  onFilled: '#f4f4ec',
  lightLink: '#581a1f',
  darkLink: '#f4f4ec',
  onDarkPrimary: '#581a1f',
} as const;

export function getBrandButtonColors({
  mode,
  dark,
  buttonColor,
  textColor,
}: {
  mode?: string;
  dark: boolean;
  buttonColor?: string;
  textColor?: string;
}) {
  const isBrandFill = mode === 'contained'
    && (!buttonColor || buttonColor.toLowerCase() === BRAND_ACTION_COLORS.accent);
  const isAccentText = textColor?.toLowerCase() === BRAND_ACTION_COLORS.accent;
  const softLabel = buttonColor?.toLowerCase() === '#fdb087'
    ? '#581a1f'
    : undefined;

  return {
    buttonColor: isBrandFill ? BRAND_ACTION_COLORS.filled : buttonColor,
    textColor: isBrandFill
      ? BRAND_ACTION_COLORS.onFilled
      : isAccentText
        ? softLabel ?? (dark ? BRAND_ACTION_COLORS.darkLink : BRAND_ACTION_COLORS.lightLink)
        : textColor,
  };
}

/** Select the bundled face instead of asking Android/iOS to synthesize a weight. */
export function getBrandFontFamily(weight: string | number | undefined, fallback: string) {
  if (weight === undefined) return fallback;
  if (weight === 'bold' || (Number.isFinite(Number(weight)) && Number(weight) >= 600)) {
    return 'Satoshi-Bold';
  }
  return 'Satoshi-Regular';
}
