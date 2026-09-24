import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Text from './BrandText';

import { BRAND_COLORS, BRAND_MOTION, BRAND_RADII } from '../theme';

type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: readonly [SegmentOption<T>, SegmentOption<T>, ...SegmentOption<T>[]];
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

export default function SwipeSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel = 'Choose job list',
}: Props<T>) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const maxIndex = options.length - 1;
  const position = useRef(new Animated.Value(selectedIndex)).current;
  const dragStart = useRef(selectedIndex);
  const segmentWidth = Math.max(0, (width - 8) / options.length);

  const settle = (index: number) => {
    Animated.spring(position, {
      toValue: index,
      stiffness: BRAND_MOTION.spring.stiffness,
      damping: BRAND_MOTION.spring.damping,
      mass: BRAND_MOTION.spring.mass,
      overshootClamping: true,
      isInteraction: false,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  useEffect(() => {
    settle(selectedIndex);
  }, [selectedIndex]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderGrant: () => {
      position.stopAnimation(current => { dragStart.current = current; });
    },
    onPanResponderMove: (_event, gesture) => {
      if (!segmentWidth) return;
      const next = dragStart.current + (gesture.dx / segmentWidth);
      position.setValue(Math.max(0, Math.min(maxIndex, next)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const projected = dragStart.current + (segmentWidth ? gesture.dx / segmentWidth : 0) + gesture.vx * 0.18;
      const nextIndex = Math.max(0, Math.min(maxIndex, Math.round(projected)));
      settle(nextIndex);
      if (nextIndex !== selectedIndex) onChange(options[nextIndex].value);
    },
    onPanResponderTerminate: () => settle(selectedIndex),
  }), [maxIndex, onChange, options, position, segmentWidth, selectedIndex]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: theme.dark ? theme.colors.surfaceVariant : BRAND_COLORS.orangeSoft }]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selection,
          {
            width: segmentWidth,
            transform: [{
              translateX: position.interpolate({
                inputRange: [0, maxIndex],
                outputRange: [0, segmentWidth * maxIndex],
              }),
            }],
          },
        ]}
      />
      {options.map((option, index) => {
        const selected = selectedIndex === index;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              settle(index);
              if (!selected) onChange(option.value);
            }}
            style={({ pressed }) => [styles.segment, pressed && styles.pressed]}
          >
            <Text
              variant="labelLarge"
              style={{ color: selected ? BRAND_COLORS.white : theme.colors.onSurface, textAlign: 'center', flexShrink: 1 }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    minHeight: 52,
    borderRadius: BRAND_RADII.control,
    padding: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  selection: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: BRAND_RADII.control - 4,
    backgroundColor: BRAND_COLORS.orange,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 1,
  },
  pressed: { opacity: 0.78 },
});
