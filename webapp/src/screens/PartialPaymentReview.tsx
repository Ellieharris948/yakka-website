import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Chip, Divider, Text } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { buildJobPaymentBreakdown, buildPartialReleaseBreakdown } from '../utils/jobPayments';
import { formatGBPCents } from '../utils/money';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import { signJobImageRows } from '../utils/jobImages';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

type Job = {
  id: string;
  ref_code: string | null;
  title: string;
  price_cents: number;
  trader_id: string;
  client_id: string | null;
};

type PartialPaymentRequest = {
  id: string;
  job_id: string;
  amount_cents: number;
  reason: string;
  status: 'requested' | 'approved' | 'declined' | 'released' | 'cancelled';
  created_at: string;
  evidence_photo_ids?: string[];
};

export default function PartialPaymentReview({ route }: any) {
  const { jobId } = route.params as { jobId: string };
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [requests, setRequests] = useState<PartialPaymentRequest[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [isClient, setIsClient] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data: jobRow, error: jobErr } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (jobErr) {
      setLoadError('We could not load the job. Check your connection and try again.');
      setLoading(false);
      return;
    }
    setJob(jobRow as Job);

    const { data, error } = await supabase
      .from('partial_payment_requests')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError('We could not load the requests. Please try again.');
      setLoading(false);
      return;
    }
    setRequests((data || []) as PartialPaymentRequest[]);
    const { data: auth } = await supabase.auth.getUser();
    setIsClient(auth.user?.id === jobRow.client_id);
    const photoIds = [...new Set((data || []).flatMap(request => request.evidence_photo_ids || []))] as string[];
    if (photoIds.length) {
      const photos = await supabase.from('job_photos').select('id,file_url,storage_path').eq('job_id', jobId).in('id', photoIds);
      if (photos.error) setLoadError('We could not load the supporting evidence. Please try again before deciding.');
      else {
        try {
          const signedPhotos = await signJobImageRows(photos.data || []);
          setEvidence(Object.fromEntries(signedPhotos.filter(photo => photo.file_url).map(photo => [photo.id, photo.file_url!])));
        } catch {
          setLoadError('We could not open the supporting evidence securely. Please try again before deciding.');
        }
      }
    } else setEvidence({});
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const requestedTotal = useMemo(
    () => requests.filter(request => request.status === 'requested').reduce((sum, request) => sum + request.amount_cents, 0),
    [requests],
  );
  const paymentBreakdown = useMemo(() => buildJobPaymentBreakdown(job as any), [job]);

  async function decide(request: PartialPaymentRequest, status: 'approved' | 'declined') {
    if (!job || !isClient || savingId || loadError || request.status !== 'requested') return;
    try {
      setSavingId(request.id);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not signed in');

      if (status === 'approved') {
        await invokeEdgeFunction('payout', { jobId: job.id, partialRequestId: request.id });
      } else {
        const { error } = await supabase.rpc('rpc_decline_partial_payment_request', {
          p_request_id: request.id,
        });
        if (error) throw error;
      }

      await supabase.from('messages').insert({
        job_id: job.id,
        sender_id: user.id,
        body:
          status === 'approved'
            ? (() => {
                const release = buildPartialReleaseBreakdown({ requestedCents: request.amount_cents });
                return `Partial payment approved: ${formatGBPCents(request.amount_cents)} from held funds. ${formatGBPCents(release.transferCents)} released to the tradie after the 5% Yakka fee.`;
              })()
            : `Partial payment declined: ${formatGBPCents(request.amount_cents)}.`,
      });

      await load();
    } catch (e: any) {
      Alert.alert('Could not update request', e?.message || 'Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  if (loadError || (!loading && !job)) return (
    <ResponsivePageScrollView>
      <BrandScreenHeader title="Review payment request" onBack={() => nav.goBack()} />
      <Text>{loadError || 'This job is unavailable.'}</Text>
      <Button mode="contained" onPress={load}>Try again</Button>
    </ResponsivePageScrollView>
  );

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
        title="Review payment request"
        onBack={() => nav.goBack()}
        chipLabel={`Job ${job.ref_code || job.id.slice(0, 6)}`}
      />

      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20, marginBottom: 12 }}>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineSmall" style={{ }}>Partial payment request</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
            Partial payments are capped at 50% of the job value. The remaining balance stays protected until the job is completed and confirmed.
          </Text>
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyMedium">Job value</Text>
            <Text variant="bodyMedium" style={{ }}>{formatGBPCents(paymentBreakdown.tradieGrossCents)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyMedium">Requested now</Text>
            <Text variant="bodyMedium" style={{ }}>{formatGBPCents(requestedTotal)}</Text>
          </View>
        </Card.Content>
      </Card>

      {requests.map(request => {
        const release = buildPartialReleaseBreakdown({ requestedCents: request.amount_cents });
        return (
          <Card key={request.id} mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
            <Card.Content style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ }}>{formatGBPCents(request.amount_cents)}</Text>
                  <Text variant="bodySmall" style={{ opacity: 0.7 }}>{request.reason}</Text>
                </View>
                <Chip compact>{request.status.replace('_', ' ')}</Chip>
              </View>

              <Divider />
              {!!request.evidence_photo_ids?.length && <>
                <Text variant="titleMedium">Supporting evidence</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {request.evidence_photo_ids.map(id => evidence[id] ? <Image key={id} source={{ uri: evidence[id] }} accessibilityLabel="Partial payment evidence" style={{ width: 96, height: 96, borderRadius: 12 }} /> : null)}
                </View>
                <Button mode="text" onPress={() => nav.navigate('JobImages', { jobId })}>View job photos</Button>
              </>}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodySmall">Yakka tradie fee (5%)</Text>
                <Text variant="bodySmall">-{formatGBPCents(release.feeWithheldCents)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodyMedium" style={{ }}>{request.status === 'released' ? 'Released to tradie' : 'Tradie receives on release'}</Text>
                <Text variant="bodyMedium" style={{ }}>{formatGBPCents(release.transferCents)}</Text>
              </View>

              {request.status === 'requested' && isClient && (
                <>
                  <Button
                    mode="contained"
                    icon="check-circle-outline"
                    onPress={() => Alert.alert('Approve partial payment?', `${formatGBPCents(request.amount_cents)} will be released from funds already held for this job. Your tradie receives ${formatGBPCents(release.transferCents)} after the 5% fee. This is not a new charge.`, [
                      { text: 'Keep reviewing', style: 'cancel' },
                      { text: 'Approve release', onPress: () => { void decide(request, 'approved'); } },
                    ])}
                    loading={savingId === request.id}
                    disabled={!!savingId}
                    style={{ borderRadius: 18 }}
                  >
                    Approve partial payment
                  </Button>
                  <Button
                    mode="contained-tonal"
                    icon="message-text-outline"
                    onPress={() => nav.navigate('Chat', { jobId })}
                    style={{ borderRadius: 18 }}
                  >
                    Message tradie
                  </Button>
                  <Button
                    mode="text"
                    onPress={() => decide(request, 'declined')}
                    disabled={!!savingId}
                  >
                    Decline request
                  </Button>
                </>
              )}
            </Card.Content>
          </Card>
        );
      })}

      {!requests.length && (
        <Card mode="contained" style={{ borderRadius: 24 }}>
          <Card.Content>
            <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
              No partial payment requests yet.
            </Text>
          </Card.Content>
        </Card>
      )}
    </ResponsivePageScrollView>
  );
}

