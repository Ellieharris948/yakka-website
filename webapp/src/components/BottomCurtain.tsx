import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconButton, useTheme } from 'react-native-paper';
import Text from './BrandText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BRAND_DARK_PAGE_GRADIENT,
  BRAND_MOTION,
  BRAND_PAGE_GRADIENT,
  BRAND_RADII,
} from '../theme';
import { BRAND_NATIVE_APP_MAX_WIDTH } from '../utils/layout';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  accessibilityLabel?: string;
};

export default function BottomCurtain({
  visible,
  onDismiss,
  title,
  subtitle,
  children,
  footer,
  scrollable = true,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);

  useEffect(() => {
    if (!visible) {
      translateY.setValue(height);
      backdropOpacity.setValue(0);
      return;
    }
    translateY.setValue(height);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: BRAND_MOTION.duration.screen,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: BRAND_MOTION.duration.standard,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [backdropOpacity, translateY, visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: height,
        duration: BRAND_MOTION.duration.standard,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: BRAND_MOTION.duration.fast,
        easing: Easing.in(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => (
        scrollOffset.current <= 0 && gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
      ),
      onPanResponderGrant: () => translateY.stopAnimation(),
      onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 90 || gesture.vy > 0.85) {
          close();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          damping: BRAND_MOTION.spring.damping,
          stiffness: BRAND_MOTION.spring.stiffness,
          mass: BRAND_MOTION.spring.mass,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      },
      onPanResponderTerminate: () => Animated.spring(translateY, {
        toValue: 0,
        ...BRAND_MOTION.spring,
        useNativeDriver: Platform.OS !== 'web',
      }).start(),
    }),
    // translateY is stable for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backdropOpacity, height, translateY],
  );

  const colors = theme.dark ? BRAND_DARK_PAGE_GRADIENT : BRAND_PAGE_GRADIENT;
  const content = scrollable ? (
    <ScrollView
      style={{ flexShrink: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
    >
      {children}
    </ScrollView>
  ) : children;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          {...panResponder.panHandlers}
          accessibilityLabel={accessibilityLabel || title}
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 14),
              borderColor: theme.colors.outlineVariant,
              transform: [{ translateY }],
            },
          ]}
        >
          <LinearGradient colors={[...colors]} locations={[0, 0.52, 1]} style={StyleSheet.absoluteFill} />
          <IconButton icon="close" onPress={close} accessibilityLabel="Close" style={styles.closeButton} />
          <View style={styles.grabberArea}>
            <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
          </View>
          {(title || subtitle) && (
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                {!!title && <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>{title}</Text>}
                {!!subtitle && (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
          )}
          <View style={styles.content}>{content}</View>
          {!!footer && <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45, 8, 12, 0.48)' },
  sheet: {
    width: '100%',
    maxWidth: BRAND_NATIVE_APP_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '90%',
    minHeight: 180,
    overflow: 'hidden',
    borderTopLeftRadius: BRAND_RADII.panel + 6,
    borderTopRightRadius: BRAND_RADII.panel + 6,
    borderWidth: 1,
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  grabberArea: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 64, height: 7, borderRadius: 999, opacity: 1 },
  closeButton: { position: 'absolute', right: 4, top: 1, zIndex: 3, margin: 0 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingRight: 52, paddingBottom: 12 },
  headingCopy: { flex: 1, gap: 4 },
  content: { flexShrink: 1, paddingHorizontal: 16, paddingBottom: 18 },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14 },
});
