import React from 'react';
import { StyleSheet } from 'react-native';
import { Text as PaperText } from 'react-native-paper';
import { getBrandFontFamily } from '../utils/brandPresentation';

type Props = React.ComponentProps<typeof PaperText>;

/**
 * Keeps every screen on the shared three-tier type scale. Colour, weight,
 * alignment and spacing can still be customised, but local font sizes and
 * line heights cannot drift away from the accessibility setting.
 */
export default function BrandText({ style, variant = 'bodyMedium', ...props }: Props) {
  const flattened = StyleSheet.flatten(style) || {};
  const { fontSize: _fontSize, lineHeight: _lineHeight, ...consistentStyle } = flattened;
  const variantFamily = /^(display|headline|title|label)/.test(variant)
    ? 'Satoshi-Bold'
    : 'Satoshi-Regular';
  const fontFamily = getBrandFontFamily(consistentStyle.fontWeight, consistentStyle.fontFamily || variantFamily);

  return (
    <PaperText
      {...props}
      variant={variant}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      style={[consistentStyle, { fontFamily, fontWeight: 'normal' }]}
    />
  );
}
