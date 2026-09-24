import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MCIcon from '../components/BrandIcon';
import { ActivityIndicator, Button, Card, Divider, Text, useTheme } from '../ui/paper';

import { acceptJob } from '../api/jobs';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS, BRAND_RADII, BRAND_SPACING, BRAND_TYPOGRAPHY } from '../theme';
import { formatGBPCents } from '../utils/money';
import { buildJobPaymentBreakdown } from '../utils/jobPayments';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { VAT_NUMBER_CHECK_URL } from '../utils/vat';

type Job = {
  id: string;
  ref_code: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  status: string;
  trader_id: string | null;
  client_id: string | null;
  vat_registered?: boolean | null;
  vat_registration_number?: string | null;
  planned_start_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_days?: number | null;
};

type Item = {
  id?: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  qty: number;
  price_cents: number;
};

type Material = {
  id?: string;
  title: string;
  description?: string | null;
  price_cents: number;
  upfront_requested: boolean;
};

export default function ReviewBreakdown({ route }: any) {
  const { jobId } = route.params as { jobId: string };
  const theme = useTheme();
  const nav = useNavigation<any>();
  const panelColor = theme.colors.surfaceVariant;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [traderName, setTraderName] = useState('Your tradie');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data: j, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (error) {
      setLoadError('We could not load the job. Check your connection and try again.');
      setLoading(false);
      return;
    }
    setJob(j as Job);

    if (j.trader_id) {
      const { data: trader } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', j.trader_id)
        .maybeSingle();
      if (trader?.name) setTraderName(String(trader.name));
    }

    const { data: rows, error: itemsError } = await supabase
      .from('job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      setLoadError('We could not load the agreed work. Please try again before approving.');
      setLoading(false);
      return;
    }

    if (rows?.length) {
      setItems(
        rows.map((r: any) => ({
          id: r.id,
          title: r.title ?? 'Task',
          description: r.description,
          notes: r.notes,
          qty: Number(r.qty ?? 1),
          price_cents: Number(r.price_cents ?? 0),
        })),
      );
    } else {
      setItems([{ title: j.title || 'Job', qty: 1, price_cents: Number(j.price_cents ?? 0) }]);
    }

    const { data: materialRows, error: materialsError } = await supabase
      .from('job_materials')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });
    if (materialsError) {
      setLoadError('We could not load the materials. Please try again before approving.');
      setLoading(false);
      return;
    }
    setMaterials((materialRows || []).map((row: any) => ({
      id: row.id,
      title: row.title || 'Material',
      description: row.description,
      price_cents: Number(row.price_cents || 0),
      upfront_requested: row.upfront_requested === true,
    })));
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const paymentBreakdown = useMemo(
    () => buildJobPaymentBreakdown(job as any, items),
    [items, job],
  );
  const formatDate = useCallback((value?: string | null) => {
    if (!value) return 'To be agreed';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }, []);

  const approveAndPay = useCallback(async () => {
    if (!job || busy || loadError) return;
    try {
      setBusy(true);
      if (job.status === 'proposed') await acceptJob(job.id);
      nav.replace('Payment', { jobId: job.id });
    } catch (e: any) {
      Alert.alert('Could not approve', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, job, loadError, nav]);

  if (loadError || (!loading && !job)) return (
    <ResponsivePageScrollView>
      <BrandScreenHeader title="Review job" onBack={() => nav.goBack()} />
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
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader
          title="Review job"
          onBack={() => nav.goBack()}
          chipLabel={job.ref_code || 'New job'}
        />

        <View style={styles.pageHeading}>
          <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>
            Review and approve your job
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Check the agreed work and price before paying.
          </Text>
        </View>

        <View style={styles.tradieRow}>
          <View style={styles.tradieAvatar}>
            <MCIcon name="account-hard-hat" size={24} color={BRAND_COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{traderName}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Sent this job breakdown</Text>
          </View>
        </View>

        <Card mode="contained" style={[styles.sectionCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content style={styles.jobMetaContent}>
            <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>{job.title}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, ...BRAND_TYPOGRAPHY.jobCode }}>
              Job {job.ref_code || job.id.slice(0, 8).toUpperCase()}
            </Text>
            {!!job.description && <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{job.description}</Text>}
            <Divider />
            <View style={styles.metaRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Start date</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{formatDate(job.start_date || job.planned_start_date)}</Text>
            </View>
            {!!job.end_date && (
              <View style={styles.metaRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Estimated finish</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{formatDate(job.end_date)}</Text>
              </View>
            )}
            {!!job.duration_days && (
              <View style={styles.metaRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Duration</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{job.duration_days} day{job.duration_days === 1 ? '' : 's'}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <View style={[styles.trustBanner, { backgroundColor: panelColor, borderColor: theme.colors.outlineVariant }]}>
          <MCIcon name="shield-lock-outline" size={23} color={BRAND_COLORS.maroon} />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
            Your payment is held securely by Yakka and is not released to the tradie until the job is confirmed complete.
          </Text>
        </View>

        <Card mode="contained" style={[styles.sectionCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content style={styles.sectionContent}>
            <Text variant="headlineSmall" style={{ color: BRAND_COLORS.maroon }}>
              Job breakdown
            </Text>

            {!!materials.length && (
              <View style={{ gap: 10 }}>
                <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon }}>Materials</Text>
                {materials.map((material, index) => (
                  <View
                    key={material.id ?? `${material.title}-${index}`}
                    style={[styles.breakdownItem, styles.materialItem, { borderColor: theme.colors.outlineVariant }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text variant="titleMedium" style={{ flex: 1, color: BRAND_COLORS.maroon }}>{material.title}</Text>
                      <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>{formatGBPCents(material.price_cents)}</Text>
                    </View>
                    {!!material.description && <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{material.description}</Text>}
                    {material.upfront_requested && <Text variant="labelMedium" style={{ color: BRAND_COLORS.maroon }}>Upfront payment requested</Text>}
                  </View>
                ))}
              </View>
            )}

            {items.map((item, index) => (
              <View
                key={item.id ?? `${item.title}-${index}`}
                style={[styles.breakdownItem, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.background }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={styles.taskHeading}>
                    <View style={styles.taskNumber}><Text variant="labelSmall" style={styles.taskNumberText}>{index + 1}</Text></View>
                    <Text variant="titleMedium" style={{ flex: 1, color: theme.colors.onSurface }}>{item.title}</Text>
                  </View>
                  <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>
                    {formatGBPCents(item.qty * item.price_cents)}
                  </Text>
                </View>
                {!!item.description && (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                    {item.description}
                  </Text>
                )}
                {!!item.notes && (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                    Notes: {item.notes}
                  </Text>
                )}
                <View style={styles.heldNote}>
                  <MCIcon name="lightbulb-outline" size={16} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                    Payment stays protected until this job is confirmed complete.
                  </Text>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>

        <Card mode="contained" style={[styles.sectionCard, { backgroundColor: panelColor }]}>
          <Card.Content style={styles.sectionContent}>
            <Text variant="headlineSmall" style={{ color: BRAND_COLORS.maroon }}>
              Summary
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>
                Tasks subtotal (ex VAT)
              </Text>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>
                {formatGBPCents(paymentBreakdown.laborCents)}
              </Text>
            </View>

            {paymentBreakdown.materialsCents > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>
                  Materials (ex VAT)
                </Text>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>
                  {formatGBPCents(paymentBreakdown.materialsCents)}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>Subtotal (ex VAT)</Text>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>{formatGBPCents(paymentBreakdown.subtotalExVatCents)}</Text>
            </View>

            {paymentBreakdown.vatCents > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>VAT (20%)</Text>
                <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>{formatGBPCents(paymentBreakdown.vatCents)}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, flex: 1, flexShrink: 1 }}>
                YAKKA customer service fee (2%)
              </Text>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>
                {formatGBPCents(paymentBreakdown.clientFeeCents)}
              </Text>
            </View>

            <View style={styles.totalBand}>
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.cream }}>Total to pay</Text>
              <Text variant="headlineMedium" style={{ color: BRAND_COLORS.orange }}>
                {formatGBPCents(paymentBreakdown.totalDueCents)}
              </Text>
            </View>

            <Text variant="bodyMedium" style={{ color: BRAND_COLORS.maroon, lineHeight: 24 }}>
              You&apos;ll authorise this total by bank payment. YAKKA keeps a job-by-job record while the funds remain in its Stripe platform balance, and the tradie is paid only after the agreed release conditions are met.
            </Text>

            {job.vat_registered && !!job.vat_registration_number && (
              <Card mode="outlined" style={{ borderRadius: 18, borderColor: BRAND_COLORS.maroon }}>
                <Card.Content style={{ gap: 5 }}>
                  <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon }}>VAT registered tradie</Text>
                  <Text variant="bodyMedium" style={{ color: BRAND_COLORS.maroon }}>VAT number: {job.vat_registration_number}</Text>
                  <Button mode="text" icon="open-in-new" onPress={() => Linking.openURL(VAT_NUMBER_CHECK_URL)} textColor={BRAND_COLORS.orange}>
                    Verify on GOV.UK
                  </Button>
                </Card.Content>
              </Card>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${traderName} before approving`}
              onPress={() => nav.navigate('Chat', { jobId: job.id })}
              style={({ pressed }) => [
                styles.messagePrompt,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
                pressed && { opacity: 0.76 },
              ]}
            >
              <MCIcon name="message-text-outline" size={24} color={BRAND_COLORS.maroon} />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>Have a question first?</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Message {traderName} before approving</Text>
              </View>
              <MCIcon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
            </Pressable>

            <Button
              mode="contained"
              loading={busy}
              disabled={busy}
              onPress={approveAndPay}
              buttonColor={BRAND_COLORS.orange}
              textColor={BRAND_COLORS.white}
            >
              Approve & pay {formatGBPCents(paymentBreakdown.totalDueCents)}
            </Button>

            <Button
              mode="text"
              onPress={() => nav.goBack()}
              textColor={BRAND_COLORS.maroon}
            >
              Review later
            </Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeading: {
    gap: BRAND_SPACING.xs,
    paddingTop: BRAND_SPACING.lg,
    marginBottom: BRAND_SPACING.lg,
  },
  tradieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BRAND_SPACING.md,
    marginBottom: BRAND_SPACING.md,
  },
  tradieAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.maroon,
  },
  sectionCard: {
    borderRadius: BRAND_RADII.panel,
    marginBottom: BRAND_SPACING.md,
  },
  jobMetaContent: {
    gap: BRAND_SPACING.sm,
    paddingVertical: BRAND_SPACING.lg,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: BRAND_SPACING.lg,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: BRAND_SPACING.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: BRAND_COLORS.orange,
    borderRadius: BRAND_RADII.control,
    padding: BRAND_SPACING.md,
    marginBottom: BRAND_SPACING.md,
  },
  sectionContent: {
    gap: BRAND_SPACING.md,
    paddingVertical: BRAND_SPACING.lg,
  },
  breakdownItem: {
    gap: BRAND_SPACING.sm,
    borderWidth: 1,
    borderRadius: BRAND_RADII.control,
    padding: BRAND_SPACING.md,
  },
  materialItem: {
    backgroundColor: BRAND_COLORS.creamSoft,
  },
  taskHeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BRAND_SPACING.sm,
  },
  taskNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.orangeSoft,
  },
  taskNumberText: {
    color: BRAND_COLORS.maroon,
    fontFamily: 'Satoshi-Bold',
  },
  heldNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BRAND_SPACING.sm,
    marginTop: BRAND_SPACING.xs,
  },
  totalBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: BRAND_SPACING.lg,
    backgroundColor: BRAND_COLORS.maroon,
    borderRadius: BRAND_RADII.control,
    paddingHorizontal: BRAND_SPACING.lg,
    paddingVertical: BRAND_SPACING.md,
  },
  messagePrompt: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BRAND_SPACING.md,
    borderWidth: 1,
    borderRadius: BRAND_RADII.control,
    paddingHorizontal: BRAND_SPACING.md,
    paddingVertical: BRAND_SPACING.sm,
  },
});
