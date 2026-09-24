import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BRAND_COLORS, BRAND_GRADIENT } from '../theme';

export default function BrandLoadingScreen() {
  return (
    <LinearGradient
      colors={[...BRAND_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.screen}
    >
      <View style={styles.markWrap}>
        <Image
          accessibilityLabel="Yakka"
          source={require('../../assets/brand/yakka-wordmark-light.png')}
          resizeMode="contain"
          style={styles.wordmark}
        />
        <View style={styles.loaderRing}>
          <ActivityIndicator color={BRAND_COLORS.maroon} size="small" />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markWrap: {
    alignItems: 'center',
    gap: 26,
  },
  wordmark: {
    width: 190,
    height: 52,
  },
  loaderRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,244,236,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(253,175,136,0.35)',
  },
});
