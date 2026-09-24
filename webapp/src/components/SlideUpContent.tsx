import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';

import { BRAND_MOTION } from '../theme';

type Props = {
  children: ReactNode;
  motionKey?: string | number;
  distance?: number;
};

export default function SlideUpContent({ children, motionKey, distance = 110 }: Props) {
  const translateY = useRef(new Animated.Value(distance)).current;
  const opacity = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    translateY.setValue(distance);
    opacity.setValue(0.82);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: BRAND_MOTION.duration.screen,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: BRAND_MOTION.duration.standard,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [distance, motionKey, opacity, translateY]);

  return (
    <Animated.View style={[styles.fill, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
