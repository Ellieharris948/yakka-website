import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Text, useTheme } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { getPaymentStatusView } from '../utils/paymentStatus';
import { formatGBPCents } from '../utils/money';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

export default function PaymentReceived({ route }: any) {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const jobId = route?.params?.jobId as string | undefined;
  const scopeChangeId = route?.params?.scopeChangeId as string | undefined;
  const [payment, setPayment] = useState<{ status: string; total_cents: number } | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const inFlight = useRef<string | null>(null);
  const mounted = useRef(true);
  const requestKey = `${jobId || ''}:${scopeChangeId || 'original'}`;
  const currentRequest = useRef(requestKey);
  currentRequest.current = requestKey;
  const status = getPaymentStatusView(payment?.status);

  const checkPayment = useCallback(async () => {
    if (inFlight.current === requestKey) return;
    if (!jobId) {
      setError('This payment link is missing its job reference. Open the job from your home screen.');
      setChecking(false);
      return;
    }
    inFlight.current = requestKey;
    setChecking(true);
    try {
      let query = supabase.from('payments')
        .select('status,total_cents').eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(1);
      query = scopeChangeId ? query.eq('scope_change_id', scopeChangeId) : query.is('scope_change_id', null);
      const { data, error: queryError } = await query.maybeSingle();
      if (queryError) throw queryError;
      if (mounted.current && currentRequest.current === requestKey) {
        setPayment(data);
        setChecked(true);
        setError('');
      }
    } catch {
      if (mounted.current && currentRequest.current === requestKey) setError('We could not check your payment. Check your connection and try again. If you already authorised it, do not pay again.');
    } finally {
      if (inFlight.current === requestKey) inFlight.current = null;
      if (mounted.current && currentRequest.current === requestKey) setChecking(false);
    }
  }, [jobId, scopeChangeId, requestKey]);

  useEffect(() => {
    mounted.current = true;
    setPayment(null);
    setChecked(false);
    setError('');
    void checkPayment();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void checkPayment();
    });
    return () => { mounted.current = false; subscription.remove(); };
  }, [checkPayment]);

  useEffect(() => {
    if (!jobId || !status.pending) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      void checkPayment();
      if (attempts >= 12) clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [checkPayment, jobId, status.pending]);

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader
          title="Payment status"
          onBack={() => nav.navigate('MainTabs')}
        />

        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20, backgroundColor: theme.colors.surface }}>
          <Card.Content style={{ gap: 16 }}>
            <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
              {checking && !checked ? <ActivityIndicator /> : null}
              <Text variant="headlineSmall">{!checked && checking ? 'Checking your payment' : status.title}</Text>
              {payment && status.confirmed && <Text variant="headlineMedium">{formatGBPCents(payment.total_cents)}</Text>}
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{error || status.description}</Text>
            </View>
            {payment?.status === 'funded' && <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              You can review any partial payment request before approving it. At completion, confirm the work or raise a concern from your job.
            </Text>}
            {!!jobId && (status.pending || !!error) && <Button mode="contained" onPress={checkPayment} loading={checking} disabled={checking}>Check payment status</Button>}
            {!!jobId && status.canRetry && <Button mode="contained" onPress={() => scopeChangeId ? nav.navigate('JobDetails', { jobId }) : nav.replace('Payment', { jobId })}>Return to payment</Button>}
            {!!jobId && <Button mode={status.confirmed ? 'contained' : 'contained-tonal'} onPress={() => nav.navigate('JobDetails', { jobId })}>View job</Button>}
            <Button mode="text" onPress={() => nav.navigate('MainTabs')}>Back to home</Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}

