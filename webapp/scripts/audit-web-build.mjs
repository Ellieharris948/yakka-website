import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = resolve(projectDirectory, 'dist');

async function filesWithin(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const absolutePath = resolve(directory, entry.name);
    return entry.isDirectory() ? filesWithin(absolutePath) : [absolutePath];
  }));
  return nested.flat();
}

function parsePrivateEnvironmentValues(source) {
  return source
    .split(/\r?\n/)
    .map(line => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(match => ({ name: match[1], value: match[2].trim().replace(/^['"]|['"]$/g, '') }))
    .filter(({ name, value }) =>
      !name.startsWith('EXPO_PUBLIC_') &&
      /(?:SECRET|TOKEN|PRIVATE|PASSWORD|SERVICE_ROLE|API_KEY|PROFILE_ID)$/.test(name) &&
      value.length >= 8 &&
      !/^(your_|replace_|example|test_|change-me|localhost)/i.test(value),
    );
}

const files = await filesWithin(buildDirectory);
const sourceMaps = files.filter(file => extname(file) === '.map');
if (sourceMaps.length) throw new Error('Security audit failed: production source maps were generated.');

const inspectableFiles = files.filter(file => /\.(?:js|html|json|css)$/i.test(file));
const productionText = (await Promise.all(inspectableFiles.map(file => readFile(file, 'utf8')))).join('\n');
const indexHtml = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');

if (!indexHtml.includes('http-equiv="Content-Security-Policy"') || !indexHtml.includes('content="no-referrer"')) {
  throw new Error('Security audit failed: browser security metadata is missing.');
}

if (/\bconsole\s*\.\s*[A-Za-z]+\s*\(/.test(productionText)) {
  throw new Error('Security audit failed: console calls remain in the production bundle.');
}

const credentialPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
if (credentialPatterns.some(pattern => pattern.test(productionText))) {
  throw new Error('Security audit failed: a server credential pattern was found in the production bundle.');
}

for (const relativePath of ['.env', 'supabase/.env']) {
  try {
    const environmentText = await readFile(resolve(projectDirectory, relativePath), 'utf8');
    for (const { name, value } of parsePrivateEnvironmentValues(environmentText)) {
      if (productionText.includes(value)) {
        throw new Error(`Security audit failed: private environment value ${name} was embedded in the production bundle.`);
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
