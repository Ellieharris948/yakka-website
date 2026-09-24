import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Chip, Divider, SegmentedButtons, Text } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { formatGBPCents } from '../utils/money';
import { BRAND_COLORS, BRAND_TYPOGRAPHY } from '../theme';
import BrandScreenHeader from '../components/BrandScreenHeader';
import { isPastJobForViewer } from '../utils/jobVisibility';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import ScreenState from '../components/ScreenState';
import SwipeSegmentedControl from '../components/SwipeSegmentedControl';

function formatJobDate(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function JobsBoard({ route }: any) {
  const nav = useNavigation<any>();
  const initial = route?.params?.initialFilter as 'live' | 'past' | undefined;
  const profileMode = route?.params?.profileMode as 'client_past' | 'trader_past' | undefined;
  const [filter, setFilter] = useState<'live' | 'past'>(initial || 'live');
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [traderNames, setTraderNames] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .or(`trader_id.eq.${user.id},client_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (error) Alert.alert('Error', error.message);
      setJobs(data || []);

      const traderIds = Array.from(new Set((data || []).map(job => job.trader_id).filter(Boolean)));
      if (traderIds.length) {
        const { data: traders } = await supabase
          .from('profiles')
          .select('id,name')
          .in('id', traderIds);

        setTraderNames(
          Object.fromEntries((traders || []).map((profile: any) => [String(profile.id), String(profile.name || 'Tradie')])),
        );
      }

      setLoading(false);
    })();
  }, []);

  const shown = useMemo(() => jobs.filter(job => {
    if (profileMode === 'client_past' || profileMode === 'trader_past') {
      return profileMode === 'client_past'
        ? isPastJobForViewer(job, 'client')
        : job.status === 'completed';
    }

    const viewerRole = job.trader_id === userId ? 'trader' : 'client';
    const past = isPastJobForViewer(job, viewerRole);
    return filter === 'past' ? past : !past;
  }), [filter, jobs, profileMode, userId]);
  const totalEarned = useMemo(
    () => shown.reduce((sum, job) => sum + Number(job.price_cents || 0), 0),
    [shown],
  );

  if (loading) return <ScreenState loading title="Loading jobs" />;

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader
          title={profileMode ? 'Past jobs' : filter === 'live' ? 'Live jobs' : 'Past jobs'}
          onBack={() => nav.goBack()}
          chipLabel={profileMode ? 'completed' : filter}
        />

        {!profileMode && (
          <SwipeSegmentedControl
            value={filter}
            onChange={setFilter}
            options={[{ value: 'live', label: 'Live jobs' }, { value: 'past', label: 'Past jobs' }]}
            accessibilityLabel="Choose job history view"
          />
        )}

        <View style={{ height: 12 }} />

        {profileMode === 'trader_past' && (
          <Text variant="headlineSmall" style={{ color: BRAND_COLORS.maroon, marginBottom: 14 }}>
            Total earned: {formatGBPCents(totalEarned)}
          </Text>
        )}

        {!shown.length && (
          <Card mode="contained" style={{ borderRadius: 24 }}>
            <Card.Content style={{ gap: 8, alignItems: 'center' }}>
              <Text variant="titleSmall" style={{ }}>
                {profileMode
                  ? 'No completed jobs yet'
                  : filter === 'live'
                    ? 'No active jobs'
                    : 'No past jobs'}
              </Text>
              <Text variant="bodySmall" style={{ opacity: 0.72 }}>
                {profileMode === 'client_past'
                  ? 'Completed jobs with your tradie will appear here.'
                  : profileMode === 'trader_past'
                    ? 'Your completed jobs and earnings will appear here.'
                    : 'Time to get grinding.'}
              </Text>
            </Card.Content>
          </Card>
        )}

        {shown.map(job => (
          <Card
            key={job.id}
            mode="contained"
            style={{
              borderRadius: 24,
              marginBottom: 16,
              backgroundColor: profileMode ? BRAND_COLORS.creamSoft : undefined,
            }}
          >
            <Card.Content style={{ gap: 10, paddingVertical: profileMode ? 18 : undefined }}>
              {profileMode === 'client_past' ? (
                <>
                  <View style={{ gap: 4 }}>
                    <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon }}>
                      {job.title}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: BRAND_COLORS.textMuted }}>
                      Tradie: {traderNames[String(job.trader_id)] || 'Tradie'}
                    </Text>
                  </View>

                  <Divider />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <View style={{ gap: 4 }}>
                      <Text variant="bodySmall" style={{ color: BRAND_COLORS.textMuted }}>
                        {formatJobDate(job.end_date) ? `Completed ${formatJobDate(job.end_date)}` : 'Completed job'}
                      </Text>
                      <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>
                        {formatGBPCents(Number(job.price_cents || 0))}
                      </Text>
                    </View>
                    <Chip compact style={{ backgroundColor: BRAND_COLORS.stoneSoft }}>
                      Completed
                    </Chip>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Button
                      mode="contained"
                      icon="download"
                      onPress={() => nav.navigate('ReceiptSummary', { jobId: job.id })}
                      style={{ flex: 1, minWidth: 150, borderRadius: 18 }}
                    >
                      Download invoice
                    </Button>
                    <Button
                      mode="contained-tonal"
                      onPress={() => nav.navigate('JobDetails', { jobId: job.id })}
                      style={{ flex: 1, minWidth: 120, borderRadius: 18 }}
                    >
                      View job
                    </Button>
                  </View>
                </>
              ) : profileMode === 'trader_past' ? (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, ...BRAND_TYPOGRAPHY.jobCode }}>
                      <Text style={{ }}>Job ID: </Text>{job.ref_code || String(job.id).slice(0, 8)}
                    </Text>
                    <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, }}>
                      Amount: {formatGBPCents(Number(job.price_cents || 0))}
                    </Text>
                  </View>
                  <Text variant="bodyLarge" style={{ color: BRAND_COLORS.textMuted }}>{job.title || 'Completed job'}</Text>
                  <Text variant="bodyMedium" style={{ color: BRAND_COLORS.textMuted }}>
                    {formatJobDate(job.end_date) ? `End date: ${formatJobDate(job.end_date)}` : 'Completed'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button mode="contained" buttonColor={BRAND_COLORS.orange} onPress={() => nav.navigate('ReceiptSummary', { jobId: job.id })} style={{ flex: 1, borderRadius: 18 }}>
                      Download invoice
                    </Button>
                    <Button mode="contained-tonal" onPress={() => nav.navigate('JobDetails', { jobId: job.id })} style={{ flex: 1, borderRadius: 18 }}>
                      View job
                    </Button>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleSmall" style={{ }}>{job.title}</Text>
                      <Text variant="bodyMedium" style={{ opacity: 0.7, ...BRAND_TYPOGRAPHY.jobCode }}>Job ID: {job.ref_code || job.id}</Text>
                    </View>
                    <Chip compact>{job.status}</Chip>
                  </View>
                  <Text variant="bodySmall" style={{ opacity: 0.75 }}>{formatGBPCents(Number(job.price_cents || 0))}</Text>
                  <Button mode="contained" onPress={() => nav.navigate('JobDetails', { jobId: job.id })} style={{ borderRadius: 18 }}>
                    View job
                  </Button>
                </>
              )}
            </Card.Content>
          </Card>
        ))}
      </ResponsivePageScrollView>
    </View>
  );
}

