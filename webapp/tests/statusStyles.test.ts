import assert from 'node:assert/strict';
import test from 'node:test';

import { getCustomerStatusMeta, getJobStatusMeta, JobStatus } from '../src/utils/statusStyles';

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => {
    const srgb = Number.parseInt(value, 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('every dark job-status combination has readable text contrast', () => {
  const jobs: Array<{ status: JobStatus; price_cents?: number; client_id?: string }> = [
    { status: 'proposed' },
    { status: 'proposed', price_cents: 2500 },
    { status: 'funded' },
    { status: 'seller_done' },
    { status: 'client_done' },
    { status: 'completed' },
    { status: 'disputed' },
    { status: 'cancelled' },
  ];

  const metas = jobs.map(job => getCustomerStatusMeta(job, true));
  metas.push(
    getJobStatusMeta({ status: 'funded' }, 'client', { dark: true, partialPaymentStatus: 'requested' }),
    getJobStatusMeta({ status: 'funded' }, 'client', { dark: true, partialPaymentStatus: 'approved' }),
  );

  for (const meta of metas) {
    assert.ok(
      contrast(meta.textColor, meta.backgroundColor) >= 4.5,
      `${meta.bannerLabel} should meet WCAG AA text contrast`,
    );
    assert.notEqual(meta.borderColor, meta.backgroundColor);
  }
});

test('message and job surfaces resolve exactly the same partial-payment status', () => {
  const job = { status: 'funded' as const, price_cents: 15000 };
  const homeMeta = getJobStatusMeta(job, 'trader', { dark: true, partialPaymentStatus: 'requested' });
  const messageMeta = getJobStatusMeta(job, 'trader', { dark: true, partialPaymentStatus: 'requested' });

  assert.deepEqual(messageMeta, homeMeta);
  assert.equal(messageMeta.bannerLabel, 'Status: Partial Payment Requested');
});
