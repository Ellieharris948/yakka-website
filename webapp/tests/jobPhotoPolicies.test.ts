import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260918120000_fix_job_photo_upload_policies.sql',
  'utf8',
);

test('job photo uploads require the authenticated user to be a named job participant', () => {
  assert.match(migration, /create or replace function public\.can_contribute_to_job/);
  assert.match(migration, /p_user_id in \(job\.client_id, job\.trader_id\)/);
  assert.doesNotMatch(migration, /team_accounts|team_members/);
  assert.match(migration, /uploaded_by = auth\.uid\(\)/);
  assert.match(migration, /public\.can_contribute_to_job\(job_id, auth\.uid\(\)\)/);
});

test('job image storage paths bind the job and uploader folders to the policy', () => {
  assert.match(migration, /bucket_id = 'job-images'/);
  assert.match(migration, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/);
  assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] ~\*/);
  assert.match(migration, /\(\(storage\.foldername\(name\)\)\[1\]\)::uuid/);
});
