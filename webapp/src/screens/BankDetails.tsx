import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  List,
  Text,
  useTheme,
} from '../ui/paper';

import BrandScreenHeader from '../components/BrandScreenHeader';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import { buildStripeConnectUrls } from '../utils/stripeConnect';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

type StripeStatus = {
  accountId: string | null;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
};

const emptyStatus: StripeStatus = {
  accountId: null,
  detailsSubmitted: false,
  payoutsEnabled: false,
  disabledReason: null,
  currentlyDue: [],
  pastDue: [],
  pendingVerification: [],
};

export default function BankDetails() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const [status, setStatus] = useState<StripeStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [connectBusy, setConnectBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  const refreshStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await invokeEdgeFunction('get-stripe-connect-status', {});
      setStatus((data?.status || emptyStatus) as StripeStatus);
      setStatusError('');
    } catch (error: any) {
      setStatusError('We could not check your payout status. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void refreshStatus(true);
    });
    return () => subscription.remove();
  }, [refreshStatus]);

  const openStripe = useCallback(async () => {
    try {
      setConnectBusy(true);
      const { returnUrl, refreshUrl } = buildStripeConnectUrls('BankDetails');
      const data = await invokeEdgeFunction('create-stripe-connect-account', {
        returnUrl,
        refreshUrl,
      });
      if (!data?.url) throw new Error(data?.error || 'Stripe did not return a secure setup link.');

      const canOpen = await Linking.canOpenURL(data.url);
      if (!canOpen) throw new Error('Could not open Stripe on this device.');
      await Linking.openURL(data.url);
    } catch (error: any) {
      Alert.alert('Stripe payout setup', error?.message || 'Could not open Stripe payout setup.');
    } finally {
      setConnectBusy(false);
    }
  }, []);

  const needsAction =
    !!status.disabledReason || status.currentlyDue.length > 0 || status.pastDue.length > 0;
  const statusLabel = loading ? 'Checking status' : statusError ? 'Status unavailable' : status.payoutsEnabled
    ? 'Ready for payouts'
    : needsAction
      ? 'Action needed'
      : status.detailsSubmitted || status.pendingVerification.length
        ? 'Being verified'
        : 'Not connected';

  return (
    <ResponsivePageScrollView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <BrandScreenHeader title="Payouts" onBack={() => nav.goBack()} chipLabel={statusLabel} />

      <Card mode="contained" style={{ borderRadius: 24, backgroundColor: theme.colors.surface }}>
        <Card.Content style={{ gap: 18, paddingVertical: 20 }}>
          <View style={{ gap: 8 }}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
              Receive your job payments
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 25 }}>
              Connect your bank account and complete Stripe&apos;s identity checks. After a customer releases payment, Stripe sends your payout to this account.
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator />
          ) : (
            <List.Item
              title={statusLabel}
              description={
                statusError || (status.payoutsEnabled
                  ? 'You can receive released job funds. Arrival in your bank follows your Stripe payout schedule.'
                  : needsAction
                    ? 'Open Stripe to finish the outstanding identity or payout checks.'
                    : status.detailsSubmitted
                      ? 'Stripe is reviewing the details you submitted.'
                      : 'Connect Stripe before receiving your first payout.')
              }
              left={props => (
                <List.Icon
                  {...props}
                  icon={status.payoutsEnabled ? 'check-decagram' : needsAction ? 'alert-circle' : 'bank-outline'}
                  color={theme.colors.onSurface}
                />
              )}
              right={() => (
                <Chip
                  compact
                  textStyle={{ color: theme.colors.onSecondaryContainer }}
                  style={{
                    alignSelf: 'center',
                    backgroundColor: theme.colors.secondaryContainer,
                  }}
                >
                  {status.payoutsEnabled ? 'Connected' : 'Stripe'}
                </Chip>
              )}
            />
          )}

          <Button
            mode="contained"
            icon="open-in-new"
            onPress={openStripe}
            loading={connectBusy}
            disabled={connectBusy || loading}
            style={{ borderRadius: 18 }}
            contentStyle={{ paddingVertical: 8 }}
          >
            {status.accountId ? 'Manage payout details' : 'Set up payouts'}
          </Button>

          <Button
            mode="text"
            onPress={() => void refreshStatus()}
            disabled={loading}
          >
            Check status
          </Button>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Your bank details are entered securely with Stripe. Yakka does not store your account number or sort code.</Text>
        </Card.Content>
      </Card>
    </ResponsivePageScrollView>
  );
}
