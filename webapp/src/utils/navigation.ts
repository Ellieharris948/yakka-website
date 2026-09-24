export function navigateToHome(navigation: any) {
  let cursor = navigation;
  let authNavigator: any = null;

  while (cursor) {
    const routeNames: string[] = cursor.getState?.()?.routeNames || [];
    if (routeNames.includes('Home')) {
      cursor.navigate('Home');
      return;
    }
    if (routeNames.includes('MainTabs')) {
      cursor.navigate('MainTabs', { screen: 'Home' });
      return;
    }
    if (routeNames.includes('AdminDashboard')) {
      cursor.navigate('AdminDashboard');
      return;
    }
    if (routeNames.includes('Auth')) authNavigator = cursor;
    cursor = cursor.getParent?.();
  }

  // Signed-out flows do not own the home tabs. Keep the logo useful there by
  // returning to the authentication landing screen instead.
  authNavigator?.navigate('Auth');
}
