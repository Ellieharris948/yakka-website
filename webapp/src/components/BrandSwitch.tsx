import React from 'react';
import { Switch, useTheme } from 'react-native-paper';

type Props = React.ComponentProps<typeof Switch>;

/** A high-contrast switch that remains visible on cream and burgundy surfaces. */
export default function BrandSwitch({ theme: themeOverride, ...props }: Props) {
  const theme = useTheme();
  const switchTheme: any = {
    ...themeOverride,
    colors: {
      ...themeOverride?.colors,
      primary: theme.colors.primary,
      surfaceVariant: theme.dark ? '#fdb087' : '#fdb087',
      outline: theme.dark ? '#f4f4ec' : '#6a292e',
    },
  };

  return <Switch {...props} color={theme.colors.primary} theme={switchTheme} />;
}
