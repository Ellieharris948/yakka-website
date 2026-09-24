import assert from 'node:assert/strict';
import test from 'node:test';
import { BRAND_ACTION_COLORS, getBrandButtonColors, getBrandFontFamily } from '../src/utils/brandPresentation';

function contrastRatio(first: string, second: string) {
  const luminance = (hex: string) => {
    const [red, green, blue] = hex.slice(1).match(/../g)!.map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('action and link colors remain readable at the smallest supported text size', () => {
  for (const [foreground, background] of [
    [BRAND_ACTION_COLORS.onFilled, BRAND_ACTION_COLORS.filled],
    [BRAND_ACTION_COLORS.lightLink, '#f4f4ec'],
    [BRAND_ACTION_COLORS.lightLink, '#fefefe'],
    [BRAND_ACTION_COLORS.darkLink, '#581a1f'],
    [BRAND_ACTION_COLORS.darkLink, '#6a292e'],
    [BRAND_ACTION_COLORS.onDarkPrimary, BRAND_ACTION_COLORS.darkLink],
  ]) {
    assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} needs normal-text contrast`);
  }
});

test('legacy orange buttons and new actions use the same readable filled treatment', () => {
  for (const dark of [false, true]) {
    const expected = { buttonColor: BRAND_ACTION_COLORS.filled, textColor: BRAND_ACTION_COLORS.onFilled };
    assert.deepEqual(getBrandButtonColors({ mode: 'contained', dark }), expected);
    assert.deepEqual(getBrandButtonColors({ mode: 'contained', dark, buttonColor: '#FE4D00', textColor: '#ffffff' }), expected);
    assert.equal(getBrandButtonColors({ mode: 'text', dark, textColor: '#fe4d00' }).textColor,
      dark ? BRAND_ACTION_COLORS.darkLink : BRAND_ACTION_COLORS.lightLink);
  }
  assert.deepEqual(getBrandButtonColors({ mode: 'contained', dark: true, buttonColor: '#93000a', textColor: '#ffdad6' }),
    { buttonColor: '#93000a', textColor: '#ffdad6' });
  for (const [dark, buttonColor] of [[false, '#fdb087'], [true, '#fdb087']] as const) {
    const result = getBrandButtonColors({ mode: 'contained', dark, buttonColor, textColor: '#fe4d00' });
    assert.ok(contrastRatio(result.textColor!, buttonColor) >= 4.5, 'soft buttons also need readable labels');
  }
});

test('explicit text weights select the bundled font faces without synthetic weight', () => {
  assert.equal(getBrandFontFamily(undefined, 'Satoshi-Bold'), 'Satoshi-Bold');
  assert.equal(getBrandFontFamily(undefined, 'Satoshi-Regular'), 'Satoshi-Regular');
  assert.equal(getBrandFontFamily('normal', 'Satoshi-Bold'), 'Satoshi-Regular');
  assert.equal(getBrandFontFamily('500', 'Satoshi-Regular'), 'Satoshi-Regular');
  assert.equal(getBrandFontFamily('600', 'Satoshi-Regular'), 'Satoshi-Bold');
  assert.equal(getBrandFontFamily(700, 'Satoshi-Regular'), 'Satoshi-Bold');
  assert.equal(getBrandFontFamily('bold', 'Satoshi-Regular'), 'Satoshi-Bold');
});
