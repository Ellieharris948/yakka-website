import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Chip, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PageBackHeader from './PageBackHeader';
import { getResponsiveLayoutValue, getResponsiveScreenGutter } from '../utils/layout';
import BrandHeaderBar from './BrandHeaderBar';
import { useAccessibilitySettings } from '../context/AccessibilityContext';

type Props = {
  title: string;
  onBack: () => void;
  chipLabel?: string;
  light?: boolean;
};

export default function BrandScreenHeader({ title, onBack, chipLabel, light = false }: Props) {
  void light;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { fontScale } = useAccessibilitySettings();
  const screenGutter = getResponsiveScreenGutter(width);
  const stackChip = !!chipLabel && fontScale >= 1.3;
  const statusChip = chipLabel ? (
    <Chip
      compact
      maxFontSizeMultiplier={1}
      style={{ backgroundColor: theme.colors.surfaceVariant, maxWidth: stackChip ? '100%' : '38%' }}
      textStyle={{ color: theme.colors.onSurfaceVariant, fontFamily: 'Satoshi-Bold', fontWeight: 'normal' }}
    >
      {chipLabel}
    </Chip>
  ) : undefined;

  return (
    <>
      <BrandHeaderBar
        topInset={insets.top}
        horizontalPadding={screenGutter}
        verticalPadding={14}
        curvedBottom
        style={{
        marginHorizontal: -screenGutter,
        marginTop: -getResponsiveLayoutValue(16, width),
        }}
      />
      <PageBackHeader onBack={onBack} title={title} trailing={stackChip ? undefined : statusChip} />
      {stackChip ? (
        <View style={[styles.stackedChip, { paddingHorizontal: screenGutter }]}>
          {statusChip}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  stackedChip: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    alignItems: 'flex-start',
    paddingBottom: 8,
  },
});
