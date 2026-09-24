import assert from 'node:assert/strict';
import test from 'node:test';

import { getJobProgressSteps } from '../src/utils/jobProgress';

test('job progress exposes every customer-visible stage in order', () => {
  assert.deepEqual(
    getJobProgressSteps('in_progress').map(step => [step.label, step.state]),
    [
      ['Proposal', 'complete'],
      ['Accepted', 'complete'],
      ['Paid', 'complete'],
      ['In progress', 'current'],
      ['Done', 'upcoming'],
    ],
  );
});

test('exceptional job states are named on the rail', () => {
  assert.equal(getJobProgressSteps('disputed').find(step => step.state === 'current')?.label, 'Disputed');
  assert.equal(getJobProgressSteps('cancelled').find(step => step.state === 'current')?.label, 'Cancelled');
  assert.equal(getJobProgressSteps('seller_done').find(step => step.state === 'current')?.label, 'Sign-off');
  assert.equal(getJobProgressSteps('completed').at(-1)?.state, 'current');
});
