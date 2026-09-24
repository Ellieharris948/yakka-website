import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from '../ui/paper';
import { supabase } from '../lib/supabase';
import { formatGBPCents } from '../utils/money';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { pickJobImage, removeJobImage, uploadJobImage } from '../utils/jobImages';
import BottomCurtain from '../components/BottomCurtain';
import SlideUpContent from '../components/SlideUpContent';

type Job = {
  id: string;
  ref_code: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  status: string;
};

type JobItem = {
  scope_change_id?: string;
  scope_line_index?: number;
  id?: string;
  job_id: string;
  title: string;
  qty: number;
  price_cents: number;
};

type DisputeDraft = {
  itemId: string;
  details: string;
  photoIds: string[];
  photoUrls: string[];
};

export default function Dispute({ route }: any) {
  const { jobId } = route.params as { jobId: string };
  const nav = useNavigation<any>();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState<'before' | 'select' | 'form' | 'done'>('before');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DisputeDraft>>({});
  const [submitting, setSubmitting] = useState(false);
  const [photoHelpOpen, setPhotoHelpOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      const { data: rows, error } = await supabase
        .from('job_items')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (rows?.length) {
        setItems(rows as JobItem[]);
      } else {
        setItems([{ job_id: jobId, title: jobRow.title, qty: 1, price_cents: jobRow.price_cents }]);
      }
    } catch {
      setItems([{ job_id: jobId, title: jobRow.title, qty: 1, price_cents: jobRow.price_cents }]);
    }
    const { data: changes, error: changesError } = await supabase.from('job_scope_changes').select('*').eq('job_id', jobId).eq('status', 'funded').order('created_at');
    if (changesError) Alert.alert('Extra work unavailable', 'Additional work could not load. Please return to this screen before submitting a dispute about added work.');
    else setItems(previous => [...previous, ...(changes || []).flatMap((change: any) => (change.items || []).map((line: any, index: number) => ({
      ...line, id: `scope:${change.id}:${index}`, job_id: jobId, scope_change_id: change.id, scope_line_index: index,
      title: `Extra work: ${line.title}`,
    })))]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedItems = useMemo(
    () => items.filter((item, index) => selected.includes(item.id ?? String(index))),
    [items, selected],
  );
  const currentItem = selectedItems[currentIndex];
  const currentKey = currentItem ? currentItem.id ?? String(items.indexOf(currentItem)) : '';
  const currentDraft = drafts[currentKey] ?? { itemId: currentKey, details: '', photoIds: [], photoUrls: [] };

  const canContinueSelection = selected.length > 0;
  const canSubmitCurrent = currentDraft.details.trim().length >= 30 && currentDraft.photoIds.length > 0;

  function toggleItem(key: string) {
    setSelected(prev => (prev.includes(key) ? prev.filter(id => id !== key) : [...prev, key]));
  }

  function updateCurrent(patch: Partial<DisputeDraft>) {
    if (!currentKey) return;
    setDrafts(prev => ({
      ...prev,
      [currentKey]: {
        ...(prev[currentKey] ?? { itemId: currentKey, details: '', photoIds: [], photoUrls: [] }),
        ...patch,
      },
    }));
  }

  async function addCurrentPhoto() {
    if (!job || !currentKey) return;
    try {
      setUploadingPhoto(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const uri = await pickJobImage();
      if (!uri) return;
      const uploaded = await uploadJobImage(user.id, job.id, uri);
      const { data, error } = await supabase.from('job_photos').insert({
        job_id: job.id,
        job_item_id: currentItem?.scope_change_id ? null : currentItem?.id || null,
        uploaded_by: user.id,
        file_url: uploaded.storagePath,
        storage_path: uploaded.storagePath,
        stage: 'dispute',
        note: `Dispute evidence: ${currentItem?.title || job.title}`,
      }).select('id').single();
      if (error) {
        await removeJobImage(uploaded.storagePath);
        throw error;
      }
      updateCurrent({
        photoIds: [...currentDraft.photoIds, data.id],
        photoUrls: [...currentDraft.photoUrls, uploaded.imageUrl],
      });
    } catch (error: any) {
      Alert.alert('Photo could not upload', error?.message || 'Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function submitDispute() {
    if (!job) return;
    try {
      setSubmitting(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not signed in');

      const body = {
        jobId: job.id,
        items: selectedItems.map(item => {
          const key = item.id ?? String(items.indexOf(item));
          const draft = drafts[key];
          return {
            jobItemId: item.scope_change_id ? null : item.id ?? null,
            scopeChangeId: item.scope_change_id, scopeLineIndex: item.scope_line_index,
            title: item.title,
            amountCents: item.price_cents * Math.max(1, Number(item.qty || 1)),
            details: draft?.details ?? '',
            evidencePhotoIds: draft?.photoIds ?? [],
          };
        }),
      };
      const { data, error } = await supabase.functions.invoke('submit-dispute', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      nav.replace('DisputeRaised', {
        jobId: job.id,
        refCode: data?.requestNumber || job.ref_code || undefined,
      });
    } catch (e: any) {
      Alert.alert('Could not submit dispute', e?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !job) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (step === 'done') {
    return (
      <SlideUpContent motionKey={step}>
        <ResponsivePageScrollView>
        <BrandScreenHeader
          title="Dispute"
          onBack={() => nav.navigate('MainTabs')}
          chipLabel="Registered"
        />
        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Chip icon="check-circle-outline">Dispute registered</Chip>
            <Text variant="headlineSmall" style={{ }}>Your dispute has been registered.</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
              Please expect a response via email within 5 working days. Payment for disputed items will stay on hold while Yakka reviews the details.
            </Text>
            <Button mode="contained-tonal" onPress={() => nav.navigate('JobDetails', { jobId })} style={{ borderRadius: 18 }}>
              View job
            </Button>
          </Card.Content>
        </Card>
        </ResponsivePageScrollView>
      </SlideUpContent>
    );
  }

  return (
    <SlideUpContent motionKey={`${step}-${currentIndex}`}>
      <ResponsivePageScrollView keyboardShouldPersistTaps="handled">
      <BrandScreenHeader
        title={`Dispute - Job ${job.ref_code || job.id.slice(0, 6)}`}
        onBack={() => (step === 'before' ? nav.goBack() : setStep('before'))}
        chipLabel={job.status.replace('_', ' ')}
      />

      {step === 'before' && (
        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="headlineSmall" style={{ }}>Before raising a dispute</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
              If part of the work is not complete or not as agreed, please message the tradie first to ask them to return and fix it. If this has not resolved the issue, you can continue to raise a dispute and Yakka will review the payment.
            </Text>
            <Button mode="contained-tonal" icon="message-text-outline" onPress={() => nav.navigate('Chat', { jobId })} style={{ borderRadius: 18 }}>
              Message Tradie
            </Button>
            <Button mode="contained" onPress={() => setStep('select')} style={{ borderRadius: 18 }}>
              I&apos;ve contacted the tradie & issue not resolved
            </Button>
            <Button mode="text" onPress={() => nav.goBack()}>
              Cancel
            </Button>
          </Card.Content>
        </Card>
      )}

      {step === 'select' && (
        <Card mode="contained" style={{ borderRadius: 24 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="headlineSmall" style={{ }}>Job dispute summary</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.75 }}>Only the selected items will be reviewed.</Text>
            <Divider />

            {items.map((item, index) => {
              const key = item.id ?? String(index);
              const checked = selected.includes(key);
              const total = item.price_cents * Math.max(1, Number(item.qty || 1));
              return (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Checkbox status={checked ? 'checked' : 'unchecked'} onPress={() => toggleItem(key)} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ }}>{item.title}</Text>
                    <Text variant="bodySmall" style={{ opacity: 0.65 }}>{formatGBPCents(total)}</Text>
                  </View>
                  <Chip compact>{checked ? 'Disputed' : 'Release'}</Chip>
                </View>
              );
            })}

            <Button
              mode="contained"
              disabled={!canContinueSelection}
              onPress={() => {
                setCurrentIndex(0);
                setStep('form');
              }}
              style={{ borderRadius: 18 }}
            >
              Continue
            </Button>
          </Card.Content>
        </Card>
      )}

      {step === 'form' && currentItem && (
        <Card mode="contained" style={{ borderRadius: 24 }}>
          <Card.Content style={{ gap: 12 }}>
            <Chip compact>
              Dispute item {currentIndex + 1} of {selectedItems.length}
            </Chip>
            <Text variant="headlineSmall" style={{ }}>{currentItem.title}</Text>
            <Text variant="bodySmall" style={{ opacity: 0.7 }}>
              Please describe what was agreed, what was delivered, and where it differs.
            </Text>

            <TextInput
              mode="outlined"
              label="Dispute details"
              value={currentDraft.details}
              onChangeText={details => updateCurrent({ details })}
              multiline
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ }}>Upload evidence</Text>
                <Text variant="bodySmall" style={{ opacity: 0.65 }}>
                  Photos are required to support your dispute.
                </Text>
              </View>
              <IconButton icon="information-outline" onPress={() => setPhotoHelpOpen(true)} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {currentDraft.photoUrls.map((url, index) => (
                <Image key={`${url}-${index}`} source={{ uri: url }} style={{ width: 88, height: 88, borderRadius: 12 }} />
              ))}
            </View>

            <Button
              mode="contained-tonal"
              icon="image-plus"
              onPress={addCurrentPhoto}
              loading={uploadingPhoto}
              disabled={uploadingPhoto}
              style={{ borderRadius: 18 }}
            >
              Add photo ({currentDraft.photoIds.length})
            </Button>

            <Button
              mode="contained"
              disabled={!canSubmitCurrent || submitting}
              loading={submitting}
              onPress={() => {
                if (currentIndex < selectedItems.length - 1) {
                  setCurrentIndex(currentIndex + 1);
                  return;
                }
                submitDispute();
              }}
              style={{ borderRadius: 18 }}
            >
              {currentIndex < selectedItems.length - 1 ? 'Next' : 'Submit dispute'}
            </Button>

          </Card.Content>
        </Card>
      )}

      <BottomCurtain visible={photoHelpOpen} onDismiss={() => setPhotoHelpOpen(false)} title="Helpful evidence">
          <View>
            <Text variant="bodyMedium">
              Add clear before and after photos, close-ups of the issue, and any images that show what was agreed in the job breakdown.
            </Text>
          </View>
      </BottomCurtain>
      </ResponsivePageScrollView>
    </SlideUpContent>
  );
}

