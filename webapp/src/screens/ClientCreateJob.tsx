import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput as RNTextInput, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Checkbox, IconButton, Text, useTheme } from '../ui/paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';

import ShareJobSheet from '../components/ShareJobSheet';
import DateField from '../components/DateField';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS, BRAND_CONTENT_GAPS } from '../theme';
import BrandHeaderBar from '../components/BrandHeaderBar';
import PageBackHeader from '../components/PageBackHeader';
import { buildCustomerJobShare } from '../utils/jobShare';
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

type ClientCreateJobProps = {
  embedded?: boolean;
  initialProfile?: any;
  onDismiss?: () => void;
  onComplete?: () => void;
};


function SlideShell({
  title,
  onBack,
  children,
  embedded = false,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingBottom: 40 }}>
        {embedded ? (
          <PageBackHeader onBack={onBack} title={title} />
        ) : (
          <>
            <BrandHeaderBar
              topInset={insets.top}
              horizontalPadding={screenGutter}
              verticalPadding={14}
              curvedBottom
            />
            <PageBackHeader onBack={onBack} title={title} />
          </>
        )}

        <View style={{ paddingHorizontal: screenGutter, paddingTop: BRAND_CONTENT_GAPS.section, paddingBottom: BRAND_CONTENT_GAPS.section }}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

function SlideLineInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'number-pad';
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: BRAND_CONTENT_GAPS.related }}>
      <Text variant="titleSmall" style={{ color: BRAND_COLORS.textMuted, }}>
        {label}
      </Text>
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={BRAND_COLORS.textMuted}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={{
          borderBottomWidth: 2,
          borderBottomColor: BRAND_COLORS.stone,
          color: BRAND_COLORS.maroon,
          paddingTop: 4,
          paddingBottom: 8,
          minHeight: multiline ? 78 : 36,
          textAlignVertical: multiline ? 'top' : 'center',
          fontSize: theme.fonts.bodyMedium.fontSize,
          lineHeight: theme.fonts.bodyMedium.lineHeight,
          fontFamily: 'Satoshi-Regular',
          fontStyle: value.trim() ? 'normal' : 'italic',
        }}
      />
    </View>
  );
}

function SlideDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Date;
  onChange: (date?: Date) => void;
}) {
  return <DateField label={label} value={value} onChange={onChange} />;
}

export default function ClientCreateJob({
  embedded = false,
  initialProfile = null,
  onDismiss,
  onComplete,
}: ClientCreateJobProps = {}) {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const goHome = useCallback(() => {
    if (embedded) onComplete?.();
    else nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }, [embedded, nav, onComplete]);

  const [loading, setLoading] = useState(!initialProfile);
  const [me, setMe] = useState<any>(initialProfile);

  const [title, setTitle] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [postcode, setPostcode] = useState('');
  const [startPref, setStartPref] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [disputeTermsAccepted, setDisputeTermsAccepted] = useState(false);

  const [createdJob, setCreatedJob] = useState<Job | null>(null);
  const [creating, setCreating] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

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

      const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) {
        Alert.alert('Error', error.message);
        setLoading(false);
        return;
      }

      if (prof?.role !== 'client') {
        Alert.alert('Not allowed', 'Only clients can create job requests.');
        if (embedded) onDismiss?.();
        else nav.goBack();
        return;
      }

      setMe(prof);
      setLoading(false);
    })();
  }, [embedded, initialProfile, nav, onDismiss]);

  const normalizedPostcode = useMemo(() => postcode.trim().toUpperCase(), [postcode]);
  const canCreate = useMemo(() => {
    return title.trim().length >= 3 && addressLine1.trim().length >= 3 && normalizedPostcode.length >= 3 && !!startPref && disputeTermsAccepted;
  }, [addressLine1, disputeTermsAccepted, normalizedPostcode, startPref, title]);

  const createdJobShare = useMemo(
    () => (createdJob?.ref_code ? buildCustomerJobShare(createdJob.ref_code) : null),
    [createdJob?.ref_code],
  );

  const buildDescription = useCallback((preferredIso: string) => {
    return [
      normalizedPostcode ? `Location: ${normalizedPostcode}` : '',
      addressLine1.trim() ? `Address line 1: ${addressLine1.trim()}` : '',
      addressLine2.trim() ? `Address line 2: ${addressLine2.trim()}` : '',
      normalizedPostcode ? `Post code: ${normalizedPostcode}` : '',
      preferredIso ? `Proposed start date: ${format(startPref || new Date(preferredIso), 'dd/MM/yyyy')}` : '',
      notes.trim() ? `General notes: ${notes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [addressLine1, addressLine2, normalizedPostcode, notes, startPref]);

  const onCreate = useCallback(async () => {
    if (!me?.id || !startPref) return;

    if (!canCreate) {
      Alert.alert('Missing', 'Please add a job title, address line 1, postcode, and proposed start date.');
      return;
    }

    try {
      setCreating(true);

      const preferredIso = format(startPref, 'yyyy-MM-dd');
      const payload: Record<string, any> = {
        // A customer-created request remains unclaimed until a tradie opens
        // the share link. The customer must never become their own tradie.
        trader_id: null,
        client_id: me.id,
        title: title.trim(),
        description: buildDescription(preferredIso) || null,
        price_cents: 0,
        currency: 'GBP',
        duration_days: 1,
        planned_start_date: preferredIso,
        flex_days: 0,
        country_code: 'GB',
        status: 'proposed',
      };

      const rpcResult = await supabase.rpc('rpc_create_client_job_request', {
        p_title: payload.title,
        p_description: payload.description,
        p_planned_start_date: preferredIso,
      });

      let data = rpcResult.data;
      if (rpcResult.error) {
        // Keep development builds usable until the release migration lands.
        // Existing RLS still verifies that client_id belongs to auth.uid().
        const direct = await supabase.from('jobs').insert(payload).select().single();
        if (direct.error) throw direct.error;
        data = direct.data;
      }

      if (data?.id) {
        const { error: consentError } = await supabase.from('jobs').update({
          client_dispute_terms_accepted_at: new Date().toISOString(),
        }).eq('id', data.id);
        if (consentError) throw consentError;
      }

      setCreatedJob(data as Job);
      setShareSheetVisible(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create job request.');
    } finally {
      setCreating(false);
    }
  }, [buildDescription, canCreate, me?.id, startPref, title]);

  if (createdJob) {
    return (
      <SlideShell title="New job" onBack={goHome} embedded={embedded}>
        <View style={{ gap: BRAND_CONTENT_GAPS.section, paddingHorizontal: 10, paddingVertical: 24 }}>
          <Text
            variant="headlineSmall"
            style={{ color: BRAND_COLORS.maroon, textAlign: 'center' }}
          >
            Job created
          </Text>

          <View style={{ gap: BRAND_CONTENT_GAPS.related }}>
            <Text variant="bodyLarge" style={{ color: BRAND_COLORS.maroon, lineHeight: 26, textAlign: 'center' }}>
              Once the tradie opens your job request, they&apos;ll add the full job breakdown for you to review and approve.
            </Text>

            <Text variant="bodyLarge" style={{ color: BRAND_COLORS.maroon, lineHeight: 26, textAlign: 'center' }}>
              You&apos;ll be notified when it&apos;s ready.
            </Text>

            <Text variant="bodyLarge" style={{ color: BRAND_COLORS.maroon, lineHeight: 26, textAlign: 'center' }}>
              Once you approve and the payment is secured with Yakka, the job can begin.
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={() => setShareSheetVisible(true)}
            buttonColor={BRAND_COLORS.orange}
            textColor={BRAND_COLORS.white}
            style={{ borderRadius: 18 }}
            labelStyle={{ }}
            disabled={!createdJobShare}
          >
            Share job
          </Button>

        </View>

        {createdJobShare && (
          <ShareJobSheet
            visible={shareSheetVisible}
            onDismiss={() => setShareSheetVisible(false)}
            shareLink={createdJobShare.link}
            shareMessage={createdJobShare.message}
            shareSubject={createdJobShare.subject}
            subtitle="Choose how you want to send the secure Yakka job link to your tradie."
          />
        )}
      </SlideShell>
    );
  }

  return (
    <SlideShell title="New job" onBack={() => embedded ? onDismiss?.() : nav.goBack()} embedded={embedded}>
      <View style={{ gap: BRAND_CONTENT_GAPS.section }}>
        <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, }}>
          Hi {me?.name || 'there'}
        </Text>

        <SlideLineInput
          label="Job title"
          value={title}
          onChangeText={setTitle}
          placeholder='"Living room refurbishment"'
          autoCapitalize="words"
        />

        <View style={{ gap: BRAND_CONTENT_GAPS.related }}>
          <Text variant="titleSmall" style={{ color: BRAND_COLORS.textMuted, }}>
            Job location
          </Text>

          <SlideLineInput
            label="Address line 1"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="Address line 1"
            autoCapitalize="words"
          />

          <SlideLineInput
            label="Address line 2"
            value={addressLine2}
            onChangeText={setAddressLine2}
            placeholder="Address line 2"
            autoCapitalize="words"
          />

          <SlideLineInput
            label="Post code"
            value={postcode}
            onChangeText={text => setPostcode(text.toUpperCase())}
            placeholder="Post code"
            autoCapitalize="characters"
          />
        </View>

        <SlideDateInput label="Proposed start date" value={startPref} onChange={setStartPref} />

        <View style={{ gap: BRAND_CONTENT_GAPS.related }}>
          <Text variant="titleSmall" style={{ color: BRAND_COLORS.textMuted, }}>
            General notes
          </Text>
          <Text variant="bodySmall" style={{ color: BRAND_COLORS.textMuted, fontStyle: 'italic', lineHeight: 19 }}>
            Add top line information about the project. It will be broken down later.
          </Text>
          <SlideLineInput
            label=""
            value={notes}
            onChangeText={setNotes}
            placeholder='"Redecorate room, including painting walls, ceiling, shelving unit"'
            multiline
          />
        </View>

        <View style={{ paddingTop: 6, gap: BRAND_CONTENT_GAPS.related }}>
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.colors.outlineVariant, padding: 10, gap: 6 }}>
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
            <Button mode="text" onPress={() => nav.navigate('StaticInfo', { kind: 'terms' })}>Read terms and conditions</Button>
          </View>
          <Button
            mode="contained"
            onPress={onCreate}
            loading={creating}
            disabled={creating || loading || !canCreate}
            buttonColor={BRAND_COLORS.orange}
            textColor={BRAND_COLORS.white}
            style={{ borderRadius: 18 }}
            labelStyle={{ }}
          >
            Share job
          </Button>

          <Text variant="bodySmall" style={{ color: BRAND_COLORS.maroon, textAlign: 'center', lineHeight: 19 }}>
            Share job link with tradie to add the job details and pricing.
          </Text>
        </View>
      </View>
    </SlideShell>
  );
}
