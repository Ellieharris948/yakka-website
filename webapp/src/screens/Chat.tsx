// src/screens/Chat.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View, Pressable } from 'react-native';
import {
  ActivityIndicator,
  Text,
  Banner,
  TextInput,
  Button,
  IconButton,
  useTheme,
} from '../ui/paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { sellerMarksDone, clientNotDone, setClientFinalRequestSent } from '../api/jobs';
import { BRAND_COLORS, BRAND_GRADIENT, BRAND_STATUS_COLORS, BRAND_TYPOGRAPHY, getBrandHeaderGradient } from '../theme';
import { getJobStatusMeta } from '../utils/statusStyles';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import { hasJobPhotoStage } from '../utils/jobImages';
import BrandHeaderBar from '../components/BrandHeaderBar';
import BottomCurtain from '../components/BottomCurtain';
import PageBackHeader from '../components/PageBackHeader';
import { getResponsiveScreenGutter } from '../utils/layout';
import ScreenState from '../components/ScreenState';
import JobProgressTimeline from '../components/JobProgressTimeline';
import {
  formatChatClock,
  normalizeChatJob,
  normalizeChatMessage,
  NormalizedChatJob,
  NormalizedChatMessage,
} from '../utils/chatData';

type Profile = { id: string; name: string | null };
type ChatMessage = NormalizedChatMessage;
type Job = NormalizedChatJob;

function isDeclinedStatus(s?: string | null) {
  return s === 'cancelled' || s === 'declined';
}

function daysBetween(sd?: string | null, ed?: string | null) {
  if (!sd || !ed) return 0;
  const d1 = new Date(sd + 'T00:00:00');
  const d2 = new Date(ed + 'T00:00:00');
  const ms = d2.getTime() - d1.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}
function todayYmd() { const d = new Date(); return d.toISOString().slice(0,10); }
function cmpDate(a: string, b: string) { if (a === b) return 0; return a < b ? -1 : 1; }
function absDiffDays(aIso: string, bIso: string) {
  const a = new Date(aIso + 'T00:00:00').getTime();
  const b = new Date(bIso + 'T00:00:00').getTime();
  return Math.floor(Math.abs(a - b) / 86400000);
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** --- Local notification helper (Expo optional) --- */
async function scheduleFinishPhotoReminder(endISO: string) {
  try {
    // @ts-ignore dynamic for non-Expo builds
    const Notifications = require('expo-notifications');
    if (!Notifications?.scheduleNotificationAsync) return;

    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) await Notifications.requestPermissionsAsync();

    const now = new Date();
    const end1800 = new Date(endISO + 'T18:00:00');
    const dayBefore = new Date(end1800);
    dayBefore.setDate(dayBefore.getDate() - 1);

    let trigger: Date = dayBefore;
    if (trigger.getTime() - now.getTime() < 5 * 60 * 1000) trigger = new Date(endISO + 'T10:00:00');
    if (trigger.getTime() - now.getTime() < 5 * 60 * 1000) trigger = new Date(now.getTime() + 60 * 1000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Remember finish photos',
        body: 'Before the job ends, take clear “after” photos in case of a dispute.',
        sound: true,
        // @ts-ignore
        priority: Notifications.AndroidNotificationPriority?.HIGH ?? undefined,
      },
      trigger,
    });
  } catch {
    // ignore
  }
}

/** --- Inline helper: submit a review (allows halves) --- */
async function submitReview(params: {
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  stars: number; // 1..5 in 0.5 steps
  comment?: string;
}) {
  const { jobId, reviewerId, revieweeId, stars, comment } = params;
  const { error } = await supabase.from('reviews').insert({
  job_id: jobId,
  reviewer_id: reviewerId,
  reviewee_id: revieweeId,
  stars,
  comment: comment ?? null,
  hidden: false,
  });
  if (error) throw error;
}

/** --- Rating modal used for both trader + client --- */
function RatingModal({
  visible,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (stars: number, comment: string) => Promise<void>;
}) {
  const [stars, setStars] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const options = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

  return (
    <BottomCurtain visible={visible} onDismiss={onDismiss} title="Rate this job">
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map(v => (
            <Button
              key={String(v)}
              compact
              mode={stars === v ? 'contained' : 'contained-tonal'}
              onPress={() => setStars(v)}
            >
              {v}★
            </Button>
          ))}
        </View>

        <TextInput
          mode="outlined"
          label="Optional comment"
          value={comment}
          onChangeText={setComment}
          style={{ marginTop: 12 }}
          multiline
        />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onPress={onDismiss} disabled={loading}>Cancel</Button>
          <Button
            mode="contained"
            loading={loading}
            onPress={async () => {
              try {
                setLoading(true);
                await onSubmit(stars, comment.trim());
                onDismiss();
              } finally {
                setLoading(false);
              }
            }}
          >
            Submit review
          </Button>
        </View>
      </View>
    </BottomCurtain>
  );
}

export default function Chat({ route }: any) {
  const jobId = typeof route?.params?.jobId === 'string'
    ? route.params.jobId.trim()
    : '';
  const nav = useNavigation<any>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  const [me, setMe] = useState<Profile | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [other, setOther] = useState<Profile | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [completing, setCompleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageLoadError, setMessageLoadError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const messageListRef = useRef<ScrollView>(null);
  const initialScrollDone = useRef(false);

  // Proposal modal
  const [proposalOpen, setProposalOpen] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pPriceGBP, setPPriceGBP] = useState('');
  const [pDurationDays, setPDurationDays] = useState('');
  const [savingProposal, setSavingProposal] = useState(false);

  // Incomplete modal (client)
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [incompleteReason, setIncompleteReason] = useState('');
  const [sendingIncomplete, setSendingIncomplete] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [partialPaymentStatus, setPartialPaymentStatus] = useState<string | null>(null);

  const isTrader = useMemo(() => !!me && !!job && me.id === job.trader_id, [me, job]);

  // --- Days/period helpers
  const totalDays = useMemo(() => daysBetween(job?.start_date || undefined, job?.end_date || undefined), [job?.start_date, job?.end_date]);
  const ymd = todayYmd();
  const started = useMemo(() => !!job?.start_date && cmpDate(ymd, job.start_date!) >= 0, [job?.start_date, ymd]);
  const ended = useMemo(() => !!job?.end_date && cmpDate(ymd, job.end_date!) > 0, [job?.end_date, ymd]);
  const daysRemaining = useMemo(() => {
    if (!job?.start_date || !job?.end_date) return null;
    if (cmpDate(ymd, job.start_date) < 0) {
      const d1 = new Date(ymd + 'T00:00:00');
      const d2 = new Date(job.start_date + 'T00:00:00');
      return -Math.max(0, Math.floor((d2.getTime()-d1.getTime())/86400000));
    }
    const d1 = new Date(ymd + 'T00:00:00');
    const d2 = new Date(job.end_date + 'T00:00:00');
    const left = Math.floor((d2.getTime()-d1.getTime())/86400000) + 1;
    return Math.max(0, left);
  }, [job?.start_date, job?.end_date, ymd]);

  // Composer rules — only client may send 1 final message after completion
  const canSend = useMemo(() => {
    if (!otherId) return false;
    if (job?.status === 'disputed') return false;
    if (job?.status !== 'completed') return true;
    const isClient = !!me && !!job && me.id === job.client_id;
    if (isClient && job && !job.client_final_request_sent) return true;
    return false;
  }, [me, job, otherId]);

  // Buttons logic
  const showTraderDone = useMemo(
    () => !job?.scope_change_status && isTrader && started && (job?.status === 'in_progress'),
    [isTrader, started, job?.status, job?.scope_change_status]
  );
  const showClientIncomplete = useMemo(
    () => !isTrader && job?.status === 'seller_done',
    [isTrader, ended, job?.status]
  );
  const showStartTrader = useMemo(
    () => !job?.scope_change_status && isTrader && !job?.start_date && !job?.started_trader && job?.status === 'funded',
    [isTrader, job?.start_date, job?.started_trader, job?.status, job?.scope_change_status]
  );
  const showStartClient = useMemo(
    () => !job?.scope_change_status && !isTrader && !job?.start_date && !!job?.started_trader && job?.status === 'funded',
    [isTrader, job?.start_date, job?.started_trader, job?.status, job?.scope_change_status]
  );

  function formatGBPFromCents(cents?: number | null) {
    if (cents == null) return '';
    return (cents / 100).toFixed(2).replace(/\.00$/, '');
  }
  function parseGBPToCents(v: string) {
    const clean = v.replace(/[^\d.,]/g, '').replace(',', '.').trim();
    if (!clean) return NaN;
    const num = Number(clean);
    if (Number.isNaN(num)) return NaN;
    return Math.round(num * 100);
  }

  async function getProfileMaybe(id: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name')
        .eq('id', id)
        .maybeSingle();
      if (error || !data?.id) return null;
      return { id: String(data.id), name: data.name == null ? null : String(data.name) };
    } catch {
      return null;
    }
  }

  const loadMessages = useCallback(async () => {
    if (!jobId) return;
    try {
      const { data: rows, error } = await supabase
        .from('messages')
        .select('id, sender_id, body, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const nextSeen = new Set<string>();
      const nextMessages = (rows || []).flatMap(row => {
        const message = normalizeChatMessage(row);
        if (!message) return [];
        nextSeen.add(message._id);
        return [message];
      });

      seen.current = nextSeen;
      setMessages(nextMessages.reverse());
      initialScrollDone.current = false;
      setMessageLoadError(null);
    } catch (error: unknown) {
      setMessageLoadError(error instanceof Error && error.message
        ? error.message
        : 'Messages could not be loaded.');
    }
  }, [jobId]);

  async function loadInitial() {
    setLoading(true);
    setLoadError(null);

    try {
      if (!jobId) throw new Error('This conversation link is incomplete.');

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again to open this conversation.');

      const { data: my } = await supabase.from('profiles').select('id,name').eq('id', user.id).maybeSingle();
      setMe(my?.id
        ? { id: String(my.id), name: my.name == null ? null : String(my.name) }
        : { id: user.id, name: null });

      const { data: j, error: jobError } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
      if (jobError) throw jobError;
      if (!j) throw new Error('This job is no longer available or you do not have access to it.');

      const jobRow = normalizeChatJob(j, jobId);
      if (!jobRow) throw new Error('This conversation contains invalid job data.');
      setJob(jobRow);
      const { data: latestPartial } = await supabase
        .from('partial_payment_requests')
        .select('status')
        .eq('job_id', jobId)
        .in('status', ['requested', 'approved', 'released'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPartialPaymentStatus(latestPartial?.status || null);

      const computedOtherId = user.id === jobRow.trader_id ? jobRow.client_id : jobRow.trader_id;
      if (computedOtherId) {
        setOtherId(computedOtherId);
        const prof = await getProfileMaybe(computedOtherId);
        setOther(prof ?? { id: computedOtherId, name: null });
      } else {
        setOtherId(null);
        setOther(null);
      }

      await loadMessages();

      const channelTopic = `chat-${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const channel = supabase
      .channel(channelTopic)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `job_id=eq.${jobId}` },
        (payload) => {
          const m = normalizeChatMessage(payload.new);
          if (!m || seen.current.has(m._id)) return;
          seen.current.add(m._id);
          setMessages(prev => [...prev, m]);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        async (payload) => {
          const next = normalizeChatJob(payload.new, jobId);
          if (!next) return;
          setJob(next);

          const nextOtherId = user.id === next.trader_id ? next.client_id : next.trader_id;
          if (nextOtherId) {
            setOtherId(prev => prev ?? nextOtherId);
            if (!other?.name || other.id !== nextOtherId) {
              const prof = await getProfileMaybe(nextOtherId);
              setOther(prof ?? { id: nextOtherId, name: null });
            }
          }
        })
      .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch (error: any) {
      setJob(null);
      setLoadError(error?.message || 'The conversation could not be opened.');
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let unsub: null | (() => void) = null;
    let cancelled = false;
    (async () => {
      const cleanup = (await loadInitial()) as (() => void) | undefined;
      if (cancelled) {
        cleanup?.();
        return;
      }
      unsub = cleanup || null;
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
    }, [loadMessages]),
  );

  const onSend = useCallback(async () => {
    const text = composerText.trim();
    if (!text) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      _id: tempId,
      text,
      createdAt: new Date(),
      user: { _id: me?.id ?? null },
    };

    try {
      if (job?.status === 'completed' && me?.id === job.client_id && !job.client_final_request_sent) {
        await setClientFinalRequestSent(job.id);
        setJob((prev) => prev ? { ...prev, client_final_request_sent: true } : prev);
      }

      setComposerText('');
      setMessages(prev => [...prev, optimisticMessage]);
      requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated: true }));

      const { data: inserted, error } = await supabase.from('messages').insert({
        job_id: jobId,
        sender_id: me?.id,
        body: text,
      }).select('id, sender_id, body, created_at').single();
      if (error) throw error;

      const savedMessage = normalizeChatMessage(inserted);
      if (savedMessage) {
        seen.current.add(savedMessage._id);
        setMessages(prev => {
          if (prev.some(message => message._id === savedMessage._id)) {
            return prev.filter(message => message._id !== tempId);
          }
          const tempIndex = prev.findIndex(message => message._id === tempId);
          if (tempIndex === -1) return [...prev, savedMessage];
          return prev.map(message => message._id === tempId ? savedMessage : message);
        });
      } else {
        await loadMessages();
      }
    } catch (e: any) {
      setMessages(prev => prev.filter(message => message._id !== tempId));
      setComposerText(text);
      Alert.alert('Error', e.message || 'Failed to send.');
    }
  }, [composerText, job?.status, job?.id, job?.client_id, job?.client_final_request_sent, jobId, me?.id, loadMessages]);

  async function openProposal() {
    setPTitle(job?.title || '');
    setPDescription(job?.description || '');
    setPPriceGBP(formatGBPFromCents(job?.price_cents));
    setPDurationDays(job?.duration_days ? String(job?.duration_days) : '');
    setProposalOpen(true);
  }

  const submitIncomplete = useCallback(async () => {
    try {
      setSendingIncomplete(true);
      await clientNotDone(job!.id, incompleteReason);
      setIncompleteOpen(false);
      Alert.alert('Thanks', 'We’ve been notified.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit.');
    } finally {
      setSendingIncomplete(false);
    }
  }, [job, incompleteReason]);

const confirmStartFor = useCallback(async (who: 'trader' | 'client') => {
  if (!job) return;

  // Client-side guard for trader: respect ± flex window
  if (who === 'trader') {
    const planned = job.planned_start_date || '';
    const flex = Number(job.flex_days || 0);
    const today = todayYmd();
    if (!planned) {
      Alert.alert('No planned start', 'Please set a planned start date on this job.');
      return;
    }
    const diff = absDiffDays(planned, today);
    if (diff > flex) {
      Alert.alert('Outside start window', `This is ${diff} days away from the planned start. Window is ±${flex} days.`);
      return;
    }
    Alert.alert('Before you start', 'Tip: take clear “before” photos now in case of a dispute later.');
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Please sign in again.');

    const { count: beforePhotoCount, error: beforePhotoError } = await supabase
      .from('job_photos')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('stage', 'before');
    if (beforePhotoError) throw beforePhotoError;
    if (!beforePhotoCount) {
      Alert.alert(
        'Waiting for before photos',
        'Trader or client must upload at least one before photo. Once a before photo is there, the other person can approve it by confirming the job start.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload before photo', onPress: () => nav.navigate('JobImages', { jobId: job.id }) },
        ],
      );
      return;
    }

    const { error } = await supabase.rpc('rpc_confirm_job_start', {
      p_job_id: job.id,
      p_who: who,
    });
    if (error) throw error;

    const { data: refreshed, error: refreshError } = await supabase.from('jobs').select('*').eq('id', job.id).single();
    if (refreshError) throw refreshError;

    const updated = normalizeChatJob(refreshed, job.id);
    if (!updated) throw new Error('The refreshed job data was invalid. Please reload the conversation.');
    const justStarted = !job.start_date && !!updated.start_date && !!updated.end_date;

    setJob(updated);

    // Send the chat note (optional but nice)
    if (user) {
      await supabase.from('messages').insert({
        job_id: job.id,
        sender_id: user.id,
        body: who === 'trader' ? 'Trader confirmed job start.' : 'Client confirmed job start.',
      });
    }

    // Schedule the “finish photos” reminder once we know the true end date
    if (justStarted) {
      await scheduleFinishPhotoReminder(updated.end_date!);
      await supabase.from('messages').insert({
        job_id: job.id,
        sender_id: user?.id,
        body: `Job started • ${updated.start_date} → ${updated.end_date}.`,
      });
    }
  } catch (e: any) {
    Alert.alert('Error', e?.message || 'Could not confirm start.');
  }
}, [job, nav]);

const markTraderDone = useCallback(async () => {
  if (!job || !me) return;

  try {
    if (!(await hasJobPhotoStage(job.id, me.id, 'after'))) {
      Alert.alert('Add completed photos', 'Upload at least one photo of the finished work before marking the job complete.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upload completed photo', onPress: () => nav.navigate('JobImages', { jobId: job.id, intent: 'completion' }) },
      ]);
      return;
    }
    await sellerMarksDone(job.id);
    await supabase.from('messages').insert({
      job_id: job.id,
      sender_id: me.id,
      body: 'Trader marked the job done. Please confirm if completed.',
    });
    nav.navigate('CompletionSuccess', { jobId: job.id, role: 'trader' });
  } catch (e: any) {
    Alert.alert('Error', e?.message || 'Could not mark the job complete.');
  }
}, [job, me, nav]);

const confirmCompleted = useCallback(async () => {
  if (!job || !me || completing) return;

  try {
    setCompleting(true);
    const payoutResult = await invokeEdgeFunction('payout', { jobId: job.id });
    await supabase.from('messages').insert({
      job_id: job.id,
      sender_id: me.id,
      body: payoutResult?.payoutPending
        ? 'Customer confirmed completion. Payment release is pending.'
        : 'Customer confirmed completion. Payment has been released.',
    });
    nav.navigate('CompletionSuccess', {
      jobId: job.id,
      role: 'client',
      payoutPending: !!payoutResult?.payoutPending,
      message: payoutResult?.message,
    });
  } catch (e: any) {
    Alert.alert('Error', e?.message || 'Could not complete the job.');
  } finally {
    setCompleting(false);
  }
}, [completing, job, me, nav]);


  if (loading) {
    return (
      <View style={[chatStyles.screen, { backgroundColor: theme.colors.background }]}>
        <View style={{ backgroundColor: getBrandHeaderGradient(theme.dark)[0] }}>
          <BrandHeaderBar topInset={insets.top} verticalPadding={10} curvedBottom />
        </View>
        <PageBackHeader onBack={() => nav.goBack()} title="Messages" />
        <ScreenState loading title="Loading conversation" />
      </View>
    );
  }

  if (!me || !job) {
    return (
      <View style={[chatStyles.screen, { backgroundColor: theme.colors.background }]}>
        <View style={{ backgroundColor: getBrandHeaderGradient(theme.dark)[0] }}>
          <BrandHeaderBar topInset={insets.top} verticalPadding={10} curvedBottom />
        </View>
        <PageBackHeader onBack={() => nav.goBack()} title="Messages" />
        <ScreenState
          title="Conversation unavailable"
          message={loadError || 'This conversation may have been removed or you may no longer have access.'}
          icon="message-alert-outline"
          actionLabel="Go back"
          onAction={() => nav.goBack()}
        />
      </View>
    );
  }

  if (messageLoadError) {
    return (
      <View style={[chatStyles.screen, { backgroundColor: theme.colors.background }]}>
        <View style={{ backgroundColor: getBrandHeaderGradient(theme.dark)[0] }}>
          <BrandHeaderBar topInset={insets.top} verticalPadding={10} curvedBottom />
        </View>
        <PageBackHeader onBack={() => nav.goBack()} title="Messages" />
        <ScreenState
          title="Messages could not load"
          message={messageLoadError}
          icon="message-alert-outline"
          actionLabel="Try again"
          onAction={() => {
            setLoading(true);
            void loadMessages().finally(() => setLoading(false));
          }}
        />
      </View>
    );
  }

  const statusMeta = getJobStatusMeta(job, isTrader ? 'trader' : 'client', {
    dark: theme.dark,
    partialPaymentStatus,
  });
  const headerGradient = getBrandHeaderGradient(theme.dark);

  return (
    <View style={[chatStyles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={{ backgroundColor: headerGradient[0] }}>
        <BrandHeaderBar topInset={insets.top} verticalPadding={10} curvedBottom />
      </View>
      <PageBackHeader onBack={() => nav.goBack()} title="Messages" />

      <ScrollView
        accessibilityLabel="Job information and actions"
        style={{ flexGrow: 0, maxHeight: Math.max(120, height * 0.32) }}
        keyboardShouldPersistTaps="handled"
      >
      <View style={[chatStyles.contentWidth, chatStyles.timelineWrap, { paddingHorizontal: screenGutter }]}>
        <JobProgressTimeline
          status={job.status}
          role={isTrader ? 'trader' : 'client'}
          contained
          compact
        />
      </View>

      <View style={[chatStyles.contentWidth, { paddingHorizontal: screenGutter }]}>
      <View style={[chatStyles.jobSummary, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, theme.fonts.bodyMedium.fontSize >= 19.5 && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="titleLarge" numberOfLines={2} style={[chatStyles.otherName, { color: theme.colors.onSurface }]}>{other?.name || 'Job messages'}</Text>
          <Text variant="bodyMedium" numberOfLines={2} style={[chatStyles.summaryJobTitle, { color: theme.colors.onSurface }]}>{job.title || 'Yakka job'}</Text>
          <Text variant="labelMedium" style={[chatStyles.summaryJobId, { color: theme.colors.onSurfaceVariant }]}>Job ID: {job.ref_code || job.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={[chatStyles.summaryActions, theme.fonts.bodyMedium.fontSize >= 19.5 && { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View
            accessibilityLabel={statusMeta.bannerLabel}
            style={[
              chatStyles.summaryStatusDot,
              { backgroundColor: statusMeta.backgroundColor, borderColor: statusMeta.borderColor },
            ]}
          />
          <Button compact mode="contained" buttonColor={BRAND_COLORS.orange} textColor={BRAND_COLORS.white} onPress={() => nav.navigate('JobDetails', { jobId: job.id })} style={{ borderRadius: 18 }}>
            View job
          </Button>
        </View>
      </View>
      </View>

      {!!job.scope_change_status && <View style={{ paddingHorizontal: screenGutter, paddingBottom: 12 }}>
        <Text variant="bodyMedium">{job.scope_change_status === 'proposed' ? 'Extra work is awaiting customer approval.' : 'Extra work is awaiting additional payment.'} Open the job to review it. Work resumes after payment is confirmed.</Text>
      </View>}
      {/* Declined banner for trader to resend */}
      {isTrader && !!otherId && isDeclinedStatus(job.status) && (
        <Banner
          visible
          icon="file-send"
          actions={[{ label: 'Send new proposal', onPress: openProposal }]}
          style={{ marginHorizontal: 8, marginBottom: 4 }}
        >
          This job was declined. You can resend a proposal with the same reference.
        </Banner>
      )}

      {/* Action row */}
      <View style={[chatStyles.contentWidth, { paddingHorizontal: screenGutter, paddingBottom: 4 }]}>
        {showStartTrader && (
          <Button mode="contained" onPress={() => confirmStartFor('trader')} style={{ marginBottom: 6 }}>
            Start job
          </Button>
        )}

        {showStartClient && (
          <Button mode="contained" onPress={() => confirmStartFor('client')} style={{ marginBottom: 6 }}>
            Start job
          </Button>
        )}

        {/* Trader: mark done → open rating modal */}
        {showTraderDone && (
          <Button mode="contained" onPress={markTraderDone} style={{ marginBottom: 6 }}>
            Mark job complete
          </Button>
        )}

        {/* Client: confirm completed after trader marks done → open rating modal */}
        {!job.scope_change_status && !isTrader && job.status === 'seller_done' && (
          <Button mode="contained" onPress={confirmCompleted} loading={completing} disabled={completing}>
            Confirm completed
          </Button>
        )}

        {showClientIncomplete && (
          <Button mode="contained-tonal" onPress={() => setIncompleteOpen(true)} style={{ marginTop: 6 }}>
            Job incomplete
          </Button>
        )}
      </View>

      </ScrollView>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={messageListRef}
          style={chatStyles.messageList}
          contentContainerStyle={[chatStyles.messageListContent, { paddingHorizontal: screenGutter }]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (initialScrollDone.current || messages.length === 0) return;
            initialScrollDone.current = true;
            requestAnimationFrame(() => {
              messageListRef.current?.scrollToEnd({ animated: false });
            });
          }}
        >
          {/* The query is capped at 50 rows. Keeping them mounted avoids the
              native virtualised-list churn that was crashing some Android chats. */}
          {messages.map(item => {
            const mine = item?.user?._id === me.id;
            const rawText = typeof item?.text === 'string' ? item.text : String(item?.text ?? '');
            const imageUrl = rawText.match(/https?:\/\/\S+\.(?:jpe?g|png|webp)(?:\?\S*)?/i)?.[0]
              || rawText.match(/https?:\/\/[^\s]+\/storage\/v1\/object\/public\/job-images\/[^\s]+/i)?.[0];
            const messageText = imageUrl ? rawText.replace(imageUrl, '').trim() : rawText;
            return (
              <View key={item._id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: 5 }}>
                <View
                  style={[chatStyles.messageBubble, mine ? chatStyles.mineBubble : chatStyles.theirBubble,
                    !mine && { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}
                >
                  {!!imageUrl && (
                    Platform.OS === 'web' ? (
                      <Pressable onPress={() => setExpandedImage(imageUrl)}>
                        <Image
                          source={{ uri: imageUrl }}
                          style={{
                            width: 220,
                            height: 150,
                            borderRadius: 17,
                            marginBottom: messageText ? 8 : 0,
                          }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open attached job photo"
                        onPress={() => setExpandedImage(imageUrl)}
                        style={[
                          chatStyles.nativePhotoAttachment,
                          {
                            borderColor: mine
                              ? 'rgba(255,255,255,0.34)'
                              : theme.colors.outline,
                            backgroundColor: mine
                              ? 'rgba(255,255,255,0.12)'
                              : theme.colors.surface,
                            marginBottom: messageText ? 8 : 0,
                          },
                        ]}
                      >
                        <Text
                          variant="labelLarge"
                          style={{
                            color: mine ? BRAND_COLORS.white : theme.colors.onSurface,
                          }}
                        >
                          Photo attachment
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={{
                            color: mine
                              ? 'rgba(255,255,255,0.74)'
                              : theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}
                        >
                          Tap to view
                        </Text>
                      </Pressable>
                    )
                  )}
                  {!!messageText && <Text style={{ color: mine ? BRAND_COLORS.white : theme.colors.onSurface }}>{messageText}</Text>}
                  <Text
                    variant="labelSmall"
                    style={{ color: mine ? 'rgba(255,255,255,0.78)' : theme.colors.onSurfaceVariant, marginTop: 5, alignSelf: 'flex-end' }}
                  >
                    {formatChatClock(item?.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={{ paddingBottom: Math.max(insets.bottom, 10), backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, borderTopWidth: 1 }}>
        <View style={[chatStyles.composer, chatStyles.contentWidth, { paddingHorizontal: screenGutter }]}>
          <IconButton
            icon="paperclip"
            accessibilityLabel="Attach job photo"
            iconColor={BRAND_COLORS.maroon}
            style={[chatStyles.attachButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}
            onPress={() => nav.navigate('JobImages', { jobId: job.id })}
          />
          <TextInput
            mode="flat"
            value={composerText}
            onChangeText={setComposerText}
            multiline
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            outlineColor="transparent"
            style={[chatStyles.composerInput, { backgroundColor: theme.colors.surfaceVariant }]}
            disabled={!canSend}
            placeholder={canSend ? `Message ${other?.name ?? 'trader/client'}...` :
              (job.status === 'disputed'
                ? 'Chat is paused while Yakka reviews the dispute'
                : job.status === 'completed'
                  ? (me?.id === job.client_id && !job.client_final_request_sent
                      ? 'Send one final request...'
                      : 'Chat closed for this job')
                  : 'Chat closed for this job')}
          />
          <IconButton
            mode="contained"
            icon="send"
            accessibilityLabel="Send message"
            containerColor={BRAND_COLORS.orange}
            iconColor={BRAND_COLORS.white}
            onPress={onSend}
            disabled={!canSend || !composerText.trim()}
          />
        </View>
        </View>
      </KeyboardAvoidingView>

      {/* Incomplete modal */}
      <>
        {!!expandedImage && (
          <BottomCurtain
            visible
            onDismiss={() => setExpandedImage(null)}
            title="Job image"
          >
            <Image
              source={{ uri: expandedImage }}
              style={{ width: '100%', height: 420, borderRadius: 18 }}
              resizeMode="contain"
              {...(Platform.OS === 'android' ? { resizeMethod: 'resize' as const } : {})}
            />
          </BottomCurtain>
        )}

        {incompleteOpen && (
          <BottomCurtain
            visible
            onDismiss={() => setIncompleteOpen(false)}
            title="Tell us what’s incomplete"
          >
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              Tell us what’s incomplete
            </Text>
            <TextInput
              mode="outlined"
              label="Reason"
              value={incompleteReason}
              onChangeText={setIncompleteReason}
              multiline
              style={{ marginBottom: 12 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Button onPress={() => setIncompleteOpen(false)} disabled={sendingIncomplete}>Cancel</Button>
              <Button mode="contained" onPress={submitIncomplete} loading={sendingIncomplete}>Submit</Button>
            </View>
          </BottomCurtain>
        )}

        {/* Proposal modal */}
        {proposalOpen && (
          <BottomCurtain
            visible
            onDismiss={() => setProposalOpen(false)}
            title="Send new proposal"
            subtitle="This keeps the same job reference."
            scrollable
          >
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              Send new proposal (same reference)
            </Text>
            <TextInput mode="outlined" label="Title" value={pTitle} onChangeText={setPTitle} style={{ marginBottom: 10 }} />
            <TextInput mode="outlined" label="Description" value={pDescription} onChangeText={setPDescription} style={{ marginBottom: 10 }} multiline />
            <TextInput mode="outlined" label="Price (GBP)" value={pPriceGBP} onChangeText={setPPriceGBP} keyboardType="decimal-pad" style={{ marginBottom: 16 }} placeholder="e.g. 120.00" />
            <View style={{ flexDirection:'row', justifyContent:'flex-end', gap: 8 }}>
              <Button onPress={() => setProposalOpen(false)} disabled={savingProposal}>Cancel</Button>
              <Button
                mode="contained"
                onPress={async () => {
                  const cents = parseGBPToCents(pPriceGBP);
                  if (Number.isNaN(cents) || cents <= 0) { Alert.alert('Invalid price', 'Enter a valid GBP amount.'); return; }
                  try {
                    setSavingProposal(true);
                    const { error: upErr } = await supabase
                      .from('jobs')
                      .update({ title: pTitle.trim(), description: pDescription.trim(), price_cents: cents, status: 'proposed' })
                      .eq('id', job!.id);
                    if (upErr) throw upErr;
                    setJob(prev => prev ? { ...prev, title: pTitle.trim(), description: pDescription.trim(), price_cents: cents, status: 'proposed' } : prev);
                    await supabase.from('messages').insert({ job_id: job!.id, sender_id: me!.id, body: `Sent a new proposal: £${(cents/100).toFixed(2)}.` });
                    setProposalOpen(false);
                    Alert.alert('Proposal sent', 'Status reset to proposed using the same reference.');
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Failed to send proposal.');
                  } finally {
                    setSavingProposal(false);
                  }
                }}
                loading={savingProposal}
              >
                Send
              </Button>
            </View>
          </BottomCurtain>
        )}
      </>

      {/* Rating modal → creates review, then updates status */}
    </View>
  );
}

const chatStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  contentWidth: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  timelineWrap: { marginTop: 6, marginBottom: 8 },
  jobSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 10, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: BRAND_COLORS.outline, backgroundColor: BRAND_COLORS.creamSoft, elevation: 3, shadowColor: BRAND_COLORS.maroon, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
  otherName: { color: BRAND_COLORS.maroon, },
  summaryJobTitle: { color: BRAND_COLORS.maroon, },
  summaryJobId: { color: BRAND_COLORS.textMuted, ...BRAND_TYPOGRAPHY.jobCode },
  summaryActions: { alignItems: 'flex-end', gap: 10 },
  summaryStatusDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: BRAND_COLORS.creamSoft },
  messageList: { flex: 1, backgroundColor: 'transparent' },
  messageListContent: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingVertical: 12 },
  messageBubble: { maxWidth: '84%', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11 },
  mineBubble: { backgroundColor: BRAND_GRADIENT[0], borderBottomRightRadius: 7 },
  theirBubble: { backgroundColor: BRAND_COLORS.stoneSoft, borderBottomLeftRadius: 7, borderWidth: 1, borderColor: BRAND_COLORS.outline },
  composer: { paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  attachButton: { borderWidth: 1, borderColor: BRAND_COLORS.outline, backgroundColor: BRAND_COLORS.cream },
  composerInput: { flex: 1, maxHeight: 110, borderRadius: 22, overflow: 'hidden', backgroundColor: BRAND_COLORS.cream },
  nativePhotoAttachment: {
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
