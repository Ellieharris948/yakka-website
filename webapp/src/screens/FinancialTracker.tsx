import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, IconButton, Text, useTheme } from '../ui/paper';
import MCIcon from '../components/BrandIcon';
import Svg, { Circle } from 'react-native-svg';

import BrandScreenFrame from '../components/BrandScreenFrame';
import FlowCurtain from '../components/FlowCurtain';
import SwipeSegmentedControl from '../components/SwipeSegmentedControl';
import PageBackHeader from '../components/PageBackHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { BRAND_COLORS, BRAND_RADII } from '../theme';

type TrackerTab = 'dashboard' | 'monthly' | 'past';
type DemoStatus = 'paid' | 'protected' | 'awaiting' | 'adjustment';

type DemoJob = {
  id: string;
  title: string;
  customer: string;
  amount: number;
  date: string;
  month: string;
  status: DemoStatus;
  heldDays?: number;
  adjustment?: number;
  tasks: Array<{ label: string; amount: number }>;
};

const TRACKER_TABS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'past', label: 'Past jobs' },
] as const;

const DEMO_MONTHS = [
  { key: 'Mar', label: 'March', amount: 124000, count: 3, trend: 5 },
  { key: 'Apr', label: 'April', amount: 186000, count: 4, trend: 12 },
  { key: 'May', label: 'May', amount: 112500, count: 3, trend: -8 },
  { key: 'Jun', label: 'June', amount: 75500, count: 2, trend: -61 },
  { key: 'Jul', label: 'July', amount: 243800, count: 5, trend: 8 },
  { key: 'Aug', label: 'August', amount: 302400, count: 6, trend: 24 },
  { key: 'Sep', label: 'September', amount: 50000, count: 1, trend: -83 },
];

const DEMO_JOBS: DemoJob[] = [
  {
    id: 'demo-46583', title: 'Living room refurbishment', customer: 'Suzie Smith', amount: 67925,
    date: '12 Aug', month: 'August', status: 'paid',
    tasks: [
      { label: 'Paint walls', amount: 50000 },
      { label: 'Paint ceiling', amount: 10000 },
      { label: 'Fit shelves', amount: 11500 },
    ],
  },
  {
    id: 'demo-29104', title: 'Bathroom re-tiling', customer: 'Harry Winston', amount: 41200,
    date: '28 Jul', month: 'July', status: 'paid',
    tasks: [{ label: 'Preparation and tiling', amount: 43368 }],
  },
  {
    id: 'demo-adjustment', title: 'Kitchen shelving adjustment', customer: 'Maya Jones', amount: 13500,
    date: '9 Aug', month: 'August', status: 'adjustment', adjustment: -13500,
    tasks: [{ label: 'Customer adjustment', amount: -13500 }],
  },
  {
    id: 'demo-held-1', title: 'Garden fence repair', customer: 'Eva Coley', amount: 21050,
    date: '14 Jul', month: 'July', status: 'protected', heldDays: 6,
    tasks: [{ label: 'Fence panels and labour', amount: 21050 }],
  },
  {
    id: 'demo-held-2', title: 'Decking installation', customer: 'Marcus Lee', amount: 58950,
    date: '18 Jul', month: 'July', status: 'protected', heldDays: 2,
    tasks: [{ label: 'Decking installation', amount: 58950 }],
  },
  {
    id: 'demo-awaiting', title: 'Kitchen repaint', customer: 'Alex Morgan', amount: 50000,
    date: 'Link sent today', month: 'September', status: 'awaiting',
    tasks: [{ label: 'Kitchen repaint', amount: 50000 }],
  },
];

const DEMO_TOTALS = {
  paid: 302400,
  protected: 80000,
  awaiting: 50000,
  secured: 382400,
};

const RING_SIZE = 190;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 68;
const RING_STROKE_WIDTH = 20;

function formatGBP(cents: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(cents / 100);
}

function statusLabel(status: DemoStatus) {
  if (status === 'paid') return 'Paid';
  if (status === 'protected') return 'Protected';
  if (status === 'awaiting') return 'Awaiting payment';
  return 'Adjustment';
}

export default function FinancialTracker() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<TrackerTab>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<DemoStatus | null>(null);
  const [selectedJob, setSelectedJob] = useState<DemoJob | null>(null);

  const circumference = 2 * Math.PI * RING_RADIUS;
  const paidRatio = DEMO_TOTALS.paid / DEMO_TOTALS.secured;
  const protectedRatio = DEMO_TOTALS.protected / DEMO_TOTALS.secured;
  const maxMonth = Math.max(...DEMO_MONTHS.map(month => month.amount));

  const shownJobs = useMemo(() => {
    const base = DEMO_JOBS.filter(job => ['paid', 'adjustment'].includes(job.status));
    return selectedMonth ? base.filter(job => job.month === selectedMonth) : base;
  }, [selectedMonth]);

  const drilldownJobs = useMemo(
    () => drilldown ? DEMO_JOBS.filter(job => job.status === drilldown) : [],
    [drilldown],
  );

  const openMonth = (month: string) => {
    setSelectedMonth(month);
    setActiveTab('past');
  };

  const shareInvoice = async (job: DemoJob) => {
    await Share.share({
      title: `Demo invoice - ${job.title}`,
      message: `Yakka demo invoice\n${job.title}\n${job.customer}\n${formatGBP(job.amount)}\n\nPreview only - no live financial data.`,
    });
  };

  const dashboard = (
    <View style={styles.tabContent}>
      <Card mode="contained" style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content style={{ gap: 18 }}>
          <View style={styles.ring}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
              <Circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_RADIUS}
                fill="none"
                stroke={theme.colors.outlineVariant}
                strokeWidth={RING_STROKE_WIDTH}
              />
              <Circle
                cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" stroke={BRAND_COLORS.maroonStrong} strokeWidth={RING_STROKE_WIDTH}
                strokeDasharray={`${circumference * paidRatio} ${circumference}`}
                transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
              />
              <Circle
                cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" stroke={BRAND_COLORS.maroon} strokeWidth={RING_STROKE_WIDTH}
                strokeDasharray={`${circumference * protectedRatio} ${circumference}`}
                strokeDashoffset={-circumference * paidRatio}
                transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
              />
            </Svg>
            <View
              pointerEvents="none"
              style={[
                styles.ringCopy,
                { backgroundColor: theme.dark ? theme.colors.surfaceVariant : BRAND_COLORS.white },
              ]}
            >
              <Text
                variant="headlineSmall"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.9}
                style={[styles.ringAmount, { color: theme.colors.onSurface }]}
              >
                {formatGBP(DEMO_TOTALS.secured)}
              </Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Secured</Text>
            </View>
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            Secured = Paid to you + Protected
          </Text>
        </Card.Content>
      </Card>

      {[
        { key: 'paid' as const, label: 'Paid to you', detail: 'Already released to you', value: DEMO_TOTALS.paid, color: BRAND_COLORS.maroonStrong },
        { key: 'protected' as const, label: 'Protected', detail: 'Customer paid, job in progress', value: DEMO_TOTALS.protected, color: BRAND_COLORS.maroon },
        { key: 'awaiting' as const, label: 'Awaiting payment', detail: 'Job link sent, customer has not paid', value: DEMO_TOTALS.awaiting, color: theme.colors.outline },
      ].map(item => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          onPress={() => setDrilldown(item.key)}
          style={({ pressed }) => [styles.moneyRow, { backgroundColor: theme.colors.surface }, pressed && styles.pressed]}
        >
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{item.label}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.detail}</Text>
          </View>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{formatGBP(item.value)}</Text>
          <MCIcon name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ))}

      <Card mode="contained" style={[styles.digestCard, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Card.Content style={{ gap: 5 }}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>Your month digest</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Demo preview: paid {formatGBP(DEMO_TOTALS.paid)}, protected {formatGBP(DEMO_TOTALS.protected)}, awaiting {formatGBP(DEMO_TOTALS.awaiting)}.
          </Text>
          <Text variant="labelMedium" style={{ color: BRAND_COLORS.maroon }}>Preview only - no push or email is sent.</Text>
        </Card.Content>
      </Card>
    </View>
  );

  const monthly = (
    <View style={styles.tabContent}>
      <Card mode="contained" style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barChart}>
            {DEMO_MONTHS.map(month => (
              <Pressable key={month.key} onPress={() => openMonth(month.label)} style={styles.barColumn}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatGBP(month.amount)}</Text>
                <View style={[styles.bar, { height: 36 + (month.amount / maxMonth) * 128, backgroundColor: theme.dark ? theme.colors.onSurfaceVariant : '#6a292e' }]} />
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>{month.key}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Card.Content>
      </Card>

      {DEMO_MONTHS.slice().reverse().map(month => (
        <Pressable
          key={month.key}
          accessibilityRole="button"
          onPress={() => openMonth(month.label)}
          style={({ pressed }) => [styles.monthRow, { backgroundColor: theme.colors.surface }, pressed && styles.pressed]}
        >
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{month.label}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{month.count} demo jobs completed</Text>
          </View>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{formatGBP(month.amount)}</Text>
          <View style={[styles.trendBadge, { backgroundColor: month.trend >= 0 ? '#d9eee2' : '#f9dedc' }]}>
            <Text variant="labelSmall" style={{ color: month.trend >= 0 ? '#31533d' : '#7a2525' }}>
              {month.trend >= 0 ? '↑' : '↓'} {Math.abs(month.trend)}%
            </Text>
          </View>
          <MCIcon name="chevron-right" size={21} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ))}
    </View>
  );

  const pastJobs = (
    <View style={styles.tabContent}>
      {!!selectedMonth && (
        <View style={styles.filterHeading}>
          <View style={{ flex: 1 }}>
            <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>{selectedMonth}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Demo jobs for this month</Text>
          </View>
          <Button mode="text" onPress={() => setSelectedMonth(null)}>Show all</Button>
        </View>
      )}
      {shownJobs.map(job => (
        <Card key={job.id} mode="contained" style={[styles.jobCard, { backgroundColor: theme.colors.surface }, job.status === 'adjustment' && styles.adjustmentCard]}>
          <Card.Content style={{ gap: 12 }}>
            <Pressable onPress={() => setSelectedJob(job)} style={({ pressed }) => pressed && styles.pressed}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{job.title}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{job.customer}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                    {job.adjustment ? `-${formatGBP(Math.abs(job.adjustment))}` : formatGBP(job.amount)}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{job.date}</Text>
                </View>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button mode="contained-tonal" style={{ flex: 1 }} onPress={() => setSelectedJob(job)}>View job</Button>
              {job.status === 'paid' && (
                <Button mode="outlined" icon="download" style={{ flex: 1 }} onPress={() => void shareInvoice(job)}>Invoice</Button>
              )}
            </View>
          </Card.Content>
        </Card>
      ))}
    </View>
  );

  return (
    <BrandScreenFrame title="Financial tracker" onBack={() => nav.goBack()}>
      <ResponsivePageScrollView contentContainerStyle={styles.page}>
        <View style={styles.heading}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Your earnings</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Demo financial tracker</Text>
          </View>
          <View style={[styles.demoBadge, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Demo data</Text>
          </View>
        </View>

        <SwipeSegmentedControl
          value={activeTab}
          options={TRACKER_TABS}
          onChange={value => {
            setActiveTab(value);
            if (value !== 'past') setSelectedMonth(null);
          }}
          accessibilityLabel="Financial tracker view"
        />

        {activeTab === 'dashboard' ? dashboard : activeTab === 'monthly' ? monthly : pastJobs}
      </ResponsivePageScrollView>

      <FlowCurtain
        visible={!!drilldown || !!selectedJob}
        onDismiss={() => { setDrilldown(null); setSelectedJob(null); }}
        accessibilityLabel={selectedJob ? 'Job breakdown' : 'Financial category jobs'}
      >
        {close => (
          <ScrollView contentContainerStyle={styles.sheetPage} showsVerticalScrollIndicator={false}>
            <View style={{ marginHorizontal: -18 }}>
              <PageBackHeader
                onBack={() => {
                  if (selectedJob && drilldown) setSelectedJob(null);
                  else close();
                }}
              />
            </View>
            <View style={styles.sheetHeader}>
              <Text variant="titleLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
                {selectedJob ? 'Job detail' : `${drilldown ? statusLabel(drilldown) : 'Jobs'} · ${drilldownJobs.reduce((sum, job) => sum + job.amount, 0) ? formatGBP(drilldownJobs.reduce((sum, job) => sum + job.amount, 0)) : ''}`}
              </Text>
            </View>

            {selectedJob ? (
              <View style={{ gap: 18 }}>
                <View style={[styles.heroCard, { backgroundColor: theme.dark ? theme.colors.surfaceVariant : '#581a1f' }]}>
                  <Text variant="titleLarge" style={{ color: BRAND_COLORS.white }}>{selectedJob.title}</Text>
                  <Text variant="bodyMedium" style={{ color: 'rgba(255,255,255,0.78)' }}>{selectedJob.customer} · {selectedJob.id.replace('demo-', '').toUpperCase()}</Text>
                  <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.68)' }}>{selectedJob.date} · Demo preview</Text>
                </View>

                <View style={{ gap: 10 }}>
                  <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>Status</Text>
                  {['Payment received', 'Work completed', selectedJob.status === 'paid' ? 'Released to you' : statusLabel(selectedJob.status)].map((label, index) => (
                    <View key={label} style={styles.timelineRow}>
                      <MCIcon name="check-circle" size={23} color={index === 2 && selectedJob.status !== 'paid' ? BRAND_COLORS.maroon : '#4f9a69'} />
                      <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ gap: 10 }}>
                  <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>Job breakdown</Text>
                  {selectedJob.tasks.map(task => (
                    <View key={task.label} style={[styles.breakdownRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>{task.label}</Text>
                      <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{formatGBP(task.amount)}</Text>
                    </View>
                  ))}
                  <View style={styles.breakdownRow}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>Job total</Text>
                    <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{formatGBP(selectedJob.amount)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>Yakka fee (5%)</Text>
                    <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>-{formatGBP(Math.round(selectedJob.amount * 0.05))}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>Net to you</Text>
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{formatGBP(Math.round(selectedJob.amount * 0.95))}</Text>
                  </View>
                </View>

                {selectedJob.status === 'adjustment' && (
                  <View style={[styles.adjustmentNote, { borderColor: BRAND_COLORS.maroon }]}>
                    <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>Adjustment shown inline</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Demo customer adjustment after resolution.</Text>
                  </View>
                )}

                <Button mode="contained" icon="download" onPress={() => void shareInvoice(selectedJob)}>Download demo invoice</Button>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {drilldown === 'protected'
                    ? 'Demo jobs currently held safely while work is completed.'
                    : drilldown === 'awaiting'
                      ? 'Demo job links that are still waiting for customer payment.'
                      : 'Demo jobs already released to you.'}
                </Text>
                {drilldownJobs.map(job => (
                  <Pressable key={job.id} onPress={() => setSelectedJob(job)} style={[styles.sheetJob, { backgroundColor: theme.colors.surface }]}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{job.title}</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {job.customer}{job.heldDays ? ` · Held ${job.heldDays} days` : ''}
                      </Text>
                    </View>
                    <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{formatGBP(job.amount)}</Text>
                    <MCIcon name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
                  </Pressable>
                ))}
                {drilldown === 'awaiting' && (
                  <Button
                    mode="contained"
                    icon="send"
                    onPress={() => Alert.alert('Demo preview', 'No payment link was sent.')}
                  >
                    Resend demo payment link
                  </Button>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </FlowCurtain>
    </BrandScreenFrame>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 50, gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  demoBadge: { borderRadius: BRAND_RADII.control, paddingHorizontal: 11, paddingVertical: 7 },
  tabContent: { gap: 12 },
  chartCard: { borderRadius: BRAND_RADII.panel },
  ring: { width: RING_SIZE, height: RING_SIZE, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ringCopy: {
    position: 'absolute',
    width: 100,
    minHeight: 76,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  ringAmount: { width: '100%', textAlign: 'center' },
  moneyRow: { minHeight: 76, borderRadius: BRAND_RADII.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  legendDot: { width: 15, height: 15, borderRadius: 5 },
  pressed: { opacity: 0.72 },
  digestCard: { borderRadius: BRAND_RADII.card, marginTop: 4 },
  barChart: { alignItems: 'flex-end', gap: 13, paddingHorizontal: 2, paddingTop: 20 },
  barColumn: { width: 54, alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
  bar: { width: 42, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: BRAND_COLORS.maroonStrong },
  monthRow: { minHeight: 76, borderRadius: BRAND_RADII.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  trendBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 },
  filterHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobCard: { borderRadius: BRAND_RADII.card },
  adjustmentCard: { borderWidth: 1, borderStyle: 'dashed', borderColor: BRAND_COLORS.maroon },
  sheetPage: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 48 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  heroCard: { borderRadius: BRAND_RADII.card, backgroundColor: BRAND_COLORS.maroon, padding: 18, gap: 5 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  adjustmentNote: { borderWidth: 1, borderStyle: 'dashed', borderRadius: BRAND_RADII.card, padding: 14, gap: 4 },
  sheetJob: { minHeight: 72, borderRadius: BRAND_RADII.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
