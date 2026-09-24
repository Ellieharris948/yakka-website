import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import Text from '../components/BrandText';
import MCIcon from '../components/BrandIcon';

import BrandScreenFrame from '../components/BrandScreenFrame';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS, BRAND_RADII, BRAND_STATUS_COLORS } from '../theme';

const steps = [
  ['Job sent', 'The job was created and shared.'],
  ['Breakdown added', 'The agreed task breakdown and price are stored.'],
  ['Payment sent', 'Funds are secured by Yakka.'],
  ['Job started', 'Both sides can confirm the job start.'],
  ['Images uploaded', 'Photos and notes are kept with the job.'],
  ['Job complete', 'Payment is released after completion is confirmed.'],
] as const;

const statusProgress: Record<string, number> = {
  proposed: 1,
  accepted: 2,
  funded: 3,
  in_progress: 4,
  seller_done: 5,
  client_done: 5,
  completed: 6,
};

export default function JobTimeline({ route }: any) {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const jobId = route?.params?.jobId as string;
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [photos, setPhotos] = useState(0);
  const [messages, setMessages] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      if (error) Alert.alert('Error', error.message);
      setJob(data);
      const { count: photoCount } = await supabase.from('job_photos').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
      const { count: messageCount } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
      setPhotos(photoCount || 0);
      setMessages(messageCount || 0);
      setLoading(false);
    })();
  }, [jobId]);

  const progress = useMemo(() => statusProgress[job?.status] || 1, [job?.status]);

  return (
    <BrandScreenFrame title="Job timeline" onBack={() => nav.goBack()} showBell={false}>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={BRAND_COLORS.maroon} /></View>
      ) : (
        <ResponsivePageScrollView contentContainerStyle={styles.content}>
          <View style={styles.heading}>
            <Text variant="titleMedium" style={[styles.jobTitle, { color: theme.colors.onSurfaceVariant }]}>{job?.title || 'Your job'}</Text>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryPill, { backgroundColor: theme.colors.surfaceVariant }]}><MCIcon name="message-outline" size={18} color={theme.colors.onSurface} /><Text variant="labelLarge">{messages} messages</Text></View>
              <View style={[styles.summaryPill, { backgroundColor: theme.colors.surfaceVariant }]}><MCIcon name="image-outline" size={18} color={theme.colors.onSurface} /><Text variant="labelLarge">{photos} images</Text></View>
            </View>
          </View>

          <View style={[styles.timelineCard, { backgroundColor: theme.colors.surface }]}>
            {steps.map(([title, detail], index) => {
              const complete = index < progress;
              const current = index === Math.min(progress, steps.length) - 1;
              return (
                <View key={title} style={styles.stepRow}>
                  <View style={styles.railColumn}>
                    <View style={[styles.stepCircle, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }, complete && styles.stepCircleComplete, current && styles.stepCircleCurrent]}>
                      {complete && !current
                        ? <MCIcon name="check" size={21} color={BRAND_COLORS.white} />
                        : <Text variant="labelLarge" style={{ color: complete ? BRAND_COLORS.white : BRAND_COLORS.maroon }}>{index + 1}</Text>}
                    </View>
                    {index < steps.length - 1 && <View style={[styles.rail, { backgroundColor: theme.colors.outlineVariant }, complete && { backgroundColor: theme.colors.primary }]} />}
                  </View>
                  <View style={[styles.stepCopy, current && styles.currentCard, current && { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text variant="titleLarge" style={[styles.stepTitle, { color: theme.colors.onSurface }]}>{title}</Text>
                    <Text variant="bodyLarge" style={[styles.stepDetail, { color: theme.colors.onSurfaceVariant }]}>{detail}</Text>
                    {current && <Text variant="labelLarge" style={[styles.currentLabel, { color: theme.colors.onSurface }]}>Current stage</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </ResponsivePageScrollView>
      )}
    </BrandScreenFrame>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 18, paddingBottom: 48 },
  heading: { gap: 7, marginBottom: 26 },
  jobTitle: { color: BRAND_COLORS.textMuted },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: BRAND_COLORS.stoneSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  timelineCard: { backgroundColor: BRAND_COLORS.creamSoft, borderRadius: BRAND_RADII.card, paddingHorizontal: 18, paddingVertical: 24 },
  stepRow: { flexDirection: 'row', gap: 15, minHeight: 116 },
  railColumn: { alignItems: 'center', width: 42 },
  stepCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_COLORS.stoneSoft, borderWidth: 2, borderColor: BRAND_COLORS.outline },
  stepCircleComplete: { backgroundColor: BRAND_STATUS_COLORS.success, borderColor: BRAND_STATUS_COLORS.success },
  stepCircleCurrent: { shadowColor: BRAND_COLORS.maroon, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4 },
  rail: { width: 3, flex: 1, minHeight: 62, backgroundColor: BRAND_COLORS.outline, marginVertical: 7, borderRadius: 2 },
  railComplete: { backgroundColor: BRAND_STATUS_COLORS.successSoft },
  stepCopy: { flex: 1, gap: 6, paddingTop: 7, paddingBottom: 24, paddingRight: 4 },
  currentCard: { backgroundColor: BRAND_COLORS.stoneSoft, marginTop: -5, marginBottom: 14, marginLeft: -7, padding: 12, borderRadius: 18 },
  stepTitle: { color: BRAND_COLORS.maroon },
  stepDetail: { color: BRAND_COLORS.textMuted, lineHeight: 24 },
  currentLabel: { color: BRAND_COLORS.maroon, marginTop: 3 },
});
