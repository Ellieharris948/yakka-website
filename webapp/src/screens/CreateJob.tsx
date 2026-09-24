// src/screens/CreateJob.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, Share, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
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
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { ensureMyProfile } from '../api/profile';
import { ensureQuoteRows } from '../api/jobQuote';
import { formatGBPCents, parseGBPToCents } from '../utils/money';
import LocationInput from '../components/LocationInput';
import BrandScreenHeader from '../components/BrandScreenHeader';
import PageBackHeader from '../components/PageBackHeader';
import DateField from '../components/DateField';
import BottomCurtain from '../components/BottomCurtain';
import SlideUpContent from '../components/SlideUpContent';
import { BRAND_COLORS } from '../theme';
import { buildPaymentBreakdown } from '../utils/jobPayments';
import { UK_VAT_RATE_BPS } from '../utils/vat';
import BrandSwitch from '../components/BrandSwitch';
import SwipeSegmentedControl from '../components/SwipeSegmentedControl';
import { BRAND_CONTENT_MAX_WIDTH, getResponsiveScreenGutter } from '../utils/layout';

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
};

type CreateJobProps = {
  embedded?: boolean;
  initialProfile?: any;
  onDismiss?: () => void;
  onComplete?: () => void;
};

type DraftTask = {
  id: string;
  title: string;
  description: string;
  price_gbp: string;
  additional_notes: string;
  materials_supplied_by: 'trader' | 'customer' | 'na';
};

type DraftMaterial = {
  id: string;
  title: string;
  description: string;
  price_gbp: string;
  upfront_requested: boolean;
};

type Step = 'NEW_JOB' | 'HOWTO' | 'BREAKDOWN' | 'REVIEW' | 'SHARE';

const DEFAULT_FLEX_DAYS = 5;
const MIN_LINE_VALUE_CENTS = 10000;
const TASK_MATERIAL_SOURCE_OPTIONS = [
  { value: 'trader', label: 'Tradie' },
  { value: 'customer', label: 'Customer' },
  { value: 'na', label: 'N/A' },
] as const;

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function cleanMoneyInput(value: string) {
  let next = String(value || '').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  const match = next.match(/^(\d+)(?:\.(\d{0,2}))?/);
  if (match) next = match[1] + (match[2] !== undefined ? `.${match[2]}` : next.includes('.') ? '.' : '');
  return next;
}

async function copyToClipboard(text: string) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      await (navigator as any).clipboard.writeText(text);
      Alert.alert('Copied', 'Copied to clipboard.');
      return;
    }
  } catch {}

  try {
    // @ts-ignore optional dependency
    const Clipboard = require('@react-native-clipboard/clipboard')?.default;
    if (Clipboard?.setString) {
      Clipboard.setString(text);
      Alert.alert('Copied', 'Copied to clipboard.');
      return;
    }
  } catch {}

  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert('Copy failed', 'Could not access clipboard.');
  }
}

export default function CreateJob({
  embedded = false,
  initialProfile = null,
  onDismiss,
  onComplete,
}: CreateJobProps = {}) {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  const [loading, setLoading] = useState(!initialProfile);
  const [me, setMe] = useState<any>(initialProfile);
  const [step, setStep] = useState<Step>('NEW_JOB');
  const [creating, setCreating] = useState(false);
  const savingRef = useRef(false);
  const pendingQuote = useRef<{ job: Job; snapshot: string } | null>(null);
  const [createdJob, setCreatedJob] = useState<Job | null>(null);
  const [dontShowHowto, setDontShowHowto] = useState(false);
  const [infoKey, setInfoKey] = useState<null | 'TITLE' | 'DESC' | 'PRICE' | 'NOTES' | 'UPFRONT'>(null);

  const [jobTitle, setJobTitle] = useState('');
  const [jobLocation, setJobLocation] = useState('');
  const [proposedStartDate, setProposedStartDate] = useState<Date | undefined>(undefined);
  const [expectedCompletionDate, setExpectedCompletionDate] = useState<Date | undefined>(undefined);
  const [generalNotes, setGeneralNotes] = useState('');
  const [disputeTermsAccepted, setDisputeTermsAccepted] = useState(false);

  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [taskDraft, setTaskDraft] = useState<DraftTask>({
    id: uid(),
    title: '',
    description: '',
    price_gbp: '',
    additional_notes: '',
    materials_supplied_by: 'na',
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const [materials, setMaterials] = useState<DraftMaterial[]>([]);
  const [materialDraft, setMaterialDraft] = useState<DraftMaterial>({
    id: uid(),
    title: '',
    description: '',
    price_gbp: '',
    upfront_requested: false,
  });
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialFormOpen, setMaterialFormOpen] = useState(false);

  useEffect(() => {
    if (initialProfile) {
      setMe(initialProfile);
      setLoading(false);
      return;
    }
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const profile = await ensureMyProfile();
      if (profile?.role !== 'trader') {
        Alert.alert('Not allowed', 'Only traders can create jobs.');
        if (embedded) onDismiss?.();
        else nav.goBack();
        return;
      }

      setMe(profile);
      setLoading(false);
    })();
  }, [embedded, initialProfile, nav, onDismiss]);

  const durationDays = useMemo(() => {
    if (!proposedStartDate || !expectedCompletionDate) return 0;
    const start = new Date(format(proposedStartDate, 'yyyy-MM-dd') + 'T00:00:00').getTime();
    const end = new Date(format(expectedCompletionDate, 'yyyy-MM-dd') + 'T00:00:00').getTime();
    const diff = Math.max(0, Math.floor((end - start) / 86400000));
    return diff + 1;
  }, [proposedStartDate, expectedCompletionDate]);

  const partialPaymentsEligible = durationDays > 28;

  const tasksTotalCents = useMemo(() => {
    let total = 0;
    for (const task of tasks) {
      try {
        total += parseGBPToCents(task.price_gbp || '0');
      } catch {}
    }
    return total;
  }, [tasks]);

  const materialsTotalCents = useMemo(() => materials.reduce((total, material) => {
    try { return total + parseGBPToCents(material.price_gbp || '0'); } catch { return total; }
  }, 0), [materials]);
  const upfrontMaterialsCents = useMemo(() => {
    return materials.filter(material => material.upfront_requested).reduce((total, material) => {
      try { return total + parseGBPToCents(material.price_gbp || '0'); } catch { return total; }
    }, 0);
  }, [materials]);
  const vatRegistered = me?.vat_registered === true;
  const paymentBreakdown = useMemo(() => buildPaymentBreakdown({
    laborCents: tasksTotalCents,
    materialsCents: materialsTotalCents,
    upfrontMaterialsCents,
    vatRegistered,
    vatRateBps: UK_VAT_RATE_BPS,
  }), [materialsTotalCents, tasksTotalCents, upfrontMaterialsCents, vatRegistered]);

  const canContinueNewJob = useMemo(
    () => jobTitle.trim().length >= 3 && !!proposedStartDate && !!expectedCompletionDate && expectedCompletionDate >= proposedStartDate,
    [jobTitle, proposedStartDate, expectedCompletionDate],
  );

  const canGenerate = tasks.length > 0;

  const resetMaterialDraft = useCallback(() => {
    setEditingMaterialId(null);
    setMaterialDraft({ id: uid(), title: '', description: '', price_gbp: '', upfront_requested: false });
    setMaterialFormOpen(false);
  }, []);

  const beginMaterialAdd = useCallback(() => {
    setEditingMaterialId(null);
    setMaterialDraft({ id: uid(), title: '', description: '', price_gbp: '', upfront_requested: false });
    setMaterialFormOpen(true);
  }, []);

  const addOrUpdateMaterial = useCallback(() => {
    const title = materialDraft.title.trim();
    const price = cleanMoneyInput(materialDraft.price_gbp);
    if (!title || !price) {
      Alert.alert('Material details', 'Add a material description and cost.');
      return;
    }
    let cents = 0;
    try { cents = parseGBPToCents(price); } catch {}
    if (cents <= 0) {
      Alert.alert('Material cost', 'Enter a valid material cost.');
      return;
    }
    const normalized = { ...materialDraft, title, description: materialDraft.description.trim(), price_gbp: price };
    setMaterials(current => editingMaterialId
      ? current.map(material => material.id === editingMaterialId ? normalized : material)
      : [...current, normalized]);
    resetMaterialDraft();
  }, [editingMaterialId, materialDraft, resetMaterialDraft]);

  const startEditMaterial = useCallback((id: string) => {
    const material = materials.find(item => item.id === id);
    if (!material) return;
    setEditingMaterialId(id);
    setMaterialDraft(material);
    setMaterialFormOpen(true);
  }, [materials]);

  const removeMaterial = useCallback((id: string) => {
    setMaterials(current => current.filter(material => material.id !== id));
    if (editingMaterialId === id) resetMaterialDraft();
  }, [editingMaterialId, resetMaterialDraft]);

  const resetTaskDraft = useCallback(() => {
    setEditingTaskId(null);
    setTaskDraft({
      id: uid(),
      title: '',
      description: '',
      price_gbp: '',
      additional_notes: '',
      materials_supplied_by: 'na',
    });
    setTaskFormOpen(false);
  }, []);

  const beginTaskAdd = useCallback(() => {
    setEditingTaskId(null);
    setTaskDraft({
      id: uid(),
      title: '',
      description: '',
      price_gbp: '',
      additional_notes: '',
      materials_supplied_by: 'na',
    });
    setTaskFormOpen(true);
  }, []);

  const addOrUpdateTask = useCallback(() => {
    if (!taskDraft.title.trim()) {
      Alert.alert('Missing', 'Task title is required.');
      return;
    }
    if (!taskDraft.description.trim()) {
      Alert.alert('Missing', 'Task description is required.');
      return;
    }

    const cleaned = cleanMoneyInput(taskDraft.price_gbp);
    if (!cleaned) {
      Alert.alert('Missing', 'Task price is required.');
      return;
    }

    let cents = 0;
    try {
      cents = parseGBPToCents(cleaned);
    } catch {
      Alert.alert('Invalid price', 'Use something like 100 or 100.00');
      return;
    }

    if (cents < MIN_LINE_VALUE_CENTS) {
      Alert.alert('Minimum line value', 'Each job line must be at least £100.');
      return;
    }

    const normalized: DraftTask = {
      ...taskDraft,
      title: taskDraft.title.trim(),
      description: taskDraft.description.trim(),
      price_gbp: cleaned,
      additional_notes: taskDraft.additional_notes.trim(),
    };

    setTasks(prev => {
      if (editingTaskId) {
        return prev.map(task => (task.id === editingTaskId ? normalized : task));
      }
      return [...prev, normalized];
    });

    resetTaskDraft();
  }, [taskDraft, editingTaskId, resetTaskDraft]);

  const startEditTask = useCallback((id: string) => {
    const found = tasks.find(task => task.id === id);
    if (!found) return;
    setEditingTaskId(id);
    setTaskDraft(found);
    setTaskFormOpen(true);
  }, [tasks]);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
    if (editingTaskId === id) resetTaskDraft();
  }, [editingTaskId, resetTaskDraft]);

  function buildShareText(refCode: string) {
    const traderName = me?.name ?? 'me';
    const upper = String(refCode || '').toUpperCase();
    const universal = `https://yakka.app/join/${upper}`;

    return `Hi! To review and book this job with ${traderName} on Yakka:

${universal}

If the app asks for a code, use: ${upper}`;
  }

  const shareLink = useMemo(() => {
    if (!createdJob?.ref_code) return '';
    return `https://yakka.app/join/${String(createdJob.ref_code).toUpperCase()}`;
  }, [createdJob?.ref_code]);

  const createInSupabase = useCallback(async () => {
    if (!me?.id || savingRef.current) return;
    if (!tasks.length) {
      Alert.alert('Add tasks', 'Please add at least one line in the job breakdown.');
      return;
    }
    if (!disputeTermsAccepted) {
      Alert.alert('Confirmation needed', 'Accept the dispute decision terms before creating this job.');
      return;
    }
    savingRef.current = true;
    try {
      setCreating(true);

      const plannedIso = proposedStartDate ? format(proposedStartDate, 'yyyy-MM-dd') : null;
      const expectedIso = expectedCompletionDate ? format(expectedCompletionDate, 'yyyy-MM-dd') : null;

      const descriptionBlob = [
        jobLocation ? `Location: ${jobLocation}` : '',
        generalNotes ? `General notes: ${generalNotes}` : '',
        expectedIso ? `Expected completion: ${expectedIso}` : '',
        upfrontMaterialsCents > 0
          ? `Upfront materials requested: ${formatGBPCents(upfrontMaterialsCents)}. Customer will approve these have arrived before funds are released.`
          : '',
        partialPaymentsEligible
          ? 'This job is estimated to last over 4 weeks and can become eligible for partial payments later.'
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const payload: Partial<Job> & Record<string, any> = {
        trader_id: me.id,
        title: jobTitle.trim(),
        description: descriptionBlob || null,
        price_cents: tasksTotalCents,
        currency: 'GBP',
        duration_days: Math.max(1, durationDays),
        planned_start_date: plannedIso,
        flex_days: DEFAULT_FLEX_DAYS,
        country_code: 'GB',
        status: 'proposed',
        upfront_materials_cents: upfrontMaterialsCents,
        materials_cents: materialsTotalCents,
        vat_registered: vatRegistered,
        vat_registration_number: vatRegistered ? me?.vat_registration_number || null : null,
        vat_rate_bps: vatRegistered ? UK_VAT_RATE_BPS : 0,
        allows_partial_payments: partialPaymentsEligible || upfrontMaterialsCents > 0,
        payment_protection_fee_bps: 250,
        trader_dispute_terms_accepted_at: new Date().toISOString(),
      };

      const snapshot = JSON.stringify({ payload, tasks, materials });
      if (pendingQuote.current && pendingQuote.current.snapshot !== snapshot) {
        throw new Error('This job has already been saved in part. Restore the reviewed draft and retry, or open the saved job to edit it.');
      }
      let jobRow = pendingQuote.current?.job;
      if (!jobRow) {
        const result = await supabase.from('jobs').insert(payload).select().single();
        if (result.error) throw result.error;
        if (!result.data) throw new Error('The job save could not be confirmed. Check your jobs before trying again.');
        jobRow = result.data as Job;
        pendingQuote.current = { job: jobRow, snapshot };
      }
      await ensureQuoteRows(supabase, 'job_items', jobRow.id, tasks.map(task => ({
        job_id: jobRow!.id,
        title: task.title.trim(),
        description: task.description.trim(),
        notes: [task.additional_notes.trim(), `Materials supplied by: ${task.materials_supplied_by === 'trader' ? 'Tradie' : task.materials_supplied_by === 'customer' ? 'Customer' : 'N/A'}`].filter(Boolean).join('\n') || null,
        qty: 1,
        price_cents: parseGBPToCents(task.price_gbp),
      })));
      await ensureQuoteRows(supabase, 'job_materials', jobRow.id, materials.map(material => ({
        job_id: jobRow!.id, title: material.title, description: material.description || null,
        price_cents: parseGBPToCents(material.price_gbp), upfront_requested: material.upfront_requested,
      })));

      setCreatedJob(jobRow as Job);
      setStep('SHARE');
    } catch (e: any) {
      Alert.alert('Job not ready to share', e.message || 'The complete quote could not be saved. Please retry before sharing.', [
        { text: 'Keep reviewing', style: 'cancel' },
        ...(pendingQuote.current ? [{ text: 'Open saved job', onPress: () => {
          onDismiss?.();
          nav.navigate('JobDetails', { jobId: pendingQuote.current!.job.id });
        } }] : []),
      ]);
    } finally {
      savingRef.current = false;
      setCreating(false);
    }
  }, [
    durationDays,
    disputeTermsAccepted,
    expectedCompletionDate,
    generalNotes,
    jobLocation,
    jobTitle,
    me?.id,
    me?.vat_registration_number,
    materials,
    materialsTotalCents,
    partialPaymentsEligible,
    proposedStartDate,
    tasks,
    tasksTotalCents,
    upfrontMaterialsCents,
    vatRegistered,
  ]);

  function goBackStep() {
    if (step === 'NEW_JOB') {
      if (embedded) onDismiss?.();
      else nav.goBack();
    }
    else if (step === 'HOWTO') setStep('NEW_JOB');
    else if (step === 'BREAKDOWN') setStep(dontShowHowto ? 'NEW_JOB' : 'HOWTO');
    else if (step === 'REVIEW') setStep('BREAKDOWN');
    else if (step === 'SHARE') {
      if (embedded) onComplete?.();
      else nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    }
  }

  const HeaderBar = ({ title }: { title?: string }) => embedded ? (
    <View style={{ marginHorizontal: -screenGutter, marginBottom: 20 }}>
      <PageBackHeader onBack={goBackStep} title={title} />
    </View>
  ) : (
    <View style={{ marginBottom: 12 }}>
      <BrandScreenHeader onBack={goBackStep} title={title || 'Create job'} />
    </View>
  );

  const InfoDialog = () => {
    const copy = (() => {
      if (infoKey === 'TITLE') return { title: 'Task title', body: 'What part of the job is this?' };
      if (infoKey === 'DESC') {
        return {
          title: 'Task description',
          body: 'Describe exactly what is included, and add quantities where relevant.',
        };
      }
      if (infoKey === 'PRICE') {
        return {
          title: 'Price',
          body: 'Use the agreed price for this task. Minimum line value is £100.',
        };
      }
      if (infoKey === 'NOTES') {
        return {
          title: 'Additional notes',
          body: 'Anything else the customer or Yakka should know, such as exclusions or access notes.',
        };
      }
      if (infoKey === 'UPFRONT') {
        return {
          title: 'Material costs',
          body: 'Use this for materials you need to buy before work begins, such as paint, tiles or timber. If upfront payment is required, the customer sees and approves this amount as part of the job.',
        };
      }
      return { title: '', body: '' };
    })();

    return (
      <BottomCurtain visible={!!infoKey} onDismiss={() => setInfoKey(null)} title={copy.title}>
        <View>
          <Text variant="bodyMedium">{copy.body}</Text>
        </View>
      </BottomCurtain>
    );
  };

  if (step === 'NEW_JOB') {
    return (
      <SlideUpContent motionKey={step}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: screenGutter, paddingTop: 16, paddingBottom: 40 }}>
          <HeaderBar />

          <View style={{ gap: 18, paddingBottom: 18 }}>
              <Text variant="titleLarge">Add the core job details</Text>

              {!!materials.length && (
                <View style={{ gap: 8 }}>
                  <Text variant="titleMedium">Materials</Text>
                  {materials.map((material, index) => (
                    <View key={material.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium">Material {index + 1} - {material.title}</Text>
                        {!!material.description && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{material.description}</Text>}
                        {material.upfront_requested && <Text variant="labelSmall" style={{ color: BRAND_COLORS.maroon }}>Upfront payment requested</Text>}
                      </View>
                      <Text variant="bodyMedium">{formatGBPCents(parseGBPToCents(material.price_gbp))}</Text>
                    </View>
                  ))}
                  <Divider />
                </View>
              )}
              <TextInput
                mode="outlined"
                label="Job title"
                value={jobTitle}
                onChangeText={setJobTitle}
                placeholder="e.g. Living-room refurbishment"
              />

              <LocationInput
                label="Job location"
                value={jobLocation}
                onChangeText={setJobLocation}
                placeholder="e.g. SW1A 1AA"
              />

              <DateField
                label="Proposed start date"
                value={proposedStartDate}
                onChange={setProposedStartDate}
              />

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: -8 }}>
                There is {DEFAULT_FLEX_DAYS} days leeway on this start date.
              </Text>

              <DateField
                label="Expected completion date"
                value={expectedCompletionDate}
                onChange={setExpectedCompletionDate}
                minimumDate={proposedStartDate}
              />

              <TextInput
                mode="outlined"
                label="General notes"
                value={generalNotes}
                onChangeText={setGeneralNotes}
                multiline
                placeholder="e.g. Access notes or important information about the project"
              />

              <Button
                mode="contained"
                style={{ borderRadius: 18, marginTop: 4 }}
                contentStyle={{ paddingVertical: 8 }}
                onPress={() => {
                  if (!canContinueNewJob) {
                    Alert.alert('Check job details', 'Add a job title and valid dates. Completion must be on or after the proposed start.');
                    return;
                  }
                  setStep(dontShowHowto ? 'BREAKDOWN' : 'HOWTO');
                }}
              >
                Add job breakdown
              </Button>
          </View>
        </ScrollView>
      </SlideUpContent>
    );
  }

  if (step === 'HOWTO') {
    return (
      <SlideUpContent motionKey={step}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: screenGutter, paddingTop: 16, paddingBottom: 40 }}>
          <HeaderBar title="Job breakdown" />

          <Card mode="contained" style={{ borderRadius: 24 }}>
            <Card.Content style={{ gap: 12 }}>
              <Text variant="titleMedium" style={{ }}>
                How to fill out your job breakdown
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                Think of this like a digital quote. It is what Yakka uses to verify exactly what was agreed if there is ever a dispute.
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                Be specific. Include materials, quantities, and what is excluded.
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                Break larger jobs into smaller tasks. The clearer the breakdown, the stronger your protection.
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                Use fixed prices for each line where possible so the customer can see what they are paying for.
              </Text>

              <Button
                mode="contained"
                style={{ borderRadius: 18 }}
                contentStyle={{ paddingVertical: 8 }}
                onPress={() => setStep('BREAKDOWN')}
              >
                Got it - start adding tasks
              </Button>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Checkbox status={dontShowHowto ? 'checked' : 'unchecked'} onPress={() => setDontShowHowto(v => !v)} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Do not show this again
                </Text>
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
      </SlideUpContent>
    );
  }

  if (step === 'BREAKDOWN') {
    return (
      <SlideUpContent motionKey={step}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: screenGutter, paddingTop: 16, paddingBottom: 40 }}>
          <HeaderBar title="Job breakdown" />

          <View
            style={{
              borderLeftWidth: 3,
              borderLeftColor: BRAND_COLORS.maroon,
              borderRadius: 16,
              backgroundColor: theme.colors.surfaceVariant,
              padding: 14,
              marginBottom: 18,
            }}
          >
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              The more you break this down, the better protected you are. If a dispute is raised, only that line is held while everything else can be paid out.
            </Text>
          </View>

          <Card mode="outlined" style={{ borderRadius: 24, marginBottom: 18, borderColor: materialFormOpen ? BRAND_COLORS.maroon : theme.colors.outlineVariant }}>
            <Card.Content style={{ gap: 14, paddingVertical: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="titleMedium">Materials</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                    Add each material cost separately. Materials are optional and shown clearly to the customer.
                  </Text>
                </View>
                <Chip compact>Optional</Chip>
              </View>

              {materials.map((material, index) => (
                <View key={material.id} style={{ borderRadius: 18, padding: 12, gap: 5, backgroundColor: theme.colors.surfaceVariant }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">Material {index + 1} - {material.title}</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatGBPCents(parseGBPToCents(material.price_gbp))}</Text>
                      {material.upfront_requested && <Chip compact icon="clock-outline" style={{ alignSelf: 'flex-start', marginTop: 6 }}>Upfront payment</Chip>}
                    </View>
                    <IconButton icon="pencil-outline" onPress={() => startEditMaterial(material.id)} />
                    <IconButton icon="trash-can-outline" onPress={() => removeMaterial(material.id)} />
                  </View>
                  {!!material.description && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{material.description}</Text>}
                </View>
              ))}

              {!materialFormOpen ? (
                <Button mode="outlined" icon="plus-circle" onPress={beginMaterialAdd} style={{ borderRadius: 18, borderStyle: 'dashed' }}>
                  Add materials
                </Button>
              ) : (
                <View style={{ gap: 14 }}>
                  <Text variant="titleMedium">{editingMaterialId ? 'Edit material' : 'Add materials'}</Text>
              <TextInput mode="outlined" label="Materials description" value={materialDraft.title} onChangeText={title => setMaterialDraft(current => ({ ...current, title }))} placeholder="e.g. Paint and supplies" />
              <TextInput mode="outlined" label="Details (optional)" value={materialDraft.description} onChangeText={description => setMaterialDraft(current => ({ ...current, description }))} multiline placeholder="e.g. 2 × Dulux Pure Brilliant White 5L and masking tape" />
              <TextInput mode="outlined" label={vatRegistered ? 'Cost (£, ex VAT)' : 'Cost (£)'} keyboardType="decimal-pad" value={materialDraft.price_gbp} onChangeText={price_gbp => setMaterialDraft(current => ({ ...current, price_gbp: cleanMoneyInput(price_gbp) }))} placeholder="e.g. 120" />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">Request upfront payment</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Release when the customer confirms receipt.</Text>
                </View>
                <BrandSwitch
                  value={materialDraft.upfront_requested}
                  onValueChange={upfront_requested => setMaterialDraft(current => ({ ...current, upfront_requested }))}
                  accessibilityLabel="Request upfront material payment"
                />
              </View>

              {materialDraft.upfront_requested && (
                <View style={{ borderRadius: 14, padding: 12, backgroundColor: theme.colors.surfaceVariant }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Funds release when the customer confirms the materials arrived, or you provide proof such as a receipt or approved delivery photo.
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Button mode="outlined" onPress={resetMaterialDraft} style={{ flex: 1, minWidth: 110 }}>
                  Cancel
                </Button>
                <Button mode="contained" onPress={addOrUpdateMaterial} style={{ flex: 2, minWidth: 140 }}>
                  {editingMaterialId ? 'Save material' : 'Add materials'}
                </Button>
              </View>
                </View>
              )}
            </Card.Content>
          </Card>

          <Text variant="titleMedium" style={{ marginBottom: 12 }}>Tasks</Text>

          {!!tasks.length && (
            <Card mode="outlined" style={{ borderRadius: 24, marginBottom: 18, borderColor: theme.colors.outlineVariant }}>
              <Card.Content style={{ gap: 10 }}>
                {tasks.map((task, index) => (
                  <View
                    key={task.id}
                    style={{
                      borderRadius: 18,
                      backgroundColor: theme.colors.surfaceVariant,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="titleMedium">Task {index + 1} · {task.title}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                          {formatGBPCents(parseGBPToCents(task.price_gbp))}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row' }}>
                        <IconButton icon="pencil-outline" onPress={() => startEditTask(task.id)} />
                        <IconButton icon="trash-can-outline" onPress={() => removeTask(task.id)} />
                      </View>
                    </View>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                      {task.description}
                    </Text>
                    {!!task.additional_notes && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                        {task.additional_notes}
                      </Text>
                    )}
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Materials: {task.materials_supplied_by === 'trader' ? 'Tradie' : task.materials_supplied_by === 'customer' ? 'Customer' : 'N/A'}
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          {!taskFormOpen ? (
            <Button mode="outlined" icon="plus-circle" onPress={beginTaskAdd} style={{ borderRadius: 18, borderStyle: 'dashed', marginBottom: 18 }}>
              Add task
            </Button>
          ) : (
          <Card mode="outlined" style={{ borderRadius: 24, marginBottom: 18, borderColor: BRAND_COLORS.maroon }}>
            <Card.Content style={{ gap: 16, paddingVertical: 18 }}>
              <Text variant="titleMedium">{editingTaskId ? 'Edit task' : 'Add task'}</Text>
              <TextInput
                mode="outlined"
                label="Task title"
                value={taskDraft.title}
                onChangeText={text => setTaskDraft(state => ({ ...state, title: text }))}
                placeholder="e.g. Paint living-room walls"
                right={<TextInput.Icon icon="information-outline" size={18} forceTextInputFocus={false} onPress={() => setInfoKey('TITLE')} />}
              />

              <TextInput
                mode="outlined"
                label="Task description"
                value={taskDraft.description}
                onChangeText={text => setTaskDraft(state => ({ ...state, description: text }))}
                multiline
                placeholder="e.g. Prep and paint 4 walls, 2 coats, masking and cleanup included"
                right={<TextInput.Icon icon="information-outline" size={18} forceTextInputFocus={false} onPress={() => setInfoKey('DESC')} />}
              />

              <TextInput
                mode="outlined"
                label="Price (£)"
                keyboardType="decimal-pad"
                value={taskDraft.price_gbp}
                onChangeText={text => setTaskDraft(state => ({ ...state, price_gbp: cleanMoneyInput(text) }))}
                placeholder="e.g. 500"
                right={<TextInput.Icon icon="information-outline" size={18} forceTextInputFocus={false} onPress={() => setInfoKey('PRICE')} />}
              />

              <TextInput
                mode="outlined"
                label="Additional notes"
                value={taskDraft.additional_notes}
                onChangeText={text => setTaskDraft(state => ({ ...state, additional_notes: text }))}
                multiline
                placeholder="e.g. Excludes ceiling; customer supplies dust sheets"
                right={<TextInput.Icon icon="information-outline" size={18} forceTextInputFocus={false} onPress={() => setInfoKey('NOTES')} />}
              />

              <View style={{ gap: 8 }}>
                <Text variant="bodyMedium">Materials supplied by</Text>
                <SwipeSegmentedControl
                  value={taskDraft.materials_supplied_by}
                  options={TASK_MATERIAL_SOURCE_OPTIONS}
                  onChange={materials_supplied_by => setTaskDraft(state => ({ ...state, materials_supplied_by }))}
                  accessibilityLabel="Choose who supplies materials"
                />
              </View>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Minimum task value is £100.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 }}>
                <Button mode="outlined" onPress={resetTaskDraft} style={{ flex: 1, minWidth: 110 }}>
                  Cancel
                </Button>
                <Button mode="contained" onPress={addOrUpdateTask} style={{ flex: 2, minWidth: 140 }}>
                  {editingTaskId ? 'Save task' : 'Add task'}
                </Button>
              </View>
            </Card.Content>
          </Card>
          )}

          <View style={{ gap: 10 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              {tasks.length
                ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${formatGBPCents(tasksTotalCents)}`
                : 'Add at least one task to continue'}
            </Text>
            <Button mode="contained" contentStyle={{ paddingVertical: 8 }} disabled={!tasks.length} onPress={() => setStep('REVIEW')}>
              Review job
            </Button>
          </View>
        </ScrollView>

        <InfoDialog />
      </SlideUpContent>
    );
  }

  if (step === 'REVIEW') {
    return (
      <SlideUpContent motionKey={step}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: screenGutter, paddingTop: 16, paddingBottom: 40 }}>
          <HeaderBar title="Review job" />

          <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
            <Card.Content style={{ gap: 10 }}>
              {tasks.map((task, index) => (
                <View key={task.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text variant="bodyMedium" style={{ flex: 1 }}>
                      Task {index + 1} - {task.title}
                    </Text>
                    <IconButton icon="pencil-outline" onPress={() => {
                      startEditTask(task.id);
                      setStep('BREAKDOWN');
                    }} />
                  </View>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                    {task.description}
                  </Text>
                  {!!task.additional_notes && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                      {task.additional_notes}
                    </Text>
                  )}
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Materials supplied by: {task.materials_supplied_by === 'trader' ? 'Tradie' : task.materials_supplied_by === 'customer' ? 'Customer' : 'N/A'}
                  </Text>
                  <Text variant="bodySmall" style={{ }}>
                    {formatGBPCents(parseGBPToCents(task.price_gbp))}
                  </Text>
                  {index < tasks.length - 1 && <Divider />}
                </View>
              ))}

              <Divider />

              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyMedium" style={{ }}>
                    Tasks subtotal (ex VAT)
                  </Text>
                  <Text variant="bodyMedium" style={{ }}>
                    {formatGBPCents(tasksTotalCents)}
                  </Text>
                </View>
                {materialsTotalCents > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyMedium">Materials (ex VAT)</Text>
                    <Text variant="bodyMedium">{formatGBPCents(materialsTotalCents)}</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyMedium">Subtotal (ex VAT)</Text>
                  <Text variant="bodyMedium">{formatGBPCents(paymentBreakdown.subtotalExVatCents)}</Text>
                </View>

                {paymentBreakdown.vatCents > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyMedium">VAT (20%)</Text>
                    <Text variant="bodyMedium">{formatGBPCents(paymentBreakdown.vatCents)}</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyMedium">Customer service fee (2%)</Text>
                  <Text variant="bodyMedium">{formatGBPCents(paymentBreakdown.clientFeeCents)}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="titleMedium">Customer pays</Text>
                  <Text variant="titleMedium">{formatGBPCents(paymentBreakdown.totalDueCents)}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyMedium" style={{ }}>
                    Yakka fee
                  </Text>
                  <Text variant="bodyMedium" style={{ }}>
                    {formatGBPCents(paymentBreakdown.sellerFeeCents)}
                  </Text>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: -6 }}>
                  5% of the agreed job value is deducted when each payout portion is released.
                </Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="titleSmall" style={{ }}>
                    Net to you
                  </Text>
                  <Text variant="titleSmall" style={{ }}>
                    {formatGBPCents(paymentBreakdown.netToSellerCents)}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
            <Card.Content style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="bodyMedium">Material costs</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {materials.length
                      ? `${formatGBPCents(materialsTotalCents)} total${upfrontMaterialsCents ? ` · ${formatGBPCents(upfrontMaterialsCents)} requested upfront` : ''}`
                      : 'No materials added'}
                  </Text>
                </View>
                <Button mode="contained-tonal" compact onPress={() => setStep('BREAKDOWN')}>Edit</Button>
              </View>

              {partialPaymentsEligible ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                  This job is estimated to run longer than 4 weeks, so it can become eligible for partial payments later. Those requests can be up to 50% and are released through Stripe when approved.
                </Text>
              ) : (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                  Partial payments are only available for jobs estimated to run longer than 4 weeks.
                </Text>
              )}

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                Customers pay this total upfront into Yakka&apos;s secure account. You will receive payment once the job is marked complete.
              </Text>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                Yakka Tip: The clearer your breakdown, the stronger your protection if there is ever a dispute.
              </Text>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.colors.outlineVariant, padding: 12, gap: 8 }}>
                <Checkbox.Item
                  position="leading"
                  label="I understand that if a dispute cannot be resolved between the customer and tradie, Yakka will review the agreed job, messages and evidence and make the final decision on how held funds are distributed."
                  labelStyle={{ textAlign: 'left', color: theme.colors.onSurface, lineHeight: 20 }}
                  labelVariant="bodyMedium"
                  labelMaxFontSizeMultiplier={1}
                  style={{ paddingHorizontal: 0 }}
                  accessibilityLabel="I accept Yakka dispute decision terms"
                  status={disputeTermsAccepted ? 'checked' : 'unchecked'}
                  onPress={() => setDisputeTermsAccepted(value => !value)}
                />
                <Button mode="text" onPress={() => nav.navigate('StaticInfo', { kind: 'terms' })}>
                  Read terms and conditions
                </Button>
              </View>

              <Button mode="contained-tonal" style={{ borderRadius: 18 }} onPress={() => setStep('BREAKDOWN')}>
                Edit job breakdown
              </Button>
              <Button
                mode="contained"
                style={{ borderRadius: 18 }}
                contentStyle={{ paddingVertical: 8 }}
                onPress={createInSupabase}
                loading={creating}
                disabled={creating || loading || !canGenerate || !disputeTermsAccepted}
              >
                Generate job link
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>

        <InfoDialog />
      </SlideUpContent>
    );
  }

  return (
    <SlideUpContent motionKey={step}>
      <ScrollView contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: screenGutter, paddingTop: 16, paddingBottom: 40 }}>
        <HeaderBar title="Share job" />

        <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="headlineSmall" style={{ }}>
              You are ready to share this job
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Send the secure Yakka link to your customer so they can review the breakdown and join the job.
            </Text>

            <Card mode="outlined" style={{ borderRadius: 24 }}>
              <Card.Content>
                <Text selectable variant="bodySmall">
                  {shareLink || '-'}
                </Text>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              style={{ borderRadius: 18 }}
              onPress={async () => {
                if (!createdJob?.ref_code) return;
                await copyToClipboard(buildShareText(createdJob.ref_code));
              }}
            >
              Copy job link
            </Button>

            <Card mode="outlined" style={{ borderRadius: 24 }}>
              <Card.Content style={{ gap: 8 }}>
                <Text variant="titleSmall" style={{ }}>
                  Ready-to-send message
                </Text>
                <Text selectable variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                  {createdJob?.ref_code ? buildShareText(createdJob.ref_code) : ''}
                </Text>
                <Button
                  mode="contained-tonal"
                  onPress={async () => {
                    if (!createdJob?.ref_code) return;
                    await copyToClipboard(buildShareText(createdJob.ref_code));
                  }}
                  style={{ borderRadius: 18 }}
                >
                  Copy message
                </Button>
              </Card.Content>
            </Card>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Once they pay, funds are held securely by Yakka until completion.
            </Text>

            <Button
              mode="contained-tonal"
              style={{ borderRadius: 18 }}
              onPress={() => {
                if (embedded) {
                  onComplete?.();
                  return;
                }
                if (createdJob?.id) {
                  nav.reset({
                    index: 1,
                    routes: [
                      { name: 'MainTabs' },
                      { name: 'JobDetails', params: { jobId: createdJob.id } },
                    ],
                  });
                } else {
                  nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
                }
              }}
            >
              Save and continue
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </SlideUpContent>
  );
}
