import React from 'react';
import { StyleSheet, View } from 'react-native';
import MCIcon from './BrandIcon';
import { Text as PaperText, useTheme } from 'react-native-paper';

import Text from './BrandText';
import { BRAND_COLORS, BRAND_RADII } from '../theme';
import { getJobProgressSteps } from '../utils/jobProgress';
import { type JobStatus } from '../utils/statusStyles';

type Props = {
  status: JobStatus;
  title?: string;
  contained?: boolean;
  role?: 'client' | 'trader';
  compact?: boolean;
};

// Give word-heavy stages enough room without making the rail horizontally scroll.
const MILESTONE_FLEX = [1.15, 1.2, 0.75, 1.45, 0.75];

export default function JobProgressTimeline({
  status,
  title,
  contained = true,
  role = 'client',
  compact = false,
}: Props) {
  const theme = useTheme();
  const steps = getJobProgressSteps(status);
  const labelLineCount = theme.fonts.labelSmall.fontSize >= 17 ? 3 : 2;
  const compactLabelSize = Math.min(theme.fonts.labelSmall.fontSize, 12);
  const compactLabelHeight = Math.ceil(compactLabelSize * 1.25);
  const labelSlotHeight = compact
    ? compactLabelHeight + 4
    : Math.ceil(theme.fonts.labelSmall.lineHeight * labelLineCount + 8);

  return (
    <View
      accessibilityLabel={`Job progress. Current stage: ${steps.find(step => step.state === 'current')?.label || 'Proposal'}`}
      style={[
        styles.container,
        compact && styles.compactContainer,
        contained && {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      {!!title && (
        <Text variant="titleSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
          {title}
        </Text>
      )}

      <View style={styles.railRow}>
        {steps.map((step, index) => {
          const complete = step.state === 'complete';
          const current = step.state === 'current';
          const activeColor = status === 'disputed' || status === 'cancelled'
            ? theme.colors.error
            : BRAND_COLORS.orange;
          const dotBackground = complete
            ? activeColor
            : current
              ? theme.colors.surface
              : theme.colors.surfaceVariant;
          const dotBorder = complete || current ? activeColor : theme.colors.outlineVariant;

          return (
            <View key={step.key} style={[styles.step, { flex: MILESTONE_FLEX[index] }]}>
              <View style={[styles.labelSlot, { minHeight: labelSlotHeight }]}>
                {index % 2 === 0 && (
                  <PaperText
                    maxFontSizeMultiplier={1}
                    numberOfLines={compact ? 1 : labelLineCount}
                    adjustsFontSizeToFit={compact}
                    minimumFontScale={0.72}
                    style={[
                      styles.label,
                      compact && {
                        fontSize: compactLabelSize,
                        lineHeight: compactLabelHeight,
                      },
                      { color: current ? theme.colors.onSurface : theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {step.label}
                  </PaperText>
                )}
              </View>

              <View style={styles.dotRow}>
                {index > 0 && (
                  <View
                    style={[
                      styles.line,
                      compact && styles.compactLine,
                      {
                        backgroundColor: complete || current ? activeColor : theme.colors.outlineVariant,
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.dot,
                    compact && styles.compactDot,
                    {
                      backgroundColor: dotBackground,
                      borderColor: dotBorder,
                      opacity: complete || current ? 1 : 0.42,
                    },
                    current && [styles.currentDot, compact && styles.compactCurrentDot, { shadowColor: activeColor }],
                  ]}
                >
                  {complete && <MCIcon name="check" size={12} color={BRAND_COLORS.white} />}
                </View>
                {index < steps.length - 1 && (
                  <View
                    style={[
                      styles.line,
                      compact && styles.compactLine,
                      {
                        backgroundColor: complete
                          ? activeColor
                          : theme.colors.outlineVariant,
                      },
                    ]}
                  />
                )}
              </View>

              <View style={[styles.labelSlot, { minHeight: labelSlotHeight }]}>
                {index % 2 === 1 && (
                  <PaperText
                    maxFontSizeMultiplier={1}
                    numberOfLines={compact ? 1 : labelLineCount}
                    adjustsFontSizeToFit={compact}
                    minimumFontScale={0.72}
                    style={[
                      styles.label,
                      compact && {
                        fontSize: compactLabelSize,
                        lineHeight: compactLabelHeight,
                      },
                      { color: current ? theme.colors.onSurface : theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {step.label}
                  </PaperText>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: BRAND_RADII.card,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
  },
  compactContainer: {
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  title: {
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  railRow: {
    flexDirection: 'row',
    width: '100%',
  },
  step: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  labelSlot: {
    width: '100%',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
    fontFamily: 'Satoshi-Bold',
    paddingHorizontal: 1,
  },
  dotRow: {
    width: '100%',
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: 3,
  },
  compactLine: {
    height: 2,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  currentDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 5,
    elevation: 4,
  },
  compactCurrentDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
