import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getBrandIcon, YAKKA_DOT_PATH } from '../utils/brandIcons';

type Props = {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  direction?: 'ltr' | 'rtl' | 'auto' | null;
  testID?: string;
  accessibilityLabel?: string;
};

/** One optical size and stroke weight on iOS, Android and web. */
export default function BrandIcon({ name, size = 24, color = '#581a1f', style, direction, testID, accessibilityLabel }: Props) {
  const drawing = getBrandIcon(name);
  const mirrored = direction === 'rtl' && /^(arrow|chevron)-/.test(name);
  return (
    <View testID={testID} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      aria-hidden={!accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none" style={[{ width: size, height: size, flexShrink: 0 }, style]}>
      {drawing ? (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
          <G transform={mirrored ? 'translate(24 0) scale(-1 1)' : undefined}>
            {drawing.paths.map((d, index) => <Path key={index} d={d} fill="none" stroke={color}
              strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />)}
            {drawing.dot && <Path d={YAKKA_DOT_PATH} fill={color}
              transform={`translate(${drawing.dot[0]} ${drawing.dot[1]}) scale(${drawing.dot[2]})`} />}
            {name === 'bell-badge-outline' && <Path d="M19 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4" fill={color} />}
          </G>
        </Svg>
      ) : (
        <MaterialCommunityIcons name={name as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
          size={size} color={color} accessible={false} />
      )}
    </View>
  );
}

export const brandIconSettings = { icon: (props: Props) => <BrandIcon {...props} /> };
