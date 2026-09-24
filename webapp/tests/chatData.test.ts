import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatChatClock,
  formatChatListTime,
  normalizeChatJob,
  normalizeChatMessage,
} from '../src/utils/chatData';

test('chat jobs are normalised before native screens render them', () => {
  const job = normalizeChatJob({
    id: ' job-1 ',
    status: 'funded',
    trader_id: 'trader-1',
    client_id: null,
    title: null,
    price_cents: '2500',
    flex_days: '3',
    started_trader: true,
    started_client: 'false',
  });

  assert.ok(job);
  assert.equal(job.id, 'job-1');
  assert.equal(job.title, 'Yakka job');
  assert.equal(job.price_cents, 2500);
  assert.equal(job.flex_days, 3);
  assert.equal(job.started_trader, true);
  assert.equal(job.started_client, null);
});

test('legacy declined jobs are safe while malformed job rows are rejected', () => {
  assert.equal(normalizeChatJob({ id: 'legacy', status: 'declined' })?.status, 'cancelled');
  assert.equal(normalizeChatJob({ id: '', status: 'funded' }), null);
  assert.equal(normalizeChatJob({ id: 'bad-status', status: 'mystery' }), null);
  assert.equal(normalizeChatJob(null), null);
});

test('invalid message timestamps cannot reach native date formatting', () => {
  const message = normalizeChatMessage({
    id: 'message-1',
    sender_id: 'person-1',
    body: 'Hello',
    created_at: 'not-a-date',
  });

  assert.ok(message);
  assert.equal(message.text, 'Hello');
  assert.equal(message.createdAt.getTime(), 0);
  assert.equal(formatChatClock('not-a-date'), '');
  assert.equal(normalizeChatMessage({ created_at: new Date().toISOString() }), null);
});

test('chat timestamps use deterministic Hermes-safe formatting', () => {
  const morning = new Date(2026, 7, 19, 9, 7);
  const sameDay = new Date(2026, 7, 19, 18, 30);
  const earlierDay = new Date(2026, 0, 3, 18, 30);

  assert.equal(formatChatClock(morning), '09:07');
  assert.equal(formatChatListTime(morning, sameDay), '09:07');
  assert.equal(formatChatListTime(earlierDay, sameDay), '03 Jan');
  assert.equal(formatChatListTime(null, sameDay), '');
});
