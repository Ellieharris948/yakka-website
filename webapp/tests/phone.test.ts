import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidUkMobile, normalizeUkPhone } from '../src/utils/phone';

test('normalises common UK mobile formats to one E.164 value', () => {
  const expected = '+447123456789';
  assert.equal(normalizeUkPhone('07123 456 789'), expected);
  assert.equal(normalizeUkPhone('+44 7123 456789'), expected);
  assert.equal(normalizeUkPhone('0044 7123 456789'), expected);
});

test('accepts UK mobiles and rejects incomplete or non-mobile values', () => {
  assert.equal(isValidUkMobile('07123 456789'), true);
  assert.equal(isValidUkMobile('020 7946 0018'), false);
  assert.equal(isValidUkMobile('07123'), false);
});
