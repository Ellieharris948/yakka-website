import AdminJobDossier from '../components/AdminJobDossier';
import { buildSettlementPlan } from '../../supabase/functions/_shared/settlement_plan';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Chip, Divider, Text, TextInput, useTheme } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { buildDisputeResolutionBreakdown } from '../utils/jobPayments';
import { formatGBPCents } from '../utils/money';
import { signJobImageRows } from '../utils/jobImages';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import BrandHeaderBar from '../components/BrandHeaderBar';
import { BRAND_TYPOGRAPHY } from '../theme';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import ScreenState from '../components/ScreenState';

type AdminFilter = 'all' | 'attention' | 'disputes' | 'held' | 'resolved';

function parsePoundsToCents(value: string) {
  const clean = value.trim().replace(/£|,/g, '');
  if (!/^\d+(?:\.\d{0,2})?$/.test(clean)) return -1;
  const cents = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(cents) ? cents : -1;
}

function poundsInput(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function formatDateTime(value: unknown) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function latestRowsByJob(rows: any[] | null | undefined) {
  const result = new Map<string, any>();
  for (const row of rows || []) {
    if (!result.has(String(row.job_id))) result.set(String(row.job_id), row);
  }
  return result;
}

function chunks<T>(values: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchAllJobs() {
  const rows: any[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

async function fetchAllOpenAlerts() {
  const rows: any[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('payment_alerts')
      .select('*')
      .is('resolved_at', null)
      .order('last_seen_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

async function fetchEvidence(table: string, column: string, id: string, order: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from(table).select('*').eq(column, id)
      .order(order, { ascending: true }).order('id', { ascending: true }).range(from, from + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}

export default function AdminDashboard() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AdminFilter>('disputes');
  const [jobs, setJobs] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [dossier, setDossier] = useState<Record<string, any[]>>({});
  const [selectedPayments, setSelectedPayments] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<any[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<any[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<any | null>(null);
  const [settlementSetupError, setSettlementSetupError] = useState('');
  const [previouslyReleasedGrossCents, setPreviouslyReleasedGrossCents] = useState(0);
  const [customerAmount, setCustomerAmount] = useState('');
  const [tradieAmount, setTradieAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [openingJobId, setOpeningJobId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); return; }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      const adminUser = profile?.role === 'admin';
      setIsAdmin(adminUser);
      if (!adminUser) return;

      const [rows, alertRows] = await Promise.all([fetchAllJobs(), fetchAllOpenAlerts()]);
      const jobIds = rows.map(row => row.id);
      const [paymentResults, disputeResults] = await Promise.all([
        Promise.all(chunks(jobIds).map(ids => supabase.from('payments').select('*').in('job_id', ids).order('created_at', { ascending: false }))),
        Promise.all(chunks(jobIds).map(ids => supabase.from('disputes').select('*').in('job_id', ids).order('submitted_at', { ascending: false }))),
      ]);
      const firstError = [...paymentResults, ...disputeResults].find(result => result.error)?.error;
      if (firstError) throw firstError;
      const paymentRows = paymentResults.flatMap(result => result.data || []);
      const disputeRows = disputeResults.flatMap(result => result.data || []);
      const paymentsByJob = latestRowsByJob(paymentRows);
      const disputesByJob = latestRowsByJob(disputeRows);
      setJobs(rows.map(job => ({
        ...job,
        _payment: paymentsByJob.get(String(job.id)) || null,
        _dispute: disputesByJob.get(String(job.id)) || null,
      })));
      setAlerts(alertRows);
    } catch (error: any) {
      setLoadError(error?.message || 'The operations dashboard could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const alertJobIds = new Set(alerts.map(alert => String(alert.job_id || '')));
    return jobs.filter(job => {
      const paymentStatus = String(job._payment?.status || 'unfunded');
      const matchesFilter = filter === 'all'
        || (filter === 'disputes' && job._dispute?.status === 'open')
        || (filter === 'attention' && (job.status === 'disputed' || paymentStatus === 'refund_pending' || alertJobIds.has(String(job.id))))
        || (filter === 'held' && ['funded', 'disputed'].includes(paymentStatus))
        || (filter === 'resolved' && (job._dispute?.status === 'resolved' || ['released', 'partially_refunded', 'refunded'].includes(paymentStatus)));
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [
        job.ref_code,
        job.id,
        job.title,
        job.status,
        job._payment?.status,
        job._payment?.id,
        job._payment?.stripe_payment_intent_id,
        job._payment?.stripe_transfer_id,
        job._payment?.stripe_refund_id,
        job._dispute?.request_number,
      ].some(value => String(value || '').toLowerCase().includes(needle));
    });
  }, [alerts, filter, jobs, query]);

  const counts = useMemo(() => ({
    jobs: jobs.length,
    held: jobs.filter(job => ['funded', 'disputed'].includes(String(job._payment?.status))).length,
    disputes: jobs.filter(job => job.status === 'disputed').length,
    refunds: jobs.filter(job => String(job._payment?.status) === 'refund_pending').length,
    alerts: alerts.length,
  }), [alerts.length, jobs]);

  const closeSettlement = useCallback(() => {
    setSelected(null);
    setSelectedPayments([]);
    setDossier({});
    setSelectedPayment(null);
    setSelectedDispute(null);
    setSelectedMessages([]);
    setSelectedItems([]);
    setSelectedPhotos([]);
    setSelectedAudit([]);
    setSelectedDecision(null);
    setSettlementSetupError('');
    setPreviouslyReleasedGrossCents(0);
    setCustomerAmount('');
    setTradieAmount('');
    setReason('');
  }, []);

  const openSettlement = useCallback(async (job: any) => {
    try {
      setOpeningJobId(job.id);
      const [paymentResult, disputeResult, releaseResult, messages, photos] = await Promise.all([
        supabase.from('payments').select('*').eq('job_id', job.id).order('created_at', { ascending: true }),
        supabase.from('disputes').select('*').eq('job_id', job.id).order('submitted_at', { ascending: false }).limit(1),
        supabase.from('partial_payment_requests').select('amount_cents').eq('job_id', job.id).eq('status', 'released'),
        fetchEvidence('messages', 'job_id', job.id, 'created_at'),
        fetchEvidence('job_photos', 'job_id', job.id, 'created_at'),
      ]);
      if (paymentResult.error) throw paymentResult.error;
      if (disputeResult.error) throw disputeResult.error;
      if (releaseResult.error) throw releaseResult.error;
      const allPayments = paymentResult.data || [];
      const heldPayments = allPayments.filter((p: any) => !['failed', 'cancelled'].includes(p.status));
      const payment = heldPayments[0];
      const dispute = disputeResult.data?.[0];
      if (!dispute) throw new Error('This job does not have a dispute to review.');
      const [items, audit, decisionResult] = await Promise.all([
        fetchEvidence('dispute_items', 'dispute_id', dispute.id, 'id'),
        fetchEvidence('payment_admin_audit', 'dispute_id', dispute.id, 'created_at'),
        supabase.from('dispute_settlement_decisions').select('*').eq('dispute_id', dispute.id).maybeSingle(),
      ]);
      const missingSetup = ['PGRST205', '42P01'].includes(decisionResult.error?.code || '');
      if (decisionResult.error && !missingSetup) throw decisionResult.error;
      setSettlementSetupError(missingSetup ? 'Payout decisions are temporarily unavailable until the admin settlement update is deployed. You can still review this case and its evidence.' : '');
      const decision = decisionResult.data;
      const [originalItems, materials, changesResult, releases, ledgers, operations, jobResult] = await Promise.all([
        fetchEvidence('job_items', 'job_id', job.id, 'id'),
        fetchEvidence('job_materials', 'job_id', job.id, 'id'),
        supabase.from('job_scope_changes').select('*').eq('job_id', job.id).order('created_at'),
        fetchEvidence('partial_payment_requests', 'job_id', job.id, 'created_at'),
        fetchEvidence('payment_ledgers', 'job_id', job.id, 'id'),
        fetchEvidence('payment_operations', 'job_id', job.id, 'created_at'),
        supabase.from('jobs').select('*').eq('id', job.id).single(),
      ]);
      if (jobResult.error) throw jobResult.error;
      if (changesResult.error && !['PGRST205', '42P01'].includes(changesResult.error.code)) throw changesResult.error;
      if (changesResult.error) setSettlementSetupError('The extra-work update is not deployed yet. Complete records are required before settlement.');
      setDossier({ items: originalItems, materials, changes: changesResult.data || [], payments: allPayments, releases, ledgers, operations });
      setSelectedPayments(heldPayments);
      setSelected({ ...job, ...jobResult.data });
      setSelectedPayment(payment);
      setSelectedDispute(dispute);
      setSelectedMessages(messages);
      setSelectedItems(items);
      setSelectedPhotos(await signJobImageRows(photos));
      setSelectedAudit(audit);
      setSelectedDecision(decision);
      setPreviouslyReleasedGrossCents((releaseResult.data || []).reduce(
        (sum: number, row: any) => sum + Math.max(0, Number(row.amount_cents || 0)),
        0,
      ));
      setCustomerAmount(decision ? poundsInput(decision.customer_gross_cents) : '');
      setTradieAmount(decision ? poundsInput(decision.tradie_gross_cents) : '');
      setReason(decision?.reason || '');
    } catch (error: any) {
      Alert.alert('Could not open dispute review', error?.message || 'Please try again.');
    } finally {
      setOpeningJobId(null);
    }
  }, []);

  const customerGrossCents = parsePoundsToCents(customerAmount);
  const tradieGrossCents = parsePoundsToCents(tradieAmount);
  const settlement = useMemo(() => {
    if (!selectedPayment || customerGrossCents < 0 || tradieGrossCents < 0) return null;
    return buildSettlementPlan(selectedPayments, previouslyReleasedGrossCents, customerGrossCents, tradieGrossCents);
  }, [customerGrossCents, previouslyReleasedGrossCents, selectedPayments, selectedPayment, tradieGrossCents]);

  const remainingPrincipalCents = Math.max(0, selectedPayments.reduce((sum, p) => sum + Number(p.principal_cents || 0), 0) - previouslyReleasedGrossCents);
  const canSettle = !settlementSetupError && selectedDispute?.status === 'open' && (selected?.status === 'disputed' || !!selectedDecision)
    && selectedPayments.length > 0 && selectedPayments.every(p => (['funded', 'disputed'].includes(p.status) || !!selectedDecision) && p.stripe_payment_intent_id && p.stripe_charge_id);

  const resolveDispute = useCallback(async () => {
    if (saving || !canSettle || !selected || !selectedDispute || !settlement) return;
    if (!settlement.isFullyAllocated) {
      Alert.alert('Check the split', `The customer and tradie amounts must total ${formatGBPCents(settlement.remainingPrincipalCents)}.`);
      return;
    }
    if (reason.trim().length < 20) {
      Alert.alert('Add the decision reason', 'Record at least 20 characters so the audit trail explains who decided what and why.');
      return;
    }
    try {
      setSaving(true);
      const result = await invokeEdgeFunction('resolve-dispute', {
        jobId: selected.id,
        disputeId: selectedDispute.id,
        customerGrossCents,
        tradieGrossCents,
        reason: reason.trim(),
      });
      if (result.alreadyResolved) {
        Alert.alert('Already settled', 'This dispute already has a recorded decision. The latest record has been refreshed.');
        closeSettlement();
        await load();
        return;
      }
      const refundCopy = result.breakdown?.customerRefundCents > 0
        ? result.refundStatus === 'succeeded'
          ? `${formatGBPCents(result.breakdown.customerRefundCents)} refunded to the customer.`
          : `${formatGBPCents(result.breakdown.customerRefundCents)} submitted for refund and shown as processing until Stripe confirms it.`
        : 'No customer refund was due.';
      Alert.alert('Settlement recorded', `${formatGBPCents(result.breakdown?.tradieTransferCents || 0)} sent to the tradie. ${refundCopy}`);
      closeSettlement();
      await load();
    } catch (error: any) {
      Alert.alert('Settlement failed', error?.message || 'No result was recorded. Review the payment alert before retrying.');
      // The server may have committed the decision or a money movement before
      // the connection failed. Reload that decision before offering another try.
      await openSettlement(selected);
    } finally {
      setSaving(false);
    }
  }, [canSettle, saving, closeSettlement, customerGrossCents, load, openSettlement, reason, selected, selectedDispute, settlement, tradieGrossCents]);

  function confirmSettlement() {
    if (!settlement || !canSettle || saving) return;
    Alert.alert('Confirm settlement',
      `Job ${selected.ref_code || selected.id}\nCustomer refund: ${formatGBPCents(settlement.customerRefundCents)}\nTradie transfer: ${formatGBPCents(settlement.tradieTransferCents)}\n\nDecision: ${reason.trim()}\n\nConfirming sends these amounts for processing.`,
      [{ text: 'Keep reviewing', style: 'cancel' }, { text: 'Confirm transfer and refund', onPress: () => void resolveDispute() }]);
  }

  if (loading) return <ScreenState loading title="Loading admin operations" />;

  if (!isAdmin) {
    return (
      <ScreenState
        title="Admin only"
        message="This screen is only available to named YAKKA admin accounts."
        icon="shield-lock-outline"
        actionLabel="Go back"
        onAction={() => nav.goBack()}
      />
    );
  }

  if (loadError) {
    return (
      <ScreenState
        title="Admin tools could not load"
        message={loadError}
        icon="alert-circle-outline"
        actionLabel="Try again"
        onAction={() => void load()}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <BrandHeaderBar />
      <ResponsivePageScrollView key={selected?.id || 'queue'} keyboardShouldPersistTaps="handled" testID="admin-content">
        <View style={{ gap: 10, marginBottom: 16 }}>
          <Chip icon="shield-lock-outline" style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.secondaryContainer }}>Private admin workspace</Chip>
          <Text variant="headlineMedium">Dispute resolution</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Parties are shown only as Customer and Tradie so decisions stay focused on the agreement, evidence and payment record.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {selected ? <Button disabled={saving} onPress={closeSettlement}>Back to disputes</Button> : <>
              <Button onPress={() => nav.navigate('ChangePassword')}>Change password</Button>
              <Button onPress={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) Alert.alert('Could not log out', error.message);
              }}>Log out</Button>
            </>}
          </View>
        </View>

        {!selected && <>
        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20, marginBottom: 12 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="headlineSmall">Payments and jobs</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.72 }}>
              Start with open disputes, review the evidence, then allocate the held job value. No party names are shown to the decision maker.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip compact>{counts.jobs} jobs</Chip>
              <Chip compact>{counts.held} held</Chip>
              <Chip compact>{counts.disputes} disputes</Chip>
              <Chip compact>{counts.refunds} refunds processing</Chip>
              <Chip compact>{counts.alerts} alerts</Chip>
            </View>
          </Card.Content>
        </Card>

        {!!alerts.length && (
          <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
            <Card.Content style={{ gap: 10 }}>
              <Text variant="headlineSmall">Payment alerts</Text>
              <Text variant="bodyMedium" style={{ opacity: 0.72 }}>
                Reconciliation failures and held portions approaching 90 days remain visible until reviewed.
              </Text>
              {alerts.slice(0, 25).map(alert => (
                <View key={alert.id} style={{ gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Chip compact>{alert.severity}</Chip>
                    <Text variant="titleSmall" style={{ flex: 1 }}>{String(alert.category || 'payment alert').replaceAll('_', ' ')}</Text>
                  </View>
                  <Text variant="bodySmall">{alert.message}</Text>
                  <Text variant="bodySmall" style={{ opacity: 0.58 }}>{formatDateTime(alert.last_seen_at)}</Text>
                </View>
              ))}
              {alerts.length > 25 && (
                <Text variant="bodySmall" style={{ opacity: 0.65 }}>Showing the 25 newest of {alerts.length} open alerts.</Text>
              )}
            </Card.Content>
          </Card>
        )}

        <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
          <Card.Content style={{ gap: 10 }}>
            <TextInput mode="outlined" label="Job ID, dispute, payment or status" accessibilityLabel="Job ID, dispute, payment or status" value={query} onChangeText={setQuery} autoCapitalize="none" left={<TextInput.Icon icon="magnify" />} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([['disputes', 'Open disputes'], ['attention', 'Needs attention'], ['all', 'All'], ['held', 'Funds held'], ['resolved', 'Resolved']] as Array<[AdminFilter, string]>).map(([value, label]) => (
                <Chip key={value} selected={filter === value} onPress={() => setFilter(value)}>{label}</Chip>
              ))}
            </View>
            <Button mode="contained-tonal" icon="refresh" onPress={() => void load()}>Refresh live data</Button>
          </Card.Content>
        </Card>
        </>}

        {selected && selectedDispute && (
          <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
            <Card.Content style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Text variant="headlineSmall" style={{ flex: 1 }}>Dispute evidence and settlement</Text>
                <Chip icon={selectedDispute.status === 'resolved' ? 'check-circle-outline' : 'file-search-outline'} compact>
                  {selectedDispute.status === 'resolved' ? 'Resolved' : 'Under review'}
                </Chip>
              </View>
              <Text variant="bodyMedium" style={{ ...BRAND_TYPOGRAPHY.jobCode }}>Job ID: {selected.ref_code || selected.id}</Text>
              <View style={{ gap: 2 }}>
                <Text variant="titleSmall">Party A · Customer</Text>
                <Text variant="titleSmall">Party B · Tradie</Text>
                <Text variant="bodySmall" style={{ opacity: 0.65 }}>
                  Dispute {selectedDispute.request_number || selectedDispute.id} · submitted {formatDateTime(selectedDispute.submitted_at)}
                </Text>
              </View>
              <Divider />
              <AdminJobDossier job={selected} records={dossier} />
              <Divider />
              <Text variant="titleMedium">Dispute claims</Text>
              <Text>{selectedDispute.summary || 'No summary recorded.'}</Text>
              {selectedItems.map(item => (
                <Card key={item.id} mode="outlined">
                  <Card.Content style={{ gap: 6 }}>
                    <Text variant="titleSmall">{item.title} · {formatGBPCents(Number(item.amount_cents || 0))}</Text>
                    <Text>{item.details || 'No details recorded.'}</Text>
                    <Text variant="bodySmall">Evidence: {(item.evidence_photo_ids || []).length} photos · {String(item.outcome || 'under_review').replaceAll('_', ' ')}</Text>
                  </Card.Content>
                </Card>
              ))}
              {!selectedItems.length && <Text>No item details were recorded.</Text>}
              <Text variant="titleMedium">Photo evidence</Text>
              {selectedPhotos.map(photo => (
                <View key={photo.id} style={{ gap: 6 }}>
                  <Text variant="labelLarge">{photo.stage} · {photo.uploaded_by === selected.client_id ? 'Customer' : photo.uploaded_by === selected.trader_id ? 'Tradie' : 'Contributor'}</Text>
                  {!!photo.file_url && <Image source={{ uri: photo.file_url }} accessibilityLabel={`Evidence: ${photo.note || photo.stage}`} resizeMode="contain" style={{ width: '100%', height: 220 }} />}
                  <Text>{photo.note || 'No photo note'}</Text>
                  <Text variant="bodySmall">{formatDateTime(photo.created_at)}</Text>
                  {selectedItems.filter(item => (item.evidence_photo_ids || []).includes(photo.id)).map(item => <Text key={item.id} variant="bodySmall">Supports claim: {item.title}</Text>)}
                </View>
              ))}
              {!selectedPhotos.length && <Text>No photos are available. Evidence may have passed its retention period.</Text>}
              <Divider />
              <Text variant="titleMedium">Conversation evidence</Text>
              {selectedMessages.length ? selectedMessages.map(message => {
                const sender = message.sender_id === selected.client_id
                  ? 'Customer'
                  : message.sender_id === selected.trader_id
                    ? 'Tradie'
                    : message.sender_id ? 'Job contributor' : 'System';
                return (
                  <Card key={message.id} mode="outlined" style={{ borderRadius: 16 }}>
                    <Card.Content style={{ gap: 4 }}>
                      <Text variant="labelLarge">{sender}</Text>
                      <Text variant="bodyMedium">{message.body || 'Attachment or job update'}</Text>
                      <Text variant="bodySmall" style={{ opacity: 0.58 }}>{formatDateTime(message.created_at)}</Text>
                    </Card.Content>
                  </Card>
                );
              }) : <Text variant="bodyMedium" style={{ opacity: 0.7 }}>No messages were recorded for this dispute.</Text>}
              <Divider />
              {selectedDispute.status === 'resolved' && <View style={{ gap: 8 }}>
                <Text variant="titleMedium">Recorded decision</Text>
                <Text>{selectedDispute.resolution_reason || 'No decision reason recorded.'}</Text>
                <Text>Outcome: {selectedDispute.outcome}</Text>
                <Text>Customer refund: {formatGBPCents(Number(selectedDispute.customer_refund_cents || 0))}</Text>
                <Text>Tradie transfer: {formatGBPCents(Number(selectedDispute.tradie_transfer_cents || 0))}</Text>
                <Text>Refund status: {selectedDispute.stripe_refund_status || 'No refund due'}</Text>
                <Text>Decision recorded: {formatDateTime(selectedDispute.resolved_at)}</Text>
              </View>}
              {selectedAudit.map(entry => <View key={entry.id} style={{ gap: 4 }}>
                <Text variant="titleSmall">Audit record · {formatDateTime(entry.created_at)}</Text>
                <Text>{entry.reason}</Text>
                <Text variant="bodySmall">Recorded by an authorised Yakka reviewer</Text>
              </View>)}
              {!!settlementSetupError && <Text>{settlementSetupError}</Text>}
              {selectedDispute.status !== 'resolved' && !canSettle && !settlementSetupError && <Text>Settlement unavailable: the job must be disputed with a held payment and complete Stripe references. Review the payment record and reconcile funding before deciding payouts.</Text>}
              {canSettle && <>
              <Text variant="titleMedium">Allocate the remaining held value</Text>
              {!!selectedDecision && <Text>A settlement decision is recorded. Its amounts and reason are locked; retry to finish processing the same decision.</Text>}
              <Text>Already released from job value: {formatGBPCents(previouslyReleasedGrossCents)}</Text>
              <Text variant="bodyMedium" style={{ opacity: 0.72 }}>
                YAKKA deducts 5% from the tradie share and automatically refunds the customer’s proportional 2% fee. Nothing moves until the final confirmation.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="titleMedium">Remaining to allocate</Text>
                <Text variant="titleMedium">{formatGBPCents(remainingPrincipalCents)}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button disabled={saving || !!selectedDecision} mode="contained-tonal" onPress={() => {
                  setCustomerAmount(poundsInput(remainingPrincipalCents));
                  setTradieAmount('0.00');
                }}>Refund all</Button>
                <Button disabled={saving || !!selectedDecision} mode="contained-tonal" onPress={() => {
                  setCustomerAmount('0.00');
                  setTradieAmount(poundsInput(remainingPrincipalCents));
                }}>Pay tradie all</Button>
              </View>
              <TextInput disabled={saving || !!selectedDecision} mode="outlined" label="Customer gross share (£)" accessibilityLabel="Customer gross share (£)" value={customerAmount} onChangeText={setCustomerAmount} keyboardType="decimal-pad" />
              <TextInput disabled={saving || !!selectedDecision} mode="outlined" label="Tradie gross share (£)" accessibilityLabel="Tradie gross share (£)" value={tradieAmount} onChangeText={setTradieAmount} keyboardType="decimal-pad" />
              {(customerAmount !== '' && customerGrossCents < 0 || tradieAmount !== '' && tradieGrossCents < 0) && <Text>Enter non-negative amounts with no more than two decimal places.</Text>}
              {settlement && (
                <Card mode="outlined" style={{ borderRadius: 18 }}>
                  <Card.Content style={{ gap: 7 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>Customer refund</Text><Text>{formatGBPCents(settlement.customerRefundCents)}</Text></View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>Tradie transfer after 5%</Text><Text>{formatGBPCents(settlement.tradieTransferCents)}</Text></View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>YAKKA tradie fee retained</Text><Text>{formatGBPCents(settlement.tradieFeeCents)}</Text></View>
                    {!settlement.isFullyAllocated && (
                      <Text variant="bodySmall">
                        {settlement.unallocatedCents > 0
                          ? `${formatGBPCents(settlement.unallocatedCents)} still needs allocating.`
                          : `The split is ${formatGBPCents(Math.abs(settlement.unallocatedCents))} over the held amount.`}
                      </Text>
                    )}
                  </Card.Content>
                </Card>
              )}
              <TextInput disabled={saving || !!selectedDecision} mode="outlined" label="Decision and reason" accessibilityLabel="Decision and reason" value={reason} onChangeText={setReason} multiline />
              <Text variant="bodySmall">Explain the decision in at least 20 characters.</Text>
              <Button mode="contained" loading={saving} disabled={saving || !settlement?.isFullyAllocated || reason.trim().length < 20} onPress={confirmSettlement}>
                Review settlement
              </Button>
              </>}
              <Button mode="contained-tonal" disabled={saving} onPress={closeSettlement}>Close review</Button>
            </Card.Content>
          </Card>
        )}

        {!selected && <>
        <Text variant="titleMedium" style={{ marginBottom: 10 }}>{filteredJobs.length} matching {filteredJobs.length === 1 ? 'job' : 'jobs'}</Text>
        {filteredJobs.map(job => {
          const payment = job._payment;
          const dispute = job._dispute;
          const expanded = expandedJobId === job.id;
          return (
            <Card key={job.id} mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
              <Card.Content style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall">{job.title}</Text>
                    <Text variant="bodyMedium" style={{ opacity: 0.7, ...BRAND_TYPOGRAPHY.jobCode }}>Job ID: {job.ref_code || job.id}</Text>
                  </View>
                  <Chip compact>{job.status}</Chip>
                </View>
                <Text variant="bodySmall">Parties · Customer and {job.trader_id ? 'Tradie' : 'unassigned tradie'}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant="bodySmall" style={{ opacity: 0.72 }}>Agreed value</Text><Text variant="bodySmall">{formatGBPCents(Number(payment?.principal_cents ?? job.price_cents ?? 0))}</Text></View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant="bodySmall" style={{ opacity: 0.72 }}>Payment</Text><Text variant="bodySmall">{payment?.status || 'not funded'}</Text></View>
                {!!dispute && <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant="bodySmall" style={{ opacity: 0.72 }}>Dispute</Text><Text variant="bodySmall">{dispute.status}</Text></View>}
                {expanded && (
                  <Card mode="outlined" style={{ borderRadius: 16 }}>
                    <Card.Content style={{ gap: 5 }}>
                      <Text variant="labelLarge">Operational record</Text>
                      <Text variant="bodySmall">Created · {formatDateTime(job.created_at)}</Text>
                      <Text variant="bodySmall">Customer total · {formatGBPCents(Number(payment?.total_cents || 0))}</Text>
                      <Text variant="bodySmall">Customer fee · {formatGBPCents(Number(payment?.client_fee_cents || 0))}</Text>
                      <Text variant="bodySmall">Tradie net · {formatGBPCents(Number(payment?.net_to_seller_cents || 0))}</Text>
                      <Text variant="bodySmall">Provider state · {payment?.provider_status || 'not started'}</Text>
                      {!!payment?.stripe_payment_intent_id && <Text variant="bodySmall" style={{ ...BRAND_TYPOGRAPHY.jobCode }}>PaymentIntent · {payment.stripe_payment_intent_id}</Text>}
                      {!!payment?.stripe_transfer_id && <Text variant="bodySmall" style={{ ...BRAND_TYPOGRAPHY.jobCode }}>Transfer · {payment.stripe_transfer_id}</Text>}
                      {!!payment?.stripe_refund_id && <Text variant="bodySmall" style={{ ...BRAND_TYPOGRAPHY.jobCode }}>Refund · {payment.stripe_refund_id}</Text>}
                    </Card.Content>
                  </Card>
                )}
                <Divider />
                <Button mode="contained-tonal" onPress={() => setExpandedJobId(expanded ? null : job.id)}>{expanded ? 'Hide payment record' : 'Inspect payment record'}</Button>
                {!!dispute && (
                  <Button mode="contained" loading={openingJobId === job.id} disabled={!!openingJobId} onPress={() => void openSettlement(job)}>
                    {dispute.status === 'resolved' ? 'View decision and evidence' : 'Review dispute'}
                  </Button>
                )}
              </Card.Content>
            </Card>
          );
        })}
        {!filteredJobs.length && (
          <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
            <Card.Content><Text variant="bodyMedium">No jobs match this search and filter.</Text></Card.Content>
          </Card>
        )}
        </>}
      </ResponsivePageScrollView>
    </View>
  );
}
