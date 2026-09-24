import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Text, useTheme } from '../ui/paper';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

export default function CompletionSuccess({ route }: any) {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const jobId = route?.params?.jobId as string | undefined;
  const role = route?.params?.role as 'client' | 'trader' | undefined;
  const payoutPending = !!route?.params?.payoutPending;
  const message = route?.params?.message as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader
          title={role === 'trader' ? 'Completion submitted' : 'Job complete'}
          onBack={() => nav.navigate('MainTabs')}
          chipLabel={role === 'trader' ? 'Awaiting customer' : payoutPending ? 'Payout pending' : 'Complete'}
        />

        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="headlineSmall">
              {role === 'trader' ? 'Ready for your customer to review' : 'Thank you for confirming'}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {role === 'trader'
                ? 'Your customer can now confirm the work or raise a concern. If no concern is raised within 7 days, payment is scheduled for automatic release, subject to your payout setup being ready.'
                : payoutPending
                  ? (message || 'You have confirmed completion. Yakka will release payment once payout setup is ready.')
                  : 'Payment has been released to your tradie’s Stripe account. Bank arrival follows Stripe’s payout schedule. This job now appears in past jobs.'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {role === 'trader'
                ? 'You can check your payout setup and follow the job’s status below.'
                : payoutPending
                  ? 'The job is confirmed complete. Funds remain protected while the payout is processed.'
                  : 'Your payment summary, messages and job details remain available in your account.'}
            </Text>
            {!!jobId && role !== 'trader' && (
              <>
                <Button mode="contained" onPress={() => nav.navigate('ReviewExperience', { jobId, mode: 'tradie' })} style={{ borderRadius: 18 }}>
                  Review tradie
                </Button>
                <Button mode="contained-tonal" onPress={() => nav.navigate('JobDetails', { jobId })} style={{ borderRadius: 18 }}>
                  View job details
                </Button>
              </>
            )}
            {!!jobId && role === 'trader' && (
              <>
                <Button mode="contained" onPress={() => nav.navigate('JobDetails', { jobId })}>View job details</Button>
                <Button mode="contained-tonal" onPress={() => nav.navigate('BankDetails')}>Check payout setup</Button>
              </>
            )}
            <Button mode="contained-tonal" onPress={() => nav.navigate('MainTabs')} style={{ borderRadius: 18 }}>
              Back to home
            </Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}

