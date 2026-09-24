export const BRAND_CONTENT_MAX_WIDTH = 720;
export const BRAND_NATIVE_APP_MAX_WIDTH = 520;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Yakka uses one canonical logical-pixel layout on every phone. React Native
 * already converts logical pixels for each device density, so applying a
 * second width multiplier made wider phones and Android display-size settings
 * look like different apps.
 *
 * Typography deliberately does not use this value: React Native logical
 * pixels already account for device density and the user's three text-size
 * choices provide the one predictable font multiplier.
 */
export function getResponsiveLayoutScale(width: number) {
  void width;
  return 1;
}

export function getResponsiveLayoutValue(
  value: number,
  width: number,
  limits: { min?: number; max?: number } = {},
) {
  const scaledValue = Math.round(value * getResponsiveLayoutScale(width) * 10) / 10;
  return clamp(
    scaledValue,
    limits.min ?? Number.NEGATIVE_INFINITY,
    limits.max ?? Number.POSITIVE_INFINITY,
  );
}

/** One shared page gutter across phones, foldables and the centred tablet view. */
export function getResponsiveScreenGutter(width: number) {
  void width;
  return 16;
}

export function getResponsiveControlHeight(width: number) {
  void width;
  return 50;
}
