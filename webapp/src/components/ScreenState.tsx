import React from 'react';
import { StyleSheet, View } from 'react-native';
import MCIcon from './BrandIcon';
import { ActivityIndicator, Button, Text, useTheme } from '../ui/paper';

import { BRAND_RADII } from '../theme';

type Props = {
  loading?: boolean;
  title?: string;
  message?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ScreenState({
  loading = false,
  title = loading ? 'Loading' : 'Nothing to show yet',
  message,
  icon = 'information-outline',
  actionLabel,
  onAction,
}: Props) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} size="small" accessibilityLabel={title} />
        ) : (
          <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
            <MCIcon name={icon as any} size={28} color={theme.colors.onSurface} />
          </View>
        )}
        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, textAlign: 'center' }}>
          {title}
        </Text>
        {!!message && (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22 }}>
            {message}
          </Text>
        )}
        {!!actionLabel && !!onAction && (
          <Button mode="contained" onPress={onAction} style={styles.action}>
            {actionLabel}
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    borderRadius: BRAND_RADII.panel,
    borderWidth: 1,
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
});
