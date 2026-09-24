import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import Text from './BrandText';

import { BRAND_COLORS } from '../theme';
import { getResponsiveScreenGutter } from '../utils/layout';

type Props = {
  onBack: () => void;
  title?: string;
  trailing?: React.ReactNode;
};

export default function PageBackHeader({ onBack, title, trailing }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  return (
    <View style={styles.outer}>
      <View style={[styles.row, { paddingHorizontal: screenGutter }]}>
        <IconButton
          icon="arrow-left"
          size={23}
          iconColor={theme.colors.onSurface}
          accessibilityLabel="Go back"
          onPress={onBack}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        />
        {!!title && (
          <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
            {title}
          </Text>
        )}
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  button: {
    margin: 0,
    borderWidth: 1,
    shadowColor: BRAND_COLORS.maroon,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    lineHeight: 25,
  },
});
