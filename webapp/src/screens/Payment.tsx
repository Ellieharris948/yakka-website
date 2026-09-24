import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Platform, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Text,
  useTheme,
} from '../ui/paper';

import { supabase } from '../lib/supabase';
import { BRAND_COLORS } from '../theme';
import { buildJobPaymentBreakdown } from '../utils/jobPayments';
import { formatGBPCents } from '../utils/money';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import { getPaymentStatusView } from '../utils/paymentStatus';
import { normalizeVatRegistrationNumber, VAT_NUMBER_CHECK_URL } from '../utils/vat';

type Job = {
  id: string;
  ref_code: string | null;
  trader_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  duration_days: number;
  planned_start_date: string | null;
  flex_days: number | null;
  start_date: string | null;
  end_date: string | null;
  started_trader: boolean | null;
  started_client: boolean | null;
  status:
    | 'proposed'
    | 'accepted'
    | 'funded'
    | 'in_progress'
    | 'seller_done'
    | 'client_done'
    | 'completed'
    | 'disputed'
    | 'cancelled';
  created_at: string;
  vat_registered?: boolean | null;
  vat_registration_number?: string | null;
  vat_rate_bps?: number | null;
};

type JobItem = {
  id?: string;
  job_id: string;
  title: string;
  qty: number;
  price_cents: number;
};

export default function Payment({ route }: any) {
  const { jobId, cancelled = false } = route.params as { jobId: string; cancelled?: boolean };
  const theme = useTheme();
  const nav = useNavigation<any>();
  const panelColor = theme.colors.surfaceVariant;

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [agreements, setAgreements] = useState({
    reviewed: false,
    terms: false,
    release: false,
    dispute: false,
  });
  const [paying, setPaying] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    const { data: j, error: jErr } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (jErr) {
      setLoadError('We could not load this job. Check your connection and try again.');
      setLoading(false);
      return;
    }

    const jobRow = j as Job;
    setJob(jobRow);

    try {
      const { data: rows, error } = await supabase
        .from('job_items')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (rows?.length) {
        setItems(
          rows.map((r: any) => ({
            id: r.id,
            job_id: r.job_id,
            title: r.title ?? 'Item',
            qty: Number(r.qty ?? 1),
            price_cents: Number(r.price_cents ?? 0),
          })),
        );
      } else {
        setItems([{ job_id: jobId, title: jobRow.title || 'Job', qty: 1, price_cents: Number(jobRow.price_cents ?? 0) }]);
      }
      const [{ data: auth }, paymentResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('payments').select('status').eq('job_id', jobId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (paymentResult.error) throw paymentResult.error;
      setIsClient(auth.user?.id === jobRow.client_id);
      setPaymentStatus(paymentResult.data?.status || null);
    } catch {
      setLoadError('We could not verify the payment breakdown. Please try again before paying.');
    }

    setLoading(false);
  }, [jobId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const paymentBreakdown = useMemo(
    () => buildJobPaymentBreakdown(job as any, items),
    [items, job],
  );

  const canPay = useMemo(() => {
    if (!job) return false;
    return !loadError && isClient && !getPaymentStatusView(paymentStatus).confirmed && agreements.reviewed && agreements.terms && agreements.release && agreements.dispute && (job.status === 'accepted' || job.status === 'proposed');
  }, [agreements.dispute, agreements.release, agreements.reviewed, agreements.terms, isClient, job, loadError, paymentStatus]);

  const onPayNow = useCallback(async () => {
    if (!job || !canPay || paying) return;

    try {
      setPaying(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not signed in');

      const { error: consentError } = await supabase.from('jobs').update({
        client_dispute_terms_accepted_at: new Date().toISOString(),
      }).eq('id', job.id);
      if (consentError) throw consentError;

      const data = await invokeEdgeFunction('create-stripe-checkout', {
        jobId: job.id,
        ...(Platform.OS === 'web' && typeof window !== 'undefined'
          ? { webReturnBase: `${window.location.origin}/app/` }
          : {}),
      });
      if (!data?.url) throw new Error(data?.error || 'Stripe checkout did not return a payment link.');

      const canOpen = await Linking.canOpenURL(data.url);
      if (!canOpen) throw new Error('Could not open the Stripe payment page on this device.');

      await Linking.openURL(data.url);
      setCheckoutOpened(true);
    } catch (e: any) {
      Alert.alert('Could not open payment', e?.message || 'Please try again.');
    } finally {
      setPaying(false);
    }
  }, [canPay, job, paying]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError || !job) return (
    <ResponsivePageScrollView>
      <BrandScreenHeader title="Payment" onBack={() => nav.goBack()} />
      <Card mode="contained"><Card.Content style={{ gap: 16 }}>
        <Text>{loadError || 'This job is unavailable.'}</Text>
        <Button mode="contained" onPress={load}>Try again</Button>
      </Card.Content></Card>
    </ResponsivePageScrollView>
  );

  if (getPaymentStatusView(paymentStatus).confirmed || !['accepted', 'proposed'].includes(job.status) || !isClient) return (
    <ResponsivePageScrollView>
      <BrandScreenHeader title="Payment" onBack={() => nav.goBack()} />
      <Card mode="contained"><Card.Content style={{ gap: 16 }}>
        <Text variant="headlineSmall">{!isClient ? 'Customer payment' : getPaymentStatusView(paymentStatus).confirmed ? getPaymentStatusView(paymentStatus).title : 'Payment is not available'}</Text>
        <Text>{!isClient ? 'Only the customer assigned to this job can make its payment.' : getPaymentStatusView(paymentStatus).confirmed ? getPaymentStatusView(paymentStatus).description : 'Open the job to see its current status and next step.'}</Text>
        <Button mode="contained" onPress={() => nav.navigate('JobDetails', { jobId })}>View job</Button>
      </Card.Content></Card>
    </ResponsivePageScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader title="Payment" onBack={() => nav.goBack()} />

        {(cancelled || checkoutOpened || paymentStatus === 'awaiting_funding') && <Card mode="outlined" style={{ marginBottom: 12 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="titleMedium">{cancelled ? 'You returned from checkout' : 'Already opened your bank?'}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>If you authorised the payment, check its status. Otherwise, use Confirm & pay below to continue the secure checkout.</Text>
            <Button mode="contained-tonal" onPress={() => nav.navigate('PaymentReceived', { jobId })}>Check payment status</Button>
          </Card.Content>
        </Card>}

        <Card mode="contained" style={{ borderRadius: 28, marginBottom: 12, backgroundColor: panelColor }}>
          <Card.Content style={{ gap: 12, paddingVertical: 18 }}>
            <Text variant="headlineSmall" style={{ color: BRAND_COLORS.maroon }}>
              Confirm & pay
            </Text>
            <Text variant="headlineMedium" style={{ color: BRAND_COLORS.maroon }}>
              {formatGBPCents(paymentBreakdown.totalDueCents)}
            </Text>
            <Text variant="bodyMedium" style={{ color: BRAND_COLORS.maroon, lineHeight: 24 }}>
              Choose your bank, authorise this total in your banking app, then return to Yakka to check the payment. Funds are held for this job.
            </Text>
          </Card.Content>
        </Card>

        <Card mode="contained" style={{ borderRadius: 28, marginBottom: 12, backgroundColor: BRAND_COLORS.creamSoft }}>
          <Card.Content style={{ gap: 12, paddingVertical: 18 }}>
            <Text variant="headlineSmall" style={{ color: BRAND_COLORS.maroon }}>
              Summary
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>
                Tasks subtotal (ex VAT)
              </Text>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, }}>
                {formatGBPCents(paymentBreakdown.laborCents)}
              </Text>
            </View>

            {paymentBreakdown.materialsCents > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>
                  Materials (ex VAT)
                </Text>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, }}>
                  {formatGBPCents(paymentBreakdown.materialsCents)}
                </Text>
              </View>
            )}

            {paymentBreakdown.vatCents > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>VAT (20%)</Text>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>{formatGBPCents(paymentBreakdown.vatCents)}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>
                YAKKA customer service fee (2%)
              </Text>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>
                {formatGBPCents(paymentBreakdown.clientFeeCents)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon, }}>
                Total to Pay
              </Text>
              <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon, }}>
                {formatGBPCents(paymentBreakdown.totalDueCents)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Card mode="contained" style={{ borderRadius: 28, backgroundColor: panelColor }}>
          <Card.Content style={{ gap: 12, paddingVertical: 18 }}>
            <Text variant="headlineSmall" style={{ color: BRAND_COLORS.maroon }}>
              Payment
            </Text>

            {job.vat_registered && job.vat_registration_number ? (
              <Card
                mode="outlined"
                style={{
                  borderColor: BRAND_COLORS.orange,
                  backgroundColor: BRAND_COLORS.orangeSoft,
                }}
              >
                <Card.Content style={{ gap: 8 }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSecondary }}>
                    Check the tradie&apos;s VAT registration
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSecondary }}>
                    VAT number: {normalizeVatRegistrationNumber(job.vat_registration_number)}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSecondary }}>
                    You can check this number on the official GOV.UK service before you pay.
                  </Text>
                  <Button
                    mode="outlined"
                    icon="open-in-new"
                    accessibilityLabel="Check VAT number on GOV.UK"
                    onPress={() => Linking.openURL(VAT_NUMBER_CHECK_URL)}
                    textColor={theme.colors.onSecondary}
                    style={{ borderColor: theme.colors.onSecondary }}
                  >
                    Check VAT number on GOV.UK
                  </Button>
                </Card.Content>
              </Card>
            ) : null}

            <View style={{ gap: 8 }}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, }}>
                Agreement:
              </Text>
                <Checkbox.Item
                  position="leading"
                  label="I've reviewed the breakdown and agree to proceed."
                  labelStyle={{ textAlign: 'left' }}
                  labelVariant="bodyMedium"
                  labelMaxFontSizeMultiplier={1}
                  style={{ paddingHorizontal: 0 }}
                  accessibilityLabel="I have reviewed the breakdown"
                  status={agreements.reviewed ? 'checked' : 'unchecked'}
                  onPress={() => setAgreements(value => ({ ...value, reviewed: !value.reviewed }))}
                />

                <Checkbox.Item
                  position="leading"
                  label="I accept Yakka's terms and conditions."
                  labelStyle={{ textAlign: 'left' }}
                  labelVariant="bodyMedium"
                  labelMaxFontSizeMultiplier={1}
                  style={{ paddingHorizontal: 0 }}
                  accessibilityLabel="I accept Yakka terms and conditions"
                  status={agreements.terms ? 'checked' : 'unchecked'}
                  onPress={() => setAgreements(value => ({ ...value, terms: !value.terms }))}
                />

              <Button mode="text" onPress={() => nav.navigate('StaticInfo', { kind: 'terms' })}>Read terms and conditions</Button>

                <Checkbox.Item
                  position="leading"
                  label="I understand funds are held until I approve a release, or the 7-day completion review period ends without a concern being raised."
                  labelStyle={{ textAlign: 'left' }}
                  labelVariant="bodyMedium"
                  labelMaxFontSizeMultiplier={1}
                  style={{ paddingHorizontal: 0 }}
                  accessibilityLabel="I understand when payment can be released"
                  status={agreements.release ? 'checked' : 'unchecked'}
                  onPress={() => setAgreements(value => ({ ...value, release: !value.release }))}
                />
                <Checkbox.Item
                  position="leading"
                  label="I understand that if we cannot resolve a dispute, Yakka will review the agreed job, messages and evidence and make the final decision on how held funds are distributed."
                  labelStyle={{ textAlign: 'left' }}
                  labelVariant="bodyMedium"
                  labelMaxFontSizeMultiplier={1}
                  style={{ paddingHorizontal: 0 }}
                  accessibilityLabel="I understand Yakka makes the final dispute decision"
                  status={agreements.dispute ? 'checked' : 'unchecked'}
                  onPress={() => setAgreements(value => ({ ...value, dispute: !value.dispute }))}
                />
            </View>

            <Button
              mode="contained"
              icon="bank-transfer"
              disabled={!canPay || paying}
              onPress={onPayNow}
              loading={paying}
              buttonColor={BRAND_COLORS.orange}
              textColor={BRAND_COLORS.white}
              style={{ borderRadius: 18 }}
              contentStyle={{ paddingVertical: 8 }}
            >
              Confirm & pay
            </Button>

            <Text variant="bodySmall" style={{ color: BRAND_COLORS.maroon, opacity: 0.75, textAlign: 'center' }}>
              Pay by Bank only. The total includes the 2% customer fee shown above. You will approve it securely with your bank.
            </Text>

          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}
