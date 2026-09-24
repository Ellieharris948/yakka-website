import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';

import {
  BRAND_DARK_PAGE_GRADIENT,
  BRAND_MOTION,
  BRAND_PAGE_GRADIENT,
  BRAND_RADII,
} from '../theme';
import { BRAND_NATIVE_APP_MAX_WIDTH } from '../utils/layout';
import BrandHeaderBar from './BrandHeaderBar';
import { getBrandHeaderGradient } from '../theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  accessibilityLabel?: string;
  dismissGestureEnabled?: boolean;
};

export default function FlowCurtain({
  visible,
  onDismiss,
  children,
  accessibilityLabel,
  dismissGestureEnabled = false,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (!visible) {
      translateY.setValue(height);
      return;
    }
    translateY.setValue(height);
    Animated.timing(translateY, {
      toValue: 0,
      duration: BRAND_MOTION.duration.screen,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [translateY, visible]);

  const close = () => {
    Animated.timing(translateY, {
      toValue: height,
      duration: BRAND_MOTION.duration.standard,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderGrant: () => translateY.stopAnimation(),
    onPanResponderMove: (_event, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 84 || gesture.vy > 0.75) {
        close();
        return;
      }
      Animated.timing(translateY, {
        toValue: 0,
        duration: BRAND_MOTION.duration.standard,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, {
      toValue: 0, ...BRAND_MOTION.spring,
      useNativeDriver: Platform.OS !== 'web',
    }).start(),
  }), [height, onDismiss, translateY]);

  const colors = theme.dark ? BRAND_DARK_PAGE_GRADIENT : BRAND_PAGE_GRADIENT;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <View style={[styles.root, { backgroundColor: getBrandHeaderGradient(theme.dark)[0] }]} pointerEvents="box-none">
        <View style={{ width: '100%', maxWidth: BRAND_NATIVE_APP_MAX_WIDTH }}>
          <BrandHeaderBar topInset={insets.top} onHomePress={close} />
        </View>
        <Animated.View
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.curtain,
            {
              top: insets.top + 71,
              height: Math.max(0, height - insets.top - 71),
              paddingBottom: insets.bottom,
              borderColor: theme.colors.outlineVariant,
              transform: [{ translateY }],
            },
          ]}
        >
          <LinearGradient colors={[...colors]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          {dismissGestureEnabled && (
            <View {...panResponder.panHandlers} style={styles.grabberArea}>
              <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
            </View>
          )}
          <View style={styles.content}>
            {visible && (typeof children === 'function' ? children(close) : children)}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  curtain: {
    position: 'absolute',
    width: '100%',
    maxWidth: BRAND_NATIVE_APP_MAX_WIDTH,
    alignSelf: 'center',
    bottom: 0,
    overflow: 'hidden',
    borderTopLeftRadius: BRAND_RADII.panel + 6,
    borderTopRightRadius: BRAND_RADII.panel + 6,
    borderWidth: 1,
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 18,
  },
  grabberArea: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 64,
    height: 7,
    borderRadius: 999,
    opacity: 1,
  },
  content: { flex: 1 },
});
