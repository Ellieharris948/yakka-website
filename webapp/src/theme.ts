import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { BRAND_ACTION_COLORS } from './utils/brandPresentation';

export { BRAND_ACTION_COLORS } from './utils/brandPresentation';

const LIGHT_BRAND_COLORS = {
  maroon: '#581a1f',
  maroonStrong: '#6a292e',
  stone: '#fdb087',
  stoneSoft: '#f4f4ec',
  cream: '#f4f4ec',
  creamSoft: '#fefefe',
  orange: '#fe4d00',
  orangeSoft: '#fdb087',
  textMuted: '#6a292e',
  outline: '#fdb087',
  white: '#fefefe',
} as const;

export const BRAND_COLORS: {
  [K in keyof typeof LIGHT_BRAND_COLORS]: string;
} = {
  ...LIGHT_BRAND_COLORS,
};

const DARK_BRAND_COLORS: typeof BRAND_COLORS = {
  maroon: '#f4f4ec',
  maroonStrong: '#fefefe',
  stone: '#fdb087',
  stoneSoft: '#6a292e',
  cream: '#581a1f',
  creamSoft: '#6a292e',
  orange: '#fe4d00',
  orangeSoft: '#fdb087',
  textMuted: '#e9e2d7',
  outline: '#b99386',
  white: '#fefefe',
};

export function setBrandColorMode(mode: 'light' | 'dark') {
  Object.assign(
    BRAND_COLORS,
    mode === 'dark' ? DARK_BRAND_COLORS : LIGHT_BRAND_COLORS,
  );
}

// Match the app chrome to the burgundy layer beneath it so safe-area insets
// and notches do not create a visible colour seam.
export const BRAND_GRADIENT = ['#581a1f', '#581a1f'] as const;

export const BRAND_DARK_HEADER_GRADIENT = [
  '#581a1f',
  '#581a1f',
] as const;

export function getBrandHeaderGradient(dark: boolean) {
  return dark ? BRAND_DARK_HEADER_GRADIENT : BRAND_GRADIENT;
}

export const BRAND_PAGE_GRADIENT = [
  '#f4f4ec',
  '#f4f4ec',
  '#fefefe',
] as const;

export const BRAND_DARK_PAGE_GRADIENT = [
  '#581a1f',
  '#6a292e',
  '#581a1f',
] as const;

export const BRAND_STATUS_COLORS = {
  progress: '#5d98ad',
  attention: '#f58a3a',
  pending: '#f6d38f',
  pendingSoft: '#f9e8bf',
  success: '#4f9a69',
  successSoft: '#d9eee2',
  danger: '#a52626',
  mediaBackdrop: '#111111',
} as const;

export const BRAND_RADII = {
  control: 18,
  card: 18,
  panel: 24,
  pill: 999,
} as const;

export const BRAND_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * The two intentional vertical relationships used inside page content.
 * Related copy stays close; a new content section gets the larger gap.
 */
export const BRAND_CONTENT_GAPS = {
  related: 8,
  section: 16,
} as const;

/**
 * Shared action padding.
 * React Native Paper contributes its own label/icon insets.
 */
export const BRAND_BUTTON_METRICS = {
  contentPaddingHorizontal: 4,
  contentPaddingVertical: 2,
  leadingIconInset: 20,
  actionPaddingVertical: 8,
  iconTextGap: 8,
} as const;

/**
 * One motion language for screens, sheets and draggable controls.
 */
export const BRAND_MOTION = {
  duration: {
    fast: 180,
    standard: 240,
    screen: 300,
  },
  spring: {
    damping: 26,
    stiffness: 260,
    mass: 0.82,
  },
} as const;

export const BRAND_TYPOGRAPHY = {
  jobCode: {
    fontFamily: 'Satoshi-Bold',
    fontVariant: [
      'tabular-nums',
    ] as NonNullable<TextStyle['fontVariant']>,
    letterSpacing: 0.7,

    // Android adds extra vertical font padding by default.
    // Removing it keeps Satoshi positioned more consistently
    // between Android and iOS.
    ...(Platform.OS === 'android'
      ? { includeFontPadding: false }
      : {}),
  },
} as const;

const displayVariants = new Set([
  'displayLarge',
  'displayMedium',
  'displaySmall',
]);

const headingVariants = new Set([
  'headlineLarge',
  'headlineMedium',
  'headlineSmall',
]);

const titleVariants = new Set([
  'titleLarge',
  'titleMedium',
  'titleSmall',
]);

const labelVariants = new Set([
  'labelLarge',
  'labelMedium',
  'labelSmall',
]);

const bodyVariants = new Set([
  'bodyLarge',
  'bodyMedium',
  'bodySmall',
]);

/**
 * Keep these sizes fixed across devices.
 *
 * Screen width should affect layout, padding and wrapping —
 * not the base typography scale.
 */
export const BRAND_TYPE_TIERS = {
  heading: {
    fontSize: 22,
    lineHeight: 28,
  },
  subheading: {
    fontSize: 17,
    lineHeight: 23,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
} as const;

const typeScale: Record<
  string,
  {
    fontSize: number;
    lineHeight: number;
  }
> = {
  displayLarge: BRAND_TYPE_TIERS.heading,
  displayMedium: BRAND_TYPE_TIERS.heading,
  displaySmall: BRAND_TYPE_TIERS.heading,

  headlineLarge: BRAND_TYPE_TIERS.heading,
  headlineMedium: BRAND_TYPE_TIERS.heading,
  headlineSmall: BRAND_TYPE_TIERS.heading,

  titleLarge: BRAND_TYPE_TIERS.heading,

  titleMedium: BRAND_TYPE_TIERS.subheading,
  titleSmall: BRAND_TYPE_TIERS.subheading,

  labelLarge: BRAND_TYPE_TIERS.body,
  labelMedium: BRAND_TYPE_TIERS.body,
  labelSmall: BRAND_TYPE_TIERS.body,

  bodyLarge: BRAND_TYPE_TIERS.body,
  bodyMedium: BRAND_TYPE_TIERS.body,
  bodySmall: BRAND_TYPE_TIERS.body,
};

const fonts = Object.fromEntries(
  Object.entries(MD3LightTheme.fonts).map(
    ([variant, values]) => [
      variant,
      {
        ...values,

        ...(typeScale[variant] || {}),

        fontFamily:
          displayVariants.has(variant) ||
          headingVariants.has(variant) ||
          titleVariants.has(variant) ||
          labelVariants.has(variant)
            ? 'Satoshi-Bold'
            : bodyVariants.has(variant)
              ? 'Satoshi-Regular'
              : 'Satoshi-Regular',

        /**
         * The font file itself controls the weight.
         *
         * Using "normal" here prevents Android/iOS from trying
         * to artificially apply another font weight on top of
         * Satoshi-Bold or Satoshi-Regular.
         */
        fontWeight: 'normal',

        /**
         * Android normally includes additional space above and
         * below text. This makes buttons, headings and rows appear
         * slightly different from iOS.
         *
         * Disable that extra padding on Android only.
         */
        ...(Platform.OS === 'android'
          ? { includeFontPadding: false }
          : {}),
      },
    ],
  ),
) as unknown as typeof MD3LightTheme.fonts;

export const YakaLight = {
  ...MD3LightTheme,

  fonts,

  roundness: BRAND_RADII.control,

  colors: {
    ...MD3LightTheme.colors,

    /*
     * Use the fixed light palette here rather than the mutable
     * BRAND_COLORS object. This ensures YakaLight always remains
     * the light theme even if BRAND_COLORS is switched elsewhere.
     */
    primary: BRAND_ACTION_COLORS.lightLink,
    onPrimary: LIGHT_BRAND_COLORS.white,

    primaryContainer: LIGHT_BRAND_COLORS.orangeSoft,
    onPrimaryContainer: LIGHT_BRAND_COLORS.maroon,

    secondary: LIGHT_BRAND_COLORS.orangeSoft,
    onSecondary: LIGHT_BRAND_COLORS.maroon,

    secondaryContainer: LIGHT_BRAND_COLORS.orangeSoft,
    onSecondaryContainer: LIGHT_BRAND_COLORS.maroon,

    tertiary: LIGHT_BRAND_COLORS.maroonStrong,
    onTertiary: LIGHT_BRAND_COLORS.cream,

    tertiaryContainer: LIGHT_BRAND_COLORS.orangeSoft,
    onTertiaryContainer: LIGHT_BRAND_COLORS.maroon,

    background: LIGHT_BRAND_COLORS.cream,
    onBackground: LIGHT_BRAND_COLORS.maroon,

    surface: LIGHT_BRAND_COLORS.creamSoft,
    onSurface: LIGHT_BRAND_COLORS.maroon,

    surfaceVariant: LIGHT_BRAND_COLORS.cream,
    onSurfaceVariant: LIGHT_BRAND_COLORS.textMuted,

    outline: LIGHT_BRAND_COLORS.outline,
    outlineVariant: LIGHT_BRAND_COLORS.orangeSoft,

    inverseSurface: LIGHT_BRAND_COLORS.maroon,
    inverseOnSurface: LIGHT_BRAND_COLORS.cream,

    error: LIGHT_BRAND_COLORS.orange,
    onError: '#000000',

    errorContainer: LIGHT_BRAND_COLORS.orangeSoft,
    onErrorContainer: LIGHT_BRAND_COLORS.maroon,

    elevation: {
      level0: 'transparent',
      level1: LIGHT_BRAND_COLORS.cream,
      level2: LIGHT_BRAND_COLORS.cream,
      level3: LIGHT_BRAND_COLORS.cream,
      level4: LIGHT_BRAND_COLORS.orangeSoft,
      level5: LIGHT_BRAND_COLORS.orangeSoft,
    },

    // @ts-ignore custom tokens for app-level styling
    brandOrange: LIGHT_BRAND_COLORS.orange,

    // @ts-ignore custom tokens for app-level styling
    brandCream: LIGHT_BRAND_COLORS.cream,

    // @ts-ignore custom tokens for app-level styling
    brandMaroon: LIGHT_BRAND_COLORS.maroon,

    // @ts-ignore custom tokens for app-level styling
    brandStone: LIGHT_BRAND_COLORS.stone,

    // @ts-ignore custom tokens for app-level styling
    brandStoneSoft: LIGHT_BRAND_COLORS.stoneSoft,
  },
};

export const YakaDark = {
  ...MD3DarkTheme,

  fonts,

  roundness: BRAND_RADII.control,

  colors: {
    ...MD3DarkTheme.colors,

    primary: BRAND_ACTION_COLORS.darkLink,
    onPrimary: BRAND_ACTION_COLORS.onDarkPrimary,

    primaryContainer: DARK_BRAND_COLORS.orange,
    onPrimaryContainer: DARK_BRAND_COLORS.white,

    secondary: DARK_BRAND_COLORS.orangeSoft,
    onSecondary: '#581a1f',

    secondaryContainer: DARK_BRAND_COLORS.maroonStrong,
    onSecondaryContainer: '#581a1f',

    tertiary: DARK_BRAND_COLORS.orangeSoft,
    onTertiary: '#581a1f',

    tertiaryContainer: DARK_BRAND_COLORS.maroonStrong,
    onTertiaryContainer: '#581a1f',

    background: DARK_BRAND_COLORS.cream,
    onBackground: DARK_BRAND_COLORS.maroon,

    surface: DARK_BRAND_COLORS.creamSoft,
    onSurface: DARK_BRAND_COLORS.maroon,

    surfaceVariant: DARK_BRAND_COLORS.stoneSoft,
    onSurfaceVariant: DARK_BRAND_COLORS.textMuted,

    outline: DARK_BRAND_COLORS.outline,
    outlineVariant: DARK_BRAND_COLORS.maroonStrong,

    inverseSurface: DARK_BRAND_COLORS.maroon,
    inverseOnSurface: '#581a1f',

    error: '#ff8a63',
    onError: '#581a1f',

    errorContainer: DARK_BRAND_COLORS.orangeSoft,
    onErrorContainer: '#581a1f',

    elevation: {
      level0: 'transparent',
      level1: DARK_BRAND_COLORS.creamSoft,
      level2: DARK_BRAND_COLORS.creamSoft,
      level3: DARK_BRAND_COLORS.stoneSoft,
      level4: DARK_BRAND_COLORS.stoneSoft,
      level5: DARK_BRAND_COLORS.stoneSoft,
    },

    /*
     * Keep the same custom colour keys available in dark mode.
     * This prevents a component working with YakaLight but not
     * finding the same custom token when YakaDark is active.
     */

    // @ts-ignore custom tokens for app-level styling
    brandOrange: DARK_BRAND_COLORS.orange,

    // @ts-ignore custom tokens for app-level styling
    brandCream: DARK_BRAND_COLORS.cream,

    // @ts-ignore custom tokens for app-level styling
    brandMaroon: DARK_BRAND_COLORS.maroon,

    // @ts-ignore custom tokens for app-level styling
    brandStone: DARK_BRAND_COLORS.stone,

    // @ts-ignore custom tokens for app-level styling
    brandStoneSoft: DARK_BRAND_COLORS.stoneSoft,
  },
};

export function getPopupSurfaceStyle(theme: {
  dark: boolean;
  colors: {
    elevation: {
      level3: string;
    };
    outlineVariant: string;
  };
}): ViewStyle {
  return {
    borderRadius: 14,

    backgroundColor: theme.colors.elevation.level3,

    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,

    shadowColor: '#581a1f',
    shadowOffset: {
      width: 0,
      height: 8,
    },

    shadowOpacity: theme.dark ? 0.28 : 0.1,
    shadowRadius: 18,

    elevation: 6,
  };
}

/**
 * Keep this function because other parts of the app may already
 * import it.
 *
 * IMPORTANT:
 * Do not pass screen width, PixelRatio, Dimensions width or another
 * device-dependent value into this function if you want YAKKA's
 * typography to remain consistent between phones.
 *
 * A scale of 1 keeps the design-system sizes exactly:
 *
 * Heading:    22 / 28
 * Subheading: 17 / 23
 * Body:       15 / 21
 */
export function scaleThemeFonts<
  T extends {
    fonts: typeof YakaLight.fonts;
  },
>(
  theme: T,
  scale: number,
): T {
  const safeScale =
    Number.isFinite(scale) && scale > 0
      ? scale
      : 1;

  const scaledFonts = Object.fromEntries(
    Object.entries(theme.fonts).map(
      ([variant, values]) => {
        const font = values as {
          fontSize?: number;
          lineHeight?: number;
        };

        const scaledFontSize =
          typeof font.fontSize === 'number'
            ? Math.round(
                font.fontSize *
                  safeScale *
                  10,
              ) / 10
            : undefined;

        return [
          variant,
          {
            ...values,

            ...(typeof scaledFontSize === 'number'
              ? {
                  fontSize: scaledFontSize,
                }
              : {}),

            ...(typeof font.lineHeight === 'number'
              ? {
                  lineHeight: Math.max(
                    (scaledFontSize || 12) + 4,
                    Math.round(
                      font.lineHeight *
                        safeScale *
                        10,
                    ) / 10,
                  ),
                }
              : {}),
          },
        ];
      },
    ),
  ) as unknown as typeof theme.fonts;

  return {
    ...theme,
    fonts: scaledFonts,
  } as T;
}
