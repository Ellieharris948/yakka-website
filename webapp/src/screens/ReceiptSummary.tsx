import React, { useEffect, useState } from 'react';
import { Alert, Platform, Share, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton, Text } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { buildJobPaymentBreakdown } from '../utils/jobPayments';
import { formatGBPCents } from '../utils/money';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { BRAND_TYPOGRAPHY } from '../theme';
import { getResponsiveScreenGutter } from '../utils/layout';

export default function ReceiptSummary({ route }: any) {
  const nav = useNavigation<any>();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);
  const jobId = route?.params?.jobId as string;
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [loadError, setLoadError] = useState('');
  const [payment, setPayment] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: j, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      if (error) Alert.alert('Error', error.message);
      setJob(j);
      const { data: rows, error: paymentError } = await supabase.from('payments').select('*').eq('job_id', jobId).order('created_at', { ascending: true });
      if (error || paymentError) setLoadError('The payment summary could not load. Reopen the job to try again.');
      const paid = (rows || []).filter(p => ['funded','disputed','released','refund_pending','partially_refunded','refunded'].includes(p.status));
      setPaymentRows(paid);
      setPayment(paid.reduce((total: any, p: any) => ({
        total_cents: total.total_cents + Number(p.total_cents || 0),
        net_to_seller_cents: total.net_to_seller_cents + Number(p.net_to_seller_cents || 0),
        client_fee_cents: total.client_fee_cents + Number(p.client_fee_cents || 0),
        seller_fee_cents: total.seller_fee_cents + Number(p.seller_fee_cents || 0),
        status: j?.status,
      }), { total_cents: 0, net_to_seller_cents: 0, client_fee_cents: 0, seller_fee_cents: 0 }));
      setLoading(false);
    })();
  }, [jobId]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  if (loadError) return <View><Text>{loadError}</Text><Button onPress={() => nav.goBack()}>Back to job</Button></View>;

  const paymentBreakdown = buildJobPaymentBreakdown(job as any);
  const total = Number(payment?.total_cents ?? paymentBreakdown.totalDueCents ?? job?.price_cents ?? 0);
  const net = Number(payment?.net_to_seller_cents ?? paymentBreakdown.netToSellerCents ?? 0);
  const invoiceText = [
    'YAKKA JOB INVOICE',
    `Job: ${job?.title || 'Job'}`,
    `Job ID: ${job?.ref_code || job?.id}`,
    '',
    `Original tasks (ex VAT): ${formatGBPCents(paymentBreakdown.laborCents)}`,
    paymentBreakdown.materialsCents > 0 ? `Materials (ex VAT): ${formatGBPCents(paymentBreakdown.materialsCents)}` : '',
    paymentBreakdown.vatCents > 0 ? `VAT (20%): ${formatGBPCents(paymentBreakdown.vatCents)}` : '',
    `Customer service fee (2%): ${formatGBPCents(payment?.client_fee_cents ?? paymentBreakdown.clientFeeCents)}`,
    `Total paid: ${formatGBPCents(total)}`,
    '',
    ...paymentRows.map(p => `${p.scope_change_id ? 'Extra work' : 'Original payment'}: ${formatGBPCents(p.total_cents)} (${p.status})`),
  ].filter(Boolean).join('\n');

  async function downloadInvoice() {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([invoiceText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `yakka-invoice-${String(job?.ref_code || job?.id || 'job').replace(/[^a-z0-9-]/gi, '-')}.txt`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        return;
      }
      await Share.share({ title: `Yakka invoice · ${job?.title || 'Job'}`, message: invoiceText });
    } catch (error: any) {
      Alert.alert('Invoice unavailable', error?.message || 'Please try again.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader title={job?.title || 'Payment summary'} onBack={() => nav.goBack()} chipLabel={job?.ref_code || 'Job'} />

        <Card mode="contained" style={{ borderRadius: 24 }}>
          <Card.Content style={{ gap: 12, paddingVertical: 14 }}>
            <Text variant="titleSmall" style={{ }}>Job payment summary</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text>Total paid</Text>
              <Text style={{ }}>{formatGBPCents(total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, flexShrink: 1 }}>Original tasks (ex VAT)</Text>
              <Text style={{ }}>{formatGBPCents(paymentBreakdown.laborCents)}</Text>
            </View>
            {paymentBreakdown.materialsCents > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ flex: 1, flexShrink: 1 }}>Materials (ex VAT)</Text>
                <Text style={{ }}>{formatGBPCents(paymentBreakdown.materialsCents)}</Text>
              </View>
            )}
            {paymentBreakdown.vatCents > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ flex: 1, flexShrink: 1 }}>VAT (20%)</Text>
                <Text>{formatGBPCents(paymentBreakdown.vatCents)}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, flexShrink: 1 }}>Customer service fee (2%)</Text>
              <Text>{formatGBPCents(payment?.client_fee_cents ?? paymentBreakdown.clientFeeCents)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text>Tradie fee (5%)</Text>
              <Text style={{ }}>{formatGBPCents(payment?.seller_fee_cents ?? paymentBreakdown.sellerFeeCents)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text>Yakka status</Text>
              <Text style={{ }}>{payment?.status ?? job?.status}</Text>
            </View>
            {!!net && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text>Agreed tradie net before refunds</Text>
                <Text style={{ }}>{formatGBPCents(net)}</Text>
              </View>
            )}
            {paymentRows.map(p => <View key={p.id} style={{ gap: 4 }}>
              <Text>{p.scope_change_id ? 'Extra work payment' : 'Original payment'}: {formatGBPCents(p.total_cents)} · {p.status}</Text>
              {Number(p.customer_refunded_cents) > 0 && <Text>Refunded: {formatGBPCents(p.customer_refunded_cents)}</Text>}
            </View>)}
            <Divider />
            <Text variant="bodyMedium" style={{ opacity: 0.7, ...BRAND_TYPOGRAPHY.jobCode }}>
              Job ID: {job?.ref_code || job?.id}
            </Text>
            <Button mode="contained" icon="download" onPress={() => void downloadInvoice()} style={{ borderRadius: 18 }}>
              Download invoice
            </Button>
            <Button mode="contained" onPress={() => nav.navigate('JobDetails', { jobId })} style={{ borderRadius: 18 }}>
              View job details
            </Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}

