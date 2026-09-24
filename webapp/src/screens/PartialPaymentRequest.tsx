import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Checkbox, Chip, Divider, Text, TextInput, useTheme } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { formatGBPCents } from '../utils/money';
import { pickJobImage, removeJobImage, uploadJobImage } from '../utils/jobImages';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

type Job = {
  id: string; ref_code: string | null; title: string; price_cents: number;
  duration_days: number; upfront_materials_cents?: number | null; status: string;
};
type JobItem = { id: string; title: string; qty: number | null; price_cents: number | null };
type Evidence = { id: string; url: string };

export default function PartialPaymentRequest({ route }: any) {
  const { jobId } = route.params as { jobId: string };
  const nav = useNavigation<any>();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [releasedOrPending, setReleasedOrPending] = useState(0);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [jobResult, itemResult, requestResult] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('job_items').select('id,title,qty,price_cents').eq('job_id', jobId).order('created_at'),
      supabase.from('partial_payment_requests').select('amount_cents,status').eq('job_id', jobId),
    ]);
    if (jobResult.error || itemResult.error || requestResult.error) {
      setLoadError('We could not verify the available amount. Check your connection and try again.');
      setLoading(false);
      return;
    }
    setJob((jobResult.data as Job) || null);
    setItems((itemResult.data || []) as JobItem[]);
    setReleasedOrPending((requestResult.data || [])
      .filter((row: any) => ['requested', 'approved', 'released'].includes(row.status))
      .reduce((sum: number, row: any) => sum + Math.max(0, Number(row.amount_cents || 0)), 0));
    setLoading(false);
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);

  const gross = useMemo(() => Math.max(
    Number(job?.price_cents || 0),
    items.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)) * Math.max(0, Number(item.price_cents || 0)), 0),
  ) + Math.max(0, Number(job?.upfront_materials_cents || 0)), [items, job?.price_cents, job?.upfront_materials_cents]);
  const amount = useMemo(() => items
    .filter(item => selected.includes(item.id))
    .reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)) * Math.max(0, Number(item.price_cents || 0)), 0), [items, selected]);
  const limit = Math.floor(gross * 0.5);
  const remaining = Math.max(0, limit - releasedOrPending);
  const eligible = Number(job?.duration_days || 0) > 28 || Number(job?.upfront_materials_cents || 0) > 0;
  const canSubmit = eligible && selected.length > 0 && amount > 0 && amount <= remaining && reason.trim().length >= 20 && evidence.length > 0;

  async function addEvidence() {
    try {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const uri = await pickJobImage();
      if (!uri) return;
      const uploaded = await uploadJobImage(user.id, jobId, uri);
      const { data, error } = await supabase.from('job_photos').insert({
        job_id: jobId, uploaded_by: user.id, file_url: uploaded.publicUrl,
        storage_path: uploaded.storagePath, stage: 'progress', note: 'Partial payment evidence',
      }).select('id').single();
      if (error) {
        await removeJobImage(uploaded.storagePath);
        throw error;
      }
      setEvidence(current => [...current, { id: data.id, url: uploaded.publicUrl }]);
    } catch (error: any) {
      Alert.alert('Photo could not upload', error?.message || 'Please try again.');
    } finally { setUploading(false); }
  }

  async function submit() {
    if (!canSubmit || !job || sending || loadError) return;
    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const { error } = await supabase.rpc('rpc_create_partial_payment_request', {
        p_job_id: job.id,
        p_job_item_ids: selected,
        p_reason: reason.trim(),
        p_evidence_photo_ids: evidence.map(photo => photo.id),
      });
      if (error) throw error;
      await supabase.from('messages').insert({
        job_id: job.id, sender_id: user.id,
        body: `Partial payment requested: ${formatGBPCents(amount)}. ${reason.trim()}`,
      });
      setSent(true);
    } catch (error: any) {
      Alert.alert('Could not request payment', error?.message || 'Please try again.');
    } finally { setSending(false); }
  }

  if (loadError || (!loading && !job)) return <ResponsivePageScrollView>
    <BrandScreenHeader title="Partial payment" onBack={() => nav.goBack()} />
    <Text>{loadError || 'This job is unavailable.'}</Text>
    <Button mode="contained" onPress={load}>Try again</Button>
  </ResponsivePageScrollView>;
  if (loading || !job) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (sent) return (
    <ResponsivePageScrollView>
      <BrandScreenHeader title="Partial payment" onBack={() => nav.navigate('JobDetails', { jobId })} chipLabel="Requested" />
      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}><Card.Content style={{ gap: 14 }}>
        <Chip icon="check-circle-outline">Requested</Chip>
        <Text variant="headlineSmall" style={{ }}>Partial payment requested</Text>
        <Text>The customer can approve or decline it. The rest remains protected until completion.</Text>
      </Card.Content></Card>
    </ResponsivePageScrollView>
  );

  return (
    <ResponsivePageScrollView keyboardShouldPersistTaps="handled">
      <BrandScreenHeader
        title="Request partial payment"
        onBack={() => nav.goBack()}
        chipLabel={`Job ${job.ref_code || job.id.slice(0, 8)}`}
      />
      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}><Card.Content style={{ gap: 14 }}>
        <Text>Available for jobs over four weeks or with agreed upfront materials. Total partial releases are capped at 50%.</Text>
        {!eligible && <Chip icon="alert-circle-outline">This job is not eligible</Chip>}
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>Job value</Text><Text style={{ }}>{formatGBPCents(gross)}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>Remaining available</Text><Text style={{ }}>{formatGBPCents(remaining)}</Text></View>
        <Text variant="titleMedium" style={{ }}>Select completed tasks or materials</Text>
        {items.map(item => {
          const itemTotal = Math.max(1, Number(item.qty || 1)) * Math.max(0, Number(item.price_cents || 0));
          return <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Checkbox status={selected.includes(item.id) ? 'checked' : 'unchecked'} onPress={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />
            <Text style={{ flex: 1 }}>{item.title}</Text><Text style={{ }}>{formatGBPCents(itemTotal)}</Text>
          </View>;
        })}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="titleMedium">Request total</Text><Text variant="titleMedium" style={{ }}>{formatGBPCents(amount)}</Text></View>
        {amount > remaining && <Text style={{ color: theme.colors.error }}>Selected items exceed your remaining 50% allowance.</Text>}
        <TextInput mode="outlined" label="Why are you requesting this payment?" value={reason} onChangeText={setReason} multiline />
        <Text variant="titleMedium" style={{ }}>Progress evidence</Text>
        <Text>Upload a receipt or a clear photo showing the completed stage.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{evidence.map(photo => <Image key={photo.id} source={{ uri: photo.url }} style={{ width: 82, height: 82, borderRadius: 12 }} />)}</View>
        <Button mode="contained-tonal" icon="image-plus" onPress={addEvidence} loading={uploading} disabled={uploading}>Upload evidence ({evidence.length})</Button>
        <Button mode="contained" onPress={submit} loading={sending} disabled={!canSubmit || sending} contentStyle={{ paddingVertical: 7 }}>Send request</Button>
      </Card.Content></Card>
    </ResponsivePageScrollView>
  );
}
