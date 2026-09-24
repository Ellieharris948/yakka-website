import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parseRecoveryUrl, passwordResetRedirect, passwordValidationError } from '../src/utils/passwords';

test('new passwords require a matching 12-character passphrase', () => {
  assert.ok(passwordValidationError('short', 'short'));
  assert.ok(passwordValidationError('long enough password', 'not matching'));
  assert.equal(passwordValidationError('long enough password', 'long enough password'), null);
  assert.ok(passwordValidationError('a'.repeat(129), 'a'.repeat(129)));
});
test('password reset redirects stay on the current platform', () => {
  assert.equal(passwordResetRedirect(), 'yakka://reset-password');
  assert.equal(passwordResetRedirect('https://yakka.app'), 'https://yakka.app/reset-password');
  assert.equal(passwordResetRedirect('https://yakka.app', '/app/?reset-password=1'), 'https://yakka.app/app/?reset-password=1');
});
test('only a recovery link with both tokens can start password recovery', () => {
  const tokens = 'access_token=test-access&refresh_token=test-refresh&type=recovery';
  assert.deepEqual(parseRecoveryUrl(`yakka://reset-password#${tokens}`)?.tokens, { access_token: 'test-access', refresh_token: 'test-refresh' });
  assert.ok(parseRecoveryUrl(`https://yakka.app/reset-password#${tokens}`)?.tokens);
  assert.ok(parseRecoveryUrl(`https://yakka.app/app/?reset-password=1#${tokens}`)?.tokens);
  assert.ok(parseRecoveryUrl(`yakka://reset-password?${tokens}`)?.tokens);
  assert.equal(parseRecoveryUrl(`yakka://payment/success#${tokens}`), null);
  assert.equal(parseRecoveryUrl('bad url'), null);
  assert.ok(parseRecoveryUrl('yakka://reset-password#type=signup&access_token=x&refresh_token=y')?.error);
  assert.ok(parseRecoveryUrl('yakka://reset-password#type=recovery&access_token=x')?.error);
  assert.ok(parseRecoveryUrl('yakka://reset-password#error_code=otp_expired')?.error);
});
test('Android release targets API 36 and keeps Expo/native versions aligned', () => {
  const properties = fs.readFileSync('android/gradle.properties', 'utf8');
  const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
  const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
  assert.match(properties, /^android.compileSdkVersion=36$/m);
  assert.match(properties, /^android.targetSdkVersion=36$/m);
  assert.match(gradle, new RegExp(`versionCode ${config.android.versionCode}\\b`));
  assert.ok(gradle.includes(`versionName "${config.version}"`));
  assert.match(fs.readFileSync('android/build.gradle', 'utf8'), /com.android.tools.build:gradle:8.10.1/);
});
