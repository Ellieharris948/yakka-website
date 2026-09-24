import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, Text, TextInput } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import { formatGBPCents } from '../utils/money';
import { buildJobPaymentBreakdown } from '../utils/jobPayments';
import SwipeSegmentedControl from './SwipeSegmentedControl';

type Line = {
  title: string;
  description: string;
  price: string;
  additional_notes: string;
  materials_supplied_by: 'trader' | 'customer' | 'na';
};
const blankLine = (): Line => ({
  title: '',
  description: '',
  price: '',
  additional_notes: '',
  materials_supplied_by: 'na',
});
export default function JobScopeChanges({ job, isTrader, isClient, onChanged }: {
  job: any; isTrader: boolean; isClient: boolean; onChanged: () => void;
}) {
  const [changes, setChanges] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('0');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const actionInFlight = useRef(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('job_scope_changes').select('*').eq('job_id', job.id).order('created_at');
    setError(error ? 'Extra work could not load. Please try again.' : '');
    if (!error) {
      setChanges(data || []); setLoaded(true);
      const pendingStatus = (data || []).find(c => ['proposed', 'approved'].includes(c.status))?.status || null;
      if (!editingRef.current && pendingStatus !== (job.scope_change_status || null)) onChanged();
    }
  }, [job.id, job.scope_change_status, onChanged]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => listener.remove();
  }, [load, onChanged]);
  const pending = changes.some(c => ['proposed', 'approved'].includes(c.status));
  useFocusEffect(useCallback(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !actionInFlight.current) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, load]));
  const active = ['funded', 'in_progress'].includes(job.status);
  const payload = lines.map(l => ({
    title: l.title.trim(),
    description: l.description.trim(),
    notes: l.additional_notes.trim() || null,
    materials_supplied_by: l.materials_supplied_by,
    qty: 1,
    price_cents: Math.round(Number(l.price) * 100),
  }));
  const valid = reason.trim().length >= 10 && /^\d{1,3}$/.test(days) && Number(days) <= 365
    && lines.every(l => l.title.trim() && l.title.trim().length <= 200 && l.description.trim()
      && /^\d+(\.\d{1,2})?$/.test(l.price) && Number(l.price) > 0);
  const preview = buildJobPaymentBreakdown({ vat_registered: job.vat_registered, vat_rate_bps: job.vat_rate_bps }, payload);
  const fundedExtras = changes.filter(change => change.status === 'funded');
  const extrasTotal = fundedExtras.reduce((sum, change) => sum + Number(change.total_cents), 0);
  async function act(fn: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    try { await fn(); await load(); }
    catch (e: any) { Alert.alert('Extra work', e.message || 'Please try again.'); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  async function review(id: string, action: string) {
    const { error } = await supabase.rpc('rpc_review_scope_change', { p_scope_change_id: id, p_action: action });
    if (error) throw error;
  }
  return <Card mode="contained" style={{ marginVertical: 12 }}><Card.Content style={{ gap: 12 }}>
    <Text variant="headlineSmall">Extra work on this job</Text>
    <Text>Add agreed work without creating another job. The customer reviews each proposal and pays its total, including a 2% service fee. Work resumes when payment is confirmed.</Text>
    {!loaded && !error && <Text>Loading extra work…</Text>}
    {pending && <Text>Work is paused while this addition is reviewed and paid. This page checks for updates automatically.</Text>}
    {!!fundedExtras.length && <Text variant="titleMedium">Paid additions including fees: {formatGBPCents(extrasTotal)}</Text>}
    {!!error && <><Text>{error}</Text><Button onPress={load}>Retry extra work</Button></>}
    {changes.map(change => <Card key={change.id} mode="outlined"><Card.Content style={{ gap: 8 }}>
      <Text variant="titleMedium">{change.status === 'proposed' ? 'Awaiting customer approval' : change.status === 'approved' ? 'Awaiting additional payment' : change.status === 'funded' ? 'Paid — included in this job' : change.status}</Text>
      <Text>{change.reason}</Text>
      {(change.items || []).map((line: any, i: number) => <View key={i} style={{ gap: 2 }}>
        <Text>{line.title} · {formatGBPCents(Number(line.qty || 1) * line.price_cents)}</Text>
        {!!line.description && <Text variant="bodySmall">{line.description}</Text>}
        {!!line.materials_supplied_by && line.materials_supplied_by !== 'na' && (
          <Text variant="bodySmall">Materials supplied by: {line.materials_supplied_by === 'trader' ? 'Tradie' : 'Customer'}</Text>
        )}
      </View>)}
      <Text>Additional time: {change.extra_days} days</Text>
      <Text>Work: {formatGBPCents(change.labor_cents)} · VAT: {formatGBPCents(change.vat_cents)}</Text>
      <Text>Customer service fee (2%): {formatGBPCents(change.client_fee_cents)}</Text>
      <Text variant="titleMedium">Additional payment: {formatGBPCents(change.total_cents)}</Text>
      <Text variant="bodySmall">Proposed {new Date(change.created_at).toLocaleString('en-GB')}{change.reviewed_at ? ` · Reviewed ${new Date(change.reviewed_at).toLocaleString('en-GB')}` : ''}</Text>
      {active && isClient && change.status === 'proposed' && <>
        <Button disabled={busy} mode="contained" onPress={() => Alert.alert('Approve extra work?', `Approve the listed work and ${change.extra_days} extra days for ${formatGBPCents(change.total_cents)}, including the customer fee. Payment is the next step.`, [{ text: 'Keep reviewing', style: 'cancel' }, { text: 'Approve extra work', onPress: () => void act(() => review(change.id, 'approved')) }])}>Approve extra work</Button>
        <Button disabled={busy} onPress={() => void act(() => review(change.id, 'declined'))}>Decline extra work</Button>
      </>}
      {active && isTrader && change.status === 'proposed' && <Button disabled={busy} onPress={() => void act(() => review(change.id, 'withdrawn'))}>Withdraw proposal</Button>}
      {active && isClient && change.status === 'approved' && <>
        <Text>Payment is held with this job until completion or a dispute decision. Authorise only the additional amount in your bank.</Text>
        <Button disabled={busy} loading={busy} mode="contained" onPress={() => void act(async () => {
          const result = await invokeEdgeFunction('create-stripe-checkout', { jobId: job.id, scopeChangeId: change.id });
          if (!result.url) throw new Error('Checkout did not return a payment link.');
          await Linking.openURL(result.url);
        })}>Pay additional {formatGBPCents(change.total_cents)}</Button>
        <Button disabled={busy} onPress={() => { void load(); }}>Check additional payment</Button>
      </>}
    </Card.Content></Card>)}
    {isTrader && active && loaded && !pending && !error && !editing && <Button mode="contained-tonal" onPress={() => setEditing(true)}>Propose extra work</Button>}
    {editing && <View style={{ gap: 10 }}>
      <TextInput mode="outlined" disabled={busy} label="Why is the extra work needed?" accessibilityLabel="Reason for extra work" value={reason} onChangeText={setReason} multiline placeholder="For example, the customer asked to add the hallway" />
      {lines.map((line, i) => <Card key={i} mode="outlined" style={{ borderRadius: 18 }}><Card.Content style={{ gap: 10 }}>
        <Text variant="titleMedium">Additional task {i + 1}</Text>
        <TextInput mode="outlined" disabled={busy} label="Task title" accessibilityLabel={`Extra work line ${i + 1}`} value={line.title} onChangeText={title => setLines(rows => rows.map((r, n) => n === i ? { ...r, title } : r))} />
        <TextInput mode="outlined" disabled={busy} label="Task description" accessibilityLabel={`Extra work description ${i + 1}`} value={line.description} onChangeText={description => setLines(rows => rows.map((r, n) => n === i ? { ...r, description } : r))} multiline />
        <TextInput mode="outlined" disabled={busy} label={job.vat_registered ? 'Task price ex VAT (£)' : 'Task price (£)'} accessibilityLabel={`Unit price ex VAT (£) ${i + 1}`} keyboardType="decimal-pad" value={line.price} onChangeText={price => setLines(rows => rows.map((r, n) => n === i ? { ...r, price } : r))} />
        <TextInput mode="outlined" disabled={busy} label="Additional notes (optional)" accessibilityLabel={`Extra work notes ${i + 1}`} value={line.additional_notes} onChangeText={additional_notes => setLines(rows => rows.map((r, n) => n === i ? { ...r, additional_notes } : r))} multiline />
        <View style={{ gap: 7 }}>
          <Text variant="labelLarge">Materials supplied by</Text>
          <SwipeSegmentedControl
            value={line.materials_supplied_by}
            onChange={materials_supplied_by => setLines(rows => rows.map((r, n) => n === i ? { ...r, materials_supplied_by } : r))}
            options={[{ value: 'trader', label: 'Tradie' }, { value: 'customer', label: 'Customer' }, { value: 'na', label: 'N/A' }]}
            accessibilityLabel={`Materials supplied by for additional task ${i + 1}`}
          />
        </View>
        {lines.length > 1 && <Button disabled={busy} onPress={() => setLines(rows => rows.filter((_, n) => i !== n))}>Remove line {i + 1}</Button>}
      </Card.Content></Card>)}
      <Button disabled={busy || lines.length >= 50} icon="plus" onPress={() => setLines(rows => [...rows, blankLine()])}>Add another task</Button>
      <TextInput mode="outlined" disabled={busy} label="Additional days needed" accessibilityLabel="Additional days" keyboardType="number-pad" value={days} onChangeText={setDays} />
      <Text>VAT: {formatGBPCents(preview.vatCents)} · Customer fee: {formatGBPCents(preview.clientFeeCents)}</Text>
      <Text>Additional customer total: {formatGBPCents(preview.totalDueCents)}</Text>
      <Text>Your net for this addition after the 5% tradie fee: {formatGBPCents(preview.netToSellerCents)}</Text>
      <Text variant="bodySmall">Add a short reason, a title and description for every task, and prices with up to two decimal places. The additional total must be £0.50–£10,000, with up to 365 extra days.</Text>
      <Button disabled={!valid || busy || preview.totalDueCents < 50 || preview.totalDueCents > 1000000} mode="contained" onPress={() => void act(async () => {
        const { error } = await supabase.rpc('rpc_propose_scope_change', { p_job_id: job.id, p_reason: reason.trim(), p_items: payload, p_extra_days: Number(days) });
        if (error) throw error;
        setEditing(false); setReason(''); setDays('0'); setLines([blankLine()]);
      })}>Send for customer approval</Button>
      <Button disabled={busy} onPress={() => setEditing(false)}>Cancel</Button>
    </View>}
  </Card.Content></Card>;
}
