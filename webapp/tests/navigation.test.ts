import assert from 'node:assert/strict';
import test from 'node:test';

import { navigateToHome } from '../src/utils/navigation';

function navigator(routeNames: string[], parent?: any) {
  const calls: any[][] = [];
  return {
    calls,
    getState: () => ({ routeNames }),
    getParent: () => parent,
    navigate: (...args: any[]) => calls.push(args),
  };
}

test('YAKKA logo opens Home from the tab navigator', () => {
  const tabs = navigator(['Home', 'ChatList', 'Account']);
  navigateToHome(tabs);
  assert.deepEqual(tabs.calls, [['Home']]);
});

test('YAKKA logo opens the Home tab from a nested stack screen', () => {
  const root = navigator(['MainTabs', 'Chat', 'EnterJobCode']);
  const nested = navigator(['NestedScreen'], root);
  navigateToHome(nested);
  assert.deepEqual(root.calls, [['MainTabs', { screen: 'Home' }]]);
});

test('YAKKA logo returns signed-out flows to Auth', () => {
  const root = navigator(['Auth', 'Onboarding', 'ResetPassword']);
  const nested = navigator(['NestedScreen'], root);
  navigateToHome(nested);
  assert.deepEqual(root.calls, [['Auth']]);
});

test('admin logo returns to operations without entering participant tabs', () => {
  const root = navigator(['AdminDashboard', 'ChangePassword']);
  navigateToHome(root);
  assert.deepEqual(root.calls, [['AdminDashboard']]);
});
