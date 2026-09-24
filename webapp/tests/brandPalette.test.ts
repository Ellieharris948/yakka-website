import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const brandPalette = new Set([
  '#000000',
  '#581a1f',
  '#6a292e',
  '#f4f4ec',
  '#fdb087',
  '#fe4d00',
  '#fefefe',
]);

test('the shared brand theme uses the July 2026 palette exactly', () => {
  const theme = readFileSync(join(process.cwd(), 'src', 'theme.ts'), 'utf8');
  const lightBlock = theme.match(/const LIGHT_BRAND_COLORS = {([\s\S]*?)} as const;/)?.[1] || '';
  const actionColours = readFileSync(join(process.cwd(), 'src', 'utils', 'brandPresentation.ts'), 'utf8');
  const actionBlock = actionColours.match(/export const BRAND_ACTION_COLORS = {([\s\S]*?)} as const;/)?.[1] || '';

  for (const block of [lightBlock, actionBlock]) {
    const colours = [...block.matchAll(/#[0-9a-f]{6}/gi)].map(match => match[0].toLowerCase());
    assert.ok(colours.length > 0);
    for (const colour of colours) assert.ok(brandPalette.has(colour), `${colour} is outside the YAKKA palette`);
  }
});

test('legacy approximations of the YAKKA core colours are gone from app UI files', () => {
  const roots = [join(process.cwd(), 'src'), join(process.cwd(), 'App.tsx')];
  const files: string[] = [];
  const visit = (path: string) => {
    if (/\.(?:ts|tsx)$/.test(path)) {
      files.push(path);
      return;
    }
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      visit(join(path, entry.name));
    }
  };
  roots.forEach(visit);

  const legacy = /#(?:5a191f|6a292f|fe4c02|fdaf88)\b/i;
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), legacy, `${file} still uses an approximate brand colour`);
  }
});
