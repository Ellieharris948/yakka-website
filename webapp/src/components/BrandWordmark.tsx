import React from 'react';
import { Image, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Text from './BrandText';
import { getResponsiveLayoutValue } from '../utils/layout';

type Props = {
  size?: number;
  subtitle?: string;
  center?: boolean;
  light?: boolean;
};

export default function BrandWordmark({ size = 40, subtitle, center = false, light = false }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const responsiveSize = getResponsiveLayoutValue(size, width);
  const source = light
    ? require('../../assets/brand/yakka-wordmark-light.png')
    : require('../../assets/brand/yakka-lockup-dark.png');

  return (
    <View style={{ alignItems: center ? 'center' : 'flex-start' }}>
      <Image
        accessibilityLabel="Yakka"
        source={source}
        resizeMode="contain"
        // Keep the view at the source aspect ratio. The previous 4.75 ratio
        // letterboxed this 4.21 image and made the visible logo look indented.
        style={{
          width: Math.round(responsiveSize * (light ? 4.21 : 3.7)),
          height: responsiveSize,
          // The light PNG contains a small transparent source inset. Cancel
          // it so the visible Y begins on the same guide as page headings.
          marginLeft: light ? -Math.round(responsiveSize * 0.07) : 0,
        }}
      />
      {!!subtitle && (
        <Text
          variant="labelSmall"
          style={{
            color: light ? 'rgba(244,244,236,0.84)' : theme.colors.onSurfaceVariant,
            marginTop: 3,
            letterSpacing: 0,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}
