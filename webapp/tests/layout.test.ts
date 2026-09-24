import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRAND_NATIVE_APP_MAX_WIDTH,
  getResponsiveControlHeight,
  getResponsiveLayoutScale,
  getResponsiveLayoutValue,
  getResponsiveScreenGutter,
} from '../src/utils/layout';

test('screen gutters stay identical across practical device widths', () => {
  assert.equal(getResponsiveScreenGutter(320), 16);
  assert.equal(getResponsiveScreenGutter(360), 16);
  assert.equal(getResponsiveScreenGutter(390), 16);
  assert.equal(getResponsiveScreenGutter(430), 16);
  assert.equal(getResponsiveScreenGutter(768), 16);
  assert.equal(getResponsiveScreenGutter(Number.NaN), 16);
});

test('layout and controls use one canonical logical size on every device', () => {
  assert.equal(getResponsiveLayoutScale(320), 1);
  assert.equal(getResponsiveLayoutScale(360), 1);
  assert.equal(getResponsiveLayoutScale(390), 1);
  assert.equal(getResponsiveLayoutScale(430), 1);
  assert.equal(getResponsiveLayoutScale(768), 1);
  assert.equal(getResponsiveLayoutScale(0), 1);

  assert.equal(getResponsiveControlHeight(320), 50);
  assert.equal(getResponsiveControlHeight(390), 50);
  assert.equal(getResponsiveControlHeight(430), 50);
  assert.equal(getResponsiveLayoutValue(16, 390), 16);
  assert.equal(BRAND_NATIVE_APP_MAX_WIDTH, 520);
});
