import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, Button as PaperButton, Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { BRAND_RADII } from '../theme';
import { getResponsiveControlHeight } from '../utils/layout';
import { getBrandButtonColors } from '../utils/brandPresentation';

type Props = React.ComponentProps<typeof PaperButton>;

export function sentenceCaseButtonLabel(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return value;

  const lower = value.toLowerCase();
  const firstLetter = lower.search(/[a-z]/);
  return firstLetter < 0
    ? value
    : `${lower.slice(0, firstLetter)}${lower[firstLetter].toUpperCase()}${lower.slice(firstLetter + 1)}`;
}

/**
 * The one action-button shape used throughout Yakka.
 * Icon-only controls intentionally continue to use Paper's IconButton.
 */
export default function BrandButton({ style, contentStyle, labelStyle, mode, children, ...props }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const iconSize = theme.fonts.labelLarge.fontSize;
  const hasChrome = mode != null && mode !== 'text';
  const flattenedLabelStyle = StyleSheet.flatten(labelStyle) || {};
  const { fontSize: _fontSize, lineHeight: _lineHeight, ...consistentLabelStyle } = flattenedLabelStyle;
  const actionColors = getBrandButtonColors({
    mode,
    dark: theme.dark,
    buttonColor: props.buttonColor,
    textColor: props.textColor,
  });
  const label = React.Children.map(children, child => (
    typeof child === 'string' ? sentenceCaseButtonLabel(child) : child
  ));
    const disabled = !!(props.disabled || props.loading);
    const filled = mode === 'contained' || mode === 'contained-tonal';
    const backgroundColor = disabled && filled ? (theme.dark ? '#6a292e' : '#fdb087')
      : actionColors.buttonColor ?? (mode === 'contained' ? theme.colors.primary
        : mode === 'contained-tonal' ? theme.colors.secondaryContainer : 'transparent');
    const color = disabled ? (filled ? (theme.dark ? '#f4f4ec' : '#581a1f') : theme.colors.onSurfaceDisabled) : actionColors.textColor
      ?? (mode === 'contained' ? theme.colors.onPrimary : mode === 'contained-tonal'
        ? theme.colors.onSecondaryContainer : theme.colors.primary);
    const accessibilityLabel = props.accessibilityLabel ?? label?.filter(child => typeof child === 'string').join(' ');
    const verticalPadding = props.compact ? 6 : 9;
    return (
      <Surface elevation={0} style={[style, styles.button, hasChrome && styles.chrome, {
        backgroundColor,
        overflow: 'hidden',
        ...(mode === 'outlined' ? { borderWidth: 1, borderColor: theme.colors.outline } : {}),
      }]}>
        <TouchableRipple onPress={props.onPress} onLongPress={props.onLongPress} disabled={disabled}
          accessibilityRole="button" accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled, busy: !!props.loading }} testID={props.testID}>
          <View style={[styles.content, {
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: verticalPadding,
            minHeight: getResponsiveControlHeight(width),
          }, props.compact && { minHeight: 42 }, contentStyle]}>
            {props.loading ? <ActivityIndicator size={iconSize} color={color} />
              : props.icon ? <Icon source={props.icon} size={iconSize} color={color} /> : null}
            <Text variant="labelLarge" allowFontScaling={false} maxFontSizeMultiplier={1}
              style={[styles.label, consistentLabelStyle, {
                color,
                flexShrink: 1,
                fontFamily: 'Satoshi-Bold',
                fontWeight: 'normal',
                lineHeight: theme.fonts.labelLarge.lineHeight,
              }]}>{label}</Text>
          </View>
        </TouchableRipple>
      </Surface>
    );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: BRAND_RADII.control,
  },
  chrome: {
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 9,
    elevation: 3,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Satoshi-Bold',
    flexShrink: 1,
    textAlign: 'center',
  },
});
