import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  clampFontScale,
  normalizeFontScale,
} from '../src/utils/accessibility';

const screenDirectory = join(process.cwd(), 'src', 'screens');
const screenFiles = readdirSync(screenDirectory)
  .filter(file => file.endsWith('.tsx'))
  .map(file => join(screenDirectory, file));
const componentDirectory = join(process.cwd(), 'src', 'components');
const componentFiles = readdirSync(componentDirectory)
  .filter(file => file.endsWith('.tsx'))
  .map(file => join(componentDirectory, file));

test('screens use the shared text, button and field primitives', () => {
  const paperImport = /import\s*{([\s\S]*?)}\s*from\s*['"]react-native-paper['"]/g;

  for (const file of screenFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(paperImport)) {
      const imports = match[1].split(',').map(value => value.trim());
      const bypassed = imports.filter(value => ['Button', 'Text', 'TextInput'].includes(value));
      assert.deepEqual(bypassed, [], `${file} bypasses the shared UI adapter`);
    }
  }
});

test('screens never opt back into uppercase button labels', () => {
  for (const file of screenFiles) {
    const source = readFileSync(file, 'utf8');
    assert.equal(/uppercase\s*=\s*{?\s*true\s*}?/.test(source), false, `${file} enables uppercase labels`);
  }
});

test('the theme exposes exactly three named typography tiers', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'theme.ts'), 'utf8');
  const tierBlock = source.match(/export const BRAND_TYPE_TIERS = {([\s\S]*?)} as const;/)?.[1] || '';
  const tiers = [...tierBlock.matchAll(/^\s{2}(\w+):/gm)].map(match => match[1]);

  assert.deepEqual(tiers, ['heading', 'subheading', 'body']);
});

test('the mobile typography tiers stay compact and ordered', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'theme.ts'), 'utf8');
  const tierBlock = source.match(/export const BRAND_TYPE_TIERS = {([\s\S]*?)} as const;/)?.[1] || '';
  const sizes = Object.fromEntries(
    [...tierBlock.matchAll(/^\s{2}(\w+):\s*{\s*fontSize:\s*(\d+)/gm)]
      .map(match => [match[1], Number(match[2])]),
  );

  assert.deepEqual(sizes, { heading: 22, subheading: 17, body: 15 });
});

test('shared text controls do not apply a second device font multiplier', () => {
  for (const file of ['BrandText.tsx', 'BrandButton.tsx', 'BrandTextInput.tsx']) {
    const source = readFileSync(join(process.cwd(), 'src', 'components', file), 'utf8');
    assert.match(source, /maxFontSizeMultiplier={1}/, `${file} permits device-specific double scaling`);
  }

  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');
  assert.match(app, /allowFontScaling:\s*false/);
  assert.match(readFileSync(join(componentDirectory, 'BrandText.tsx'), 'utf8'), /allowFontScaling={false}/);
  assert.match(readFileSync(join(componentDirectory, 'BrandTextInput.tsx'), 'utf8'), /allowFontScaling={false}/);
});

test('font slider supports a bounded 80 to 160 percent range', () => {
  assert.equal(MIN_FONT_SCALE, 0.8);
  assert.equal(MAX_FONT_SCALE, 1.6);
  assert.equal(FONT_SCALE_STEP, 0.05);
  assert.equal(DEFAULT_FONT_SCALE, 1);
  assert.equal(clampFontScale(0.1), 0.8);
  assert.equal(clampFontScale(1.37), 1.35);
  assert.equal(clampFontScale(2), 1.6);
});

test('font slider defaults safely and migrates old named presets', () => {
  assert.equal(normalizeFontScale(null), 1);
  assert.equal(normalizeFontScale(''), 1);
  assert.equal(normalizeFontScale('not-a-size'), 1);
  assert.equal(normalizeFontScale('small'), 0.9);
  assert.equal(normalizeFontScale('standard'), 1);
  assert.equal(normalizeFontScale('large'), 1.1);
  assert.equal(normalizeFontScale('1.57'), 1.55);
});

test('shared controls use the bounded responsive control height', () => {
  const button = readFileSync(join(process.cwd(), 'src', 'components', 'BrandButton.tsx'), 'utf8');
  const input = readFileSync(join(process.cwd(), 'src', 'components', 'BrandTextInput.tsx'), 'utf8');
  const segmented = readFileSync(join(process.cwd(), 'src', 'components', 'SwipeSegmentedControl.tsx'), 'utf8');
  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');

  assert.match(button, /minHeight:\s*getResponsiveControlHeight\(width\)/);
  assert.match(input, /minHeight:\s*getResponsiveControlHeight\(width\)/);
  assert.match(segmented, /minHeight:\s*52/);
  assert.match(app, /height:\s*useDesktopNavigation\s*\?\s*["']100%["']\s*:\s*Math\.max\(72,\s*44\s*\+\s*theme\.fonts\.labelSmall\.lineHeight\)\s*\+\s*bottomInset/);
});

test('flat shared fields never pass Paper outline styles to the native text input', () => {
  const input = readFileSync(join(process.cwd(), 'src', 'components', 'BrandTextInput.tsx'), 'utf8');

  assert.match(input, /mode\s*=\s*['"]flat['"]/);
  assert.match(input, /mode\s*===\s*['"]outlined['"]\s*\?\s*{\s*outlineStyle:/);
  assert.match(input, /{\.\.\.outlinedProps}/);
  assert.doesNotMatch(input, /outlineStyle=\{/);
});

test('shared buttons wrap labels and keep icons in the same aligned row', () => {
  const button = readFileSync(join(process.cwd(), 'src', 'components', 'BrandButton.tsx'), 'utf8');
  assert.match(button, /flexDirection: 'row'/);
  assert.match(button, /flexShrink: 1/);
  assert.match(button, /contentStyle/);
  assert.doesNotMatch(button, /numberOfLines=/);
  assert.doesNotMatch(button, /<PaperButton/);
});

test('the selected percentage reaches theme text and navigation labels', () => {
  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');
  const settings = readFileSync(join(process.cwd(), 'src', 'screens', 'Settings.tsx'), 'utf8');

  assert.match(app, /scaleThemeFonts\([^,]+,\s*fontScale\)/);
  assert.match(app, /fontSize:\s*useDesktopNavigation\s*\?\s*17\s*:\s*theme\.fonts\.labelSmall\.fontSize/);
  assert.match(app, /lineHeight:\s*useDesktopNavigation\s*\?\s*24\s*:\s*theme\.fonts\.labelSmall\.lineHeight/);
  assert.match(settings, /accessibilityRole="adjustable"/);
  assert.match(settings, /MIN_FONT_SCALE/);
  assert.match(settings, /MAX_FONT_SCALE/);
});

test('large text keeps the complete job status outside the back-header row', () => {
  const header = readFileSync(join(process.cwd(), 'src', 'components', 'BrandScreenHeader.tsx'), 'utf8');

  assert.match(header, /fontScale\s*>=\s*1\.3/);
  assert.match(header, /trailing={stackChip\s*\?\s*undefined\s*:\s*statusChip}/);
  assert.match(header, /maxWidth:\s*stackChip\s*\?\s*['"]100%['"]\s*:\s*['"]38%['"]/);
});

test('signed-out onboarding uses the same branded header and back control as app pages', () => {
  const onboarding = readFileSync(join(process.cwd(), 'src', 'screens', 'Onboarding.tsx'), 'utf8');
  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');

  assert.match(onboarding, /<BrandHeaderBar/);
  assert.match(onboarding, /<PageBackHeader/);
  assert.match(onboarding, /backgroundColor:\s*theme\.colors\.surface/);
  assert.doesNotMatch(onboarding, /<LinearGradient/);
  assert.match(app, /name="Onboarding"[\s\S]*?options={{ headerShown: false }}/);
  assert.match(app, /name="Join"[\s\S]*?options={{ headerShown: false }}/);
});

test('all arrow back buttons come from the shared back-header component', () => {
  const arrowOwners = [...screenFiles, ...componentFiles]
    .filter(file => /icon=["']arrow-left["']/.test(readFileSync(file, 'utf8')));

  assert.deepEqual(arrowOwners, [join(componentDirectory, 'PageBackHeader.tsx')]);
});

test('native stays phone-sized while web can use an accessible desktop viewport', () => {
  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');
  const bottomCurtain = readFileSync(join(componentDirectory, 'BottomCurtain.tsx'), 'utf8');
  const flowCurtain = readFileSync(join(componentDirectory, 'FlowCurtain.tsx'), 'utf8');

  assert.match(app, /maxWidth:\s*Platform\.OS\s*===\s*['"]web['"]\s*\?\s*undefined\s*:\s*BRAND_NATIVE_APP_MAX_WIDTH/);
  assert.match(app, /<View style={styles\.nativeViewport}>/);
  assert.match(bottomCurtain, /maxWidth:\s*BRAND_NATIVE_APP_MAX_WIDTH/);
  assert.match(flowCurtain, /maxWidth:\s*BRAND_NATIVE_APP_MAX_WIDTH/);
});
