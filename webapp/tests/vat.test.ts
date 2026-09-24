import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  isValidVatRegistrationNumber,
  normalizeVatRegistrationNumber,
  UK_VAT_RATE_BPS,
  VAT_NUMBER_CHECK_URL,
} from '../src/utils/vat';

test('formats a standard UK VAT registration number', () => {
  assert.equal(normalizeVatRegistrationNumber('gb123456789'), 'GB 123 4567 89');
});

test('accepts standard and branch UK VAT registration numbers', () => {
  assert.equal(isValidVatRegistrationNumber('GB 123 4567 89'), true);
  assert.equal(isValidVatRegistrationNumber('123456789001'), true);
  assert.equal(isValidVatRegistrationNumber('12345'), false);
});

test('VAT is fixed at 20% and customers can verify it before final payment', () => {
  assert.equal(UK_VAT_RATE_BPS, 2_000);
  assert.equal(VAT_NUMBER_CHECK_URL, 'https://www.gov.uk/check-uk-vat-number');

  const onboarding = readFileSync(join(process.cwd(), 'src', 'screens', 'Onboarding.tsx'), 'utf8');
  const payment = readFileSync(join(process.cwd(), 'src', 'screens', 'Payment.tsx'), 'utf8');

  assert.match(onboarding, /VAT registered\?/);
  assert.match(onboarding, /vat_registration_number:/);
  assert.match(payment, /Check the tradie(?:&apos;|')s VAT registration/);
  assert.match(payment, /Check VAT number on GOV\.UK/);
  assert.match(payment, /VAT_NUMBER_CHECK_URL/);
});
