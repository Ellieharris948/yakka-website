import React from 'react';
import {
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';

import { BRAND_CONTENT_MAX_WIDTH, getResponsiveScreenGutter } from '../utils/layout';

type Props = ScrollViewProps;

/** Shared page rhythm for compact phones, tablets, and web. */
export default function ResponsivePageScrollView({
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  ...props
}: Props) {
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  return (
    <ScrollView
      {...props}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: screenGutter },
        contentContainerStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: BRAND_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingTop: 16,
    paddingBottom: 40,
  },
});
