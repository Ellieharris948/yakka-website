import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from 'react-native-paper';

import { BRAND_DARK_PAGE_GRADIENT, BRAND_PAGE_GRADIENT } from '../theme';

type Props = {
  children: React.ReactNode;
};

export default function BrandAppBackground({ children }: Props) {
  const theme = useTheme();
  const pageGradient = theme.dark
    ? BRAND_DARK_PAGE_GRADIENT
    : BRAND_PAGE_GRADIENT;

  return (
    <View style={[styles.screen, { backgroundColor: pageGradient[0] }]}>
      <LinearGradient
        colors={[...pageGradient]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND_PAGE_GRADIENT[0],
  },
  content: {
    flex: 1,
  },
});
