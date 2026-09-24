import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { TextInput as PaperTextInput, useTheme } from 'react-native-paper';

import { BRAND_RADII } from '../theme';
import { getResponsiveControlHeight } from '../utils/layout';

type Props = React.ComponentProps<typeof PaperTextInput>;

/** Shared field typography, height and shape for every form flow. */
function BrandTextInput({ style, contentStyle, outlineStyle, mode = 'flat', ...props }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // Paper forwards unknown flat-mode props to React Native's native TextInput.
  // `outlineStyle` is a Paper-only ViewStyle prop and Android expects the native
  // TextInput style of the same name to be a string, so an array crashes the app.
  const outlinedProps = mode === 'outlined'
    ? { outlineStyle: [outlineStyle, styles.outline] }
    : {};

  return (
    <PaperTextInput
      {...props}
      {...outlinedProps}
      mode={mode}
      keyboardAppearance={props.keyboardAppearance ?? (theme.dark ? 'dark' : 'light')}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      style={[styles.input, style]}
      contentStyle={[
        styles.content,
        { minHeight: getResponsiveControlHeight(width) },
        contentStyle,
        {
          fontFamily: 'Satoshi-Regular',
          fontWeight: 'normal',
          fontSize: theme.fonts.bodyMedium.fontSize,
          lineHeight: theme.fonts.bodyMedium.lineHeight,
          textAlignVertical: props.multiline ? 'top' : 'center',
        },
      ]}
    />
  );
}

BrandTextInput.Icon = PaperTextInput.Icon;
BrandTextInput.Affix = PaperTextInput.Affix;

const styles = StyleSheet.create({
  input: {
    borderRadius: BRAND_RADII.control,
    overflow: 'hidden',
  },
  content: {
    fontFamily: 'Satoshi-Regular',
    textAlignVertical: 'center',
  },
  outline: {
    borderRadius: BRAND_RADII.control,
  },
});

export default BrandTextInput as typeof PaperTextInput;
