import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Chip, Divider, Text, useTheme } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { formatGBPCents } from '../utils/money';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

type Job = {
  id: string;
  ref_code: string | null;
  title: string;
  price_cents: number;
  status: string;
};

type JobItem = {
  id?: string;
  title: string;
  qty: number;
  price_cents: number;
  outcome?: string | null;
};

type DisputeRow = {
  id: string;
  status: string;
  summary: string | null;
  outcome: string | null;
  resolution_reason?: string | null;
  customer_refund_cents?: number | null;
  tradie_transfer_cents?: number | null;
  stripe_refund_status?: string | null;
};

export default function DisputeOutcome({ route }: any) {
  const { jobId } = route.params as { jobId: string };
  const nav = useNavigation<any>();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [dispute, setDispute] = useState<DisputeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: j, error: jErr } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (jErr) {
      Alert.alert('Error', jErr.message);
      setLoading(false);
      return;
    }
    const jobRow = j as Job;
    setJob(jobRow);

    try {
      const { data: disputeRows, error: disputeErr } = await supabase
        .from('disputes')
        .select('id,status,summary,outcome,resolution_reason,customer_refund_cents,tradie_transfer_cents,stripe_refund_status')
        .eq('job_id', jobId)
        .order('submitted_at', { ascending: false })
        .limit(1);
      if (disputeErr) throw disputeErr;

      const latest = (disputeRows?.[0] as DisputeRow | undefined) ?? null;
      setDispute(latest);

      if (latest) {
        const { data: disputeItems, error: itemsErr } = await supabase
          .from('dispute_items')
          .select('id,title,amount_cents,outcome')
          .eq('dispute_id', latest.id);
        if (itemsErr) throw itemsErr;
        setItems(
          (disputeItems || []).map((item: any) => ({
            id: item.id,
            title: item.title,
            qty: 1,
            price_cents: Number(item.amount_cents || 0),
            outcome: item.outcome,
          })),
        );
      } else {
        const { data: rows, error } = await supabase.from('job_items').select('*').eq('job_id', jobId);
        if (error) throw error;
        setItems(rows?.length ? (rows as JobItem[]) : [{ title: jobRow.title, qty: 1, price_cents: jobRow.price_cents }]);
      }
    } catch {
      setItems([{ title: jobRow.title, qty: 1, price_cents: jobRow.price_cents }]);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price_cents * Math.max(1, Number(item.qty || 1)), 0),
    [items],
  );

  async function shareSummary() {
    const lines = [
      'Yakka Dispute Review Summary',
      `Job: ${job?.title || jobId}`,
      `Reference: ${job?.ref_code || jobId}`,
      '',
      'Disputed items:',
      ...items.map(item => `- ${item.title}: ${formatGBPCents(item.price_cents)} (${item.outcome || 'under review'})`),
      '',
      `Disputed item value: ${formatGBPCents(total)}`,
      ...(dispute?.status === 'resolved' ? [
        `Decision: ${dispute.resolution_reason || dispute.outcome || 'Resolved'}`,
        `Customer refund: ${formatGBPCents(Number(dispute.customer_refund_cents || 0))}`,
        `Tradie transfer: ${formatGBPCents(Number(dispute.tradie_transfer_cents || 0))}`,
        `Refund status: ${dispute.stripe_refund_status || 'No refund due'}`,
      ] : []),
      dispute?.status === 'resolved'
        ? 'This dispute has now been resolved. No further action is required.'
        : 'This dispute is still under review.',
    ];
    await Share.share({ message: lines.join('\n') });
  }

  if (loading || !job) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ResponsivePageScrollView>
      <BrandScreenHeader
        title="Dispute outcome"
        onBack={() => nav.goBack()}
        chipLabel={`Job ${job.ref_code || job.id.slice(0, 6)}`}
      />

      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20, marginBottom: 12 }}>
        <Card.Content style={{ gap: 12 }}>
          <Chip icon="check-circle-outline" style={{ backgroundColor: theme.colors.secondaryContainer }}>{dispute?.status === 'resolved' ? 'Dispute resolved' : 'Under review'}</Chip>
          <Text variant="headlineSmall" style={{ }}>Yakka dispute review summary</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
            {dispute?.status === 'resolved' ? 'Yakka has reviewed the job details and evidence. The recorded decision is shown below.' : 'Yakka is reviewing this dispute. The decision will appear here when it has been recorded.'}
          </Text>
        </Card.Content>
      </Card>

      <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
        <Card.Title title="Disputed items" titleStyle={{ }} />
        <Card.Content style={{ gap: 10 }}>
          {items.map((item, index) => (
            <View key={item.id ?? `${item.title}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ }}>{item.title}</Text>
                <Text variant="bodySmall" style={{ opacity: 0.65 }}>
                  {formatGBPCents(item.price_cents * Math.max(1, Number(item.qty || 1)))}
                </Text>
              </View>
              <Chip compact>{item.outcome ? item.outcome.replace('_', ' ') : job.status === 'completed' ? 'Released' : 'Under review'}</Chip>
            </View>
          ))}
        </Card.Content>
      </Card>

      <Card mode="contained" style={{ borderRadius: 24 }}>
        <Card.Title title="Final payment summary" titleStyle={{ }} />
        <Card.Content style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyMedium">Disputed item value</Text>
            <Text variant="bodyMedium" style={{ }}>{formatGBPCents(total)}</Text>
          </View>
          <Divider />
          {dispute?.status === 'resolved' && <View style={{ gap: 8 }}>
            <Text variant="titleMedium">Decision and reason</Text>
            <Text>{dispute.resolution_reason || dispute.outcome || 'Resolved'}</Text>
            <Text>Customer refund: {formatGBPCents(Number(dispute.customer_refund_cents || 0))}</Text>
            <Text>Tradie transfer after fees: {formatGBPCents(Number(dispute.tradie_transfer_cents || 0))}</Text>
            {!!dispute.customer_refund_cents && <Text>Refund status: {dispute.stripe_refund_status || 'Processing'}</Text>}
          </View>}
          <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
            {dispute?.status === 'resolved'
              ? 'This dispute has now been resolved. No further action is required.'
              : 'This dispute is still under review. Yakka will update the outcome here once a decision has been made.'}
          </Text>
          <Button mode="contained-tonal" icon="download" onPress={shareSummary} style={{ borderRadius: 18 }}>
            Share summary
          </Button>
          <Button mode="contained" onPress={() => nav.navigate('ReviewExperience', { jobId, mode: 'yakka' })} style={{ borderRadius: 18 }}>
            Rate your experience
          </Button>
          <Button mode="contained-tonal" onPress={() => nav.navigate('MainTabs')} style={{ borderRadius: 18 }}>
            Back to home
          </Button>
        </Card.Content>
      </Card>
    </ResponsivePageScrollView>
  );
}

