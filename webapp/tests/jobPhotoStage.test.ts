import assert from 'node:assert/strict';
import test from 'node:test';
import { inferJobPhotoStage } from '../src/utils/jobPhotoStage';

test('job photos are categorised automatically from job progress', () => {
  assert.equal(inferJobPhotoStage({ status: 'funded', start_date: null }), 'before');
  assert.equal(inferJobPhotoStage({ status: 'in_progress', start_date: '2026-09-18' }), 'progress');
  assert.equal(inferJobPhotoStage({ status: 'seller_done', start_date: '2026-09-18' }), 'after');
  assert.equal(inferJobPhotoStage({ status: 'completed', start_date: '2026-09-18' }), 'after');
});

test('the completion action always opens completed-work photos', () => {
  assert.equal(inferJobPhotoStage({ status: 'in_progress', start_date: '2026-09-18' }, 'completion'), 'after');
});
