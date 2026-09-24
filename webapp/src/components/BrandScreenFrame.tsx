import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { IconButton, useTheme } from 'react-native-paper';

import { BRAND_COLORS, BRAND_DARK_PAGE_GRADIENT, BRAND_MOTION, BRAND_PAGE_GRADIENT, BRAND_RADII, getBrandHeaderGradient } from '../theme';
import BrandHeaderBar from './BrandHeaderBar';
import PageBackHeader from './PageBackHeader';
import { getResponsiveLayoutValue, getResponsiveScreenGutter } from '../utils/layout';

type Props = {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  showBell?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
  showPullHandle?: boolean;
  revealContent?: React.ReactNode;
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  revealAccessibilityLabel?: string;
  restingOffset?: number;
  sheetExpanded?: boolean;
  onSheetExpandedChange?: (expanded: boolean) => void;
  revealGestureEnabled?: boolean;
  motionStiffness?: number;
  headerAccent?: boolean;
};

export default function BrandScreenFrame({
  children,
  title,
  onBack,
  right,
  showBell = false,
  bodyStyle,
  showPullHandle,
  revealContent,
  revealed = false,
  onRevealedChange,
  revealAccessibilityLabel = 'Reveal panel',
  restingOffset = 0,
  sheetExpanded = false,
  onSheetExpandedChange,
  revealGestureEnabled = true,
  motionStiffness = BRAND_MOTION.spring.stiffness,
  headerAccent = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [stageHeight, setStageHeight] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);
  const hasReveal = revealContent != null;
  const shouldShowPullHandle = showPullHandle ?? (hasReveal || restingOffset > 0);
  const revealDistance = Math.max(0, stageHeight - getResponsiveLayoutValue(58, width));
  const restingDistance = Math.min(Math.max(0, restingOffset), revealDistance);
  const homeTarget = sheetExpanded ? 0 : restingDistance;
  const pageGradient = theme.dark
    ? BRAND_DARK_PAGE_GRADIENT
    : BRAND_PAGE_GRADIENT;
  const headerGradient = getBrandHeaderGradient(theme.dark);
  const headerRight = right ?? (
    showBell ? (
      <IconButton
        icon="bell-outline"
        iconColor={BRAND_COLORS.white}
        size={getResponsiveLayoutValue(27, width)}
        accessibilityLabel="Open notifications"
        onPress={() => navigation.navigate('Notifications')}
        style={{ margin: 0 }}
      />
    ) : undefined
  );

  const animateTo = useCallback((target: number) => {
    Animated.spring(translateY, {
      toValue: target,
      damping: BRAND_MOTION.spring.damping,
      stiffness: motionStiffness,
      mass: BRAND_MOTION.spring.mass,
      overshootClamping: true,
      isInteraction: false,
      // Animate the top edge so the list is measured inside the visible space.
      // A transform leaves a full-height list hidden below the tab bar.
      useNativeDriver: false,
    }).start();
  }, [motionStiffness, translateY]);

  const measureStage = useCallback((event: LayoutChangeEvent) => {
    setStageHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(() => {
    animateTo(hasReveal && revealed ? revealDistance : homeTarget);
  }, [animateTo, hasReveal, homeTarget, revealDistance, revealed]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      (hasReveal || restingDistance > 0) && Math.abs(gesture.dy) > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      (hasReveal || restingDistance > 0) && Math.abs(gesture.dy) > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      dragStart.current = revealed ? revealDistance : homeTarget;
      translateY.stopAnimation(value => {
        dragStart.current = value;
      });
    },
    onPanResponderMove: (_event, gesture) => {
      const dragLimit = revealed || (revealGestureEnabled && restingDistance === 0)
        ? revealDistance
        : restingDistance;
      translateY.setValue(Math.max(0, Math.min(dragLimit, dragStart.current + gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const projected = dragStart.current + gesture.dy + gesture.vy * 110;

      if (revealed) {
        const shouldStayRevealed = projected > homeTarget + (revealDistance - homeTarget) * 0.42;
        animateTo(shouldStayRevealed ? revealDistance : homeTarget);
        onRevealedChange?.(shouldStayRevealed);
        return;
      }

      if (restingDistance > 0) {
        const shouldRest = projected > restingDistance * 0.48;
        animateTo(shouldRest ? restingDistance : 0);
        onSheetExpandedChange?.(!shouldRest);
        return;
      }

      if (revealGestureEnabled && hasReveal) {
        const shouldReveal = projected > revealDistance * 0.42;
        animateTo(shouldReveal ? revealDistance : 0);
        onRevealedChange?.(shouldReveal);
        return;
      }

      animateTo(homeTarget);
    },
    onPanResponderTerminate: () => animateTo(revealed ? revealDistance : homeTarget),
  }), [
    animateTo,
    hasReveal,
    homeTarget,
    onRevealedChange,
    onSheetExpandedChange,
    restingDistance,
    revealDistance,
    revealed,
    revealGestureEnabled,
    translateY,
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: headerGradient[0] }]}>
      <BrandHeaderBar
        right={headerRight}
        topInset={insets.top}
        horizontalPadding={screenGutter}
        verticalPadding={14}
        wordmarkAccent={headerAccent}
      />
      <View style={styles.stage} onLayout={measureStage}>
        {hasReveal && <View style={[styles.revealLayer, {
          backgroundColor: headerGradient[1],
          // Keep home actions scrollable when a short/landscape screen cannot
          // show their full measured height above the jobs sheet.
          paddingBottom: restingOffset > 0 && !revealed ? stageHeight - restingDistance : 58,
        }]}>{revealContent}</View>}
        <Animated.View testID="brand-screen-body" style={[styles.curtain, { top: translateY }]}>
          <LinearGradient
            colors={[...pageGradient]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.body, bodyStyle]}
          >
            {shouldShowPullHandle && (
              <View
                {...((hasReveal || restingDistance > 0) ? panResponder.panHandlers : {})}
                accessible={hasReveal || restingDistance > 0}
                accessibilityRole={hasReveal || restingDistance > 0 ? 'adjustable' : undefined}
                accessibilityLabel={hasReveal ? revealAccessibilityLabel : 'Jobs panel'}
                accessibilityHint="Swipe down to reveal and up to return"
                hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
                style={[
                  styles.pullHandleArea,
                  {
                    height: getResponsiveLayoutValue(40, width),
                    paddingTop: getResponsiveLayoutValue(10, width),
                  },
                ]}
              >
                <View
                  style={[
                    styles.pullHandle,
                    {
                      width: getResponsiveLayoutValue(56, width),
                      height: getResponsiveLayoutValue(5, width),
                      backgroundColor: theme.colors.outline,
                    },
                  ]}
                />
              </View>
            )}
            {!!onBack && <PageBackHeader onBack={onBack} title={title} />}
            {children}
          </LinearGradient>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND_COLORS.maroon,
  },
  stage: {
    flex: 1,
    marginTop: -1,
    backgroundColor: BRAND_COLORS.maroon,
    overflow: 'hidden',
  },
  revealLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_COLORS.maroon,
  },
  curtain: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  body: {
    flex: 1,
    borderTopLeftRadius: BRAND_RADII.panel,
    borderTopRightRadius: BRAND_RADII.panel,
    overflow: 'hidden',
  },
  pullHandleArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
  },
  pullHandle: {
    borderRadius: 999,
    opacity: 1,
  },
});
