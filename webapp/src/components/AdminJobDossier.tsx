import React from 'react';
import { View } from 'react-native';
import { Card, Text } from '../ui/paper';
import { formatGBPCents } from '../utils/money';

export default function AdminJobDossier({ job, records }: { job: any; records: Record<string, any[]> }) {
  const money = (value: any) => formatGBPCents(Number(value || 0));
  const date = (value: any) => value ? new Date(value).toLocaleString('en-GB') : 'Not recorded';
  return <View style={{ gap: 12 }}>
    <Text variant="headlineSmall">Full job record</Text>
    <Text variant="titleMedium">{job.title}</Text>
    <Text>{job.description || 'No description recorded.'}</Text>
    <Text>Parties: Customer and Tradie (identities hidden during review)</Text>
    <Text>Created: {date(job.created_at)} · Status: {job.status}</Text>
    <Text>Planned start: {date(job.planned_start_date)} · Flexibility: {job.flex_days || 0} days</Text>
    <Text>Started: {date(job.start_date)} · End: {date(job.end_date)} · Duration: {job.duration_days} days</Text>
    <Text>Original labour: {money(job.price_cents)} · Materials: {money(job.materials_cents)} · Upfront materials: {money(job.upfront_materials_cents)}</Text>
    <Text>VAT registered: {job.vat_registered ? 'Yes' : 'No'} · VAT rate: {Number(job.vat_rate_bps || 0) / 100}%</Text>
    <Text variant="titleMedium">Original agreed lines</Text>
    {(records.items || []).map(item => <View key={item.id} style={{ gap: 4 }}>
      <Text>{item.title} · {item.qty} × {money(item.price_cents)}</Text>
      {!!item.description && <Text>{item.description}</Text>}
      {!!item.notes && <Text>{item.notes}</Text>}
    </View>)}
    {(records.materials || []).map(item => <Text key={item.id}>Material: {item.title} · {money(item.price_cents)} · {item.description} {item.upfront_requested ? '(requested upfront)' : ''}</Text>)}
    <Text variant="titleMedium">Scope changes and approvals</Text>
    {!(records.changes || []).length && <Text>No scope changes recorded.</Text>}
    {(records.changes || []).map(c => <Card key={c.id} mode="outlined"><Card.Content style={{ gap: 4 }}>
      <Text>{c.reason} · {c.status}</Text>
      {(c.items || []).map((line: any, i: number) => <Text key={i}>{line.title} · {line.qty} × {money(line.price_cents)}</Text>)}
      <Text>Extra days: {c.extra_days} · Work with VAT: {money(c.principal_cents)} · Fee: {money(c.client_fee_cents)} · Total: {money(c.total_cents)}</Text>
      <Text>Proposed by Tradie · {date(c.created_at)}</Text>
      <Text>Reviewed by Customer · {date(c.reviewed_at)} · Funded: {date(c.funded_at)}</Text>
    </Card.Content></Card>)}
    <Text variant="titleMedium">Every payment and release</Text>
    {(records.payments || []).map(p => <Card key={p.id} mode="outlined"><Card.Content style={{ gap: 4 }}>
      <Text>{p.scope_change_id ? 'Extra work' : 'Original job'} · {p.status} · {date(p.created_at)}</Text>
      <Text>Job value: {money(p.principal_cents)} · Customer fee: {money(p.client_fee_cents)} · Paid total: {money(p.total_cents)}</Text>
      <Text>Requested refund: {money(p.customer_refund_requested_cents)} · Refunded: {money(p.customer_refunded_cents)}</Text>
      <Text selectable>Payment: {p.id} · Intent: {p.stripe_payment_intent_id || 'None'} · Charge: {p.stripe_charge_id || 'None'}</Text>
      <Text selectable>Transfer: {p.stripe_transfer_id || 'None'} · Refund: {p.stripe_refund_id || 'None'} · {p.stripe_refund_status || p.provider_status}</Text>
    </Card.Content></Card>)}
    {(records.releases || []).map(r => <Text key={r.id}>Partial release · {r.status} · {money(r.amount_cents)} gross / {money(r.released_amount_cents)} transferred · {r.reason} · {date(r.created_at)}</Text>)}
    {(records.ledgers || []).map(l => <Text key={l.id}>Held: {money(l.held_cents)} · Transferred: {money(l.transferred_cents)} · Refunded: {money(l.refunded_cents)} · Commission: {money(l.commission_cents)} · Payment {l.payment_id}</Text>)}
    <Text variant="titleMedium">Payment processing history</Text>
    {(records.operations || []).map(o => <Text key={o.id}>{date(o.created_at)} · {o.operation_type} · {o.status} · {o.stripe_object_id || ''} {o.last_error || ''}</Text>)}
    <Text variant="titleMedium">Additional job information</Text>
    {Object.entries(job).filter(([key, value]) => !key.startsWith('_') && value != null
      && !['id','title','description','status','price_cents','materials_cents','upfront_materials_cents','vat_registered','vat_rate_bps','client_id','trader_id','created_at','planned_start_date','start_date','end_date','duration_days','flex_days'].includes(key))
      .map(([key, value]) => <Text key={key}>{key.replaceAll('_', ' ')}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>)}
  </View>;
}
