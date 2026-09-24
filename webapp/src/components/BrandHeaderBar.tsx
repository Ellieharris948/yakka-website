import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleProp, useWindowDimensions, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from 'react-native-paper';

import { BRAND_MOTION, getBrandHeaderGradient } from '../theme';
import BrandWordmark from './BrandWordmark';
import { navigateToHome } from '../utils/navigation';
import { getResponsiveLayoutValue, getResponsiveScreenGutter } from '../utils/layout';

type Props = {
  right?: React.ReactNode;
  horizontalPadding?: number;
  verticalPadding?: number;
  topInset?: number;
  curvedBottom?: boolean;
  wordmarkAccent?: boolean;
  style?: StyleProp<ViewStyle>;
  onHomePress?: () => void;
};

export default function BrandHeaderBar({
  right,
  horizontalPadding,
  verticalPadding = 14,
  topInset = 0,
  curvedBottom = false,
  wordmarkAccent = false,
  style,
  onHomePress,
}: Props) {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const responsiveVerticalPadding = getResponsiveLayoutValue(verticalPadding, width);
  const headerGradient = getBrandHeaderGradient(theme.dark);
  const accentProgress = useRef(new Animated.Value(wordmarkAccent ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(accentProgress, {
      toValue: wordmarkAccent ? 1 : 0,
      duration: BRAND_MOTION.duration.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [accentProgress, wordmarkAccent]);
  return (
    <LinearGradient
      colors={[...headerGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: getResponsiveLayoutValue(6, width),
          paddingHorizontal: horizontalPadding ?? getResponsiveScreenGutter(width),
          paddingTop: responsiveVerticalPadding + topInset,
          paddingBottom: responsiveVerticalPadding + (curvedBottom ? getResponsiveLayoutValue(18, width) : 0),
          minHeight: getResponsiveLayoutValue(68, width, { min: 64, max: 73 }) + topInset,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to Yakka home"
        hitSlop={8}
        onPress={onHomePress ?? (() => navigateToHome(navigation))}
        style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.76 : 1 })}
      >
        <BrandWordmark size={28} light />
        <Animated.View
          style={{
            width: getResponsiveLayoutValue(42, width),
            height: getResponsiveLayoutValue(2, width),
            borderRadius: 999,
            marginTop: getResponsiveLayoutValue(5, width),
            backgroundColor: 'rgba(244,244,236,0.88)',
            opacity: accentProgress,
            transform: [{ scaleX: accentProgress }],
            transformOrigin: 'left center',
          }}
        />
      </Pressable>
      {right}
      {curvedBottom && (
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -1,
            height: getResponsiveLayoutValue(19, width),
            borderTopLeftRadius: getResponsiveLayoutValue(30, width),
            borderTopRightRadius: getResponsiveLayoutValue(30, width),
            backgroundColor: theme.colors.background,
          }}
        />
      )}
    </LinearGradient>
  );
}
