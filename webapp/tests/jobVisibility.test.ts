import assert from 'node:assert/strict';
import test from 'node:test';

import { isPastJobForViewer, isUnstartedJobPastStartWindow } from '../src/utils/jobVisibility';

test('keeps an unstarted job live through the full planned flex window', () => {
  const job = { status: 'funded', planned_start_date: '2026-08-10', flex_days: 2, start_date: null };

  assert.equal(isUnstartedJobPastStartWindow(job, '2026-08-12'), false);
  assert.equal(isPastJobForViewer(job, 'client', '2026-08-12'), false);
});

test('moves an unstarted job to past messages after the flex window', () => {
  const job = { status: 'funded', planned_start_date: '2026-08-10', flex_days: 2, start_date: null };

  assert.equal(isUnstartedJobPastStartWindow(job, '2026-08-13'), true);
  assert.equal(isPastJobForViewer(job, 'client', '2026-08-13'), true);
  assert.equal(isPastJobForViewer(job, 'trader', '2026-08-13'), true);
});

test('does not archive a job that actually started', () => {
  const job = { status: 'in_progress', planned_start_date: '2026-08-10', flex_days: 1, start_date: '2026-08-11' };

  assert.equal(isUnstartedJobPastStartWindow(job, '2026-08-19'), false);
  assert.equal(isPastJobForViewer(job, 'client', '2026-08-19'), false);
});
