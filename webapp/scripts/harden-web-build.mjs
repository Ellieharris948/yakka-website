import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(projectDirectory, 'dist/index.html');
const html = await readFile(indexPath, 'utf8');

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://*.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityMarkup = [
  `    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
  '    <meta name="referrer" content="no-referrer" />',
].join('\n');

if (html.includes('http-equiv="Content-Security-Policy"')) {
  throw new Error('Refusing to add a duplicate Content Security Policy.');
}

if (!html.includes('</head>')) throw new Error('Could not locate the generated document head.');
await writeFile(indexPath, html.replace('</head>', `\n${securityMarkup}\n  </head>`), 'utf8');
