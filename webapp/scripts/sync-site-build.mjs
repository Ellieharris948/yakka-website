import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(projectDirectory, 'dist');
const websiteDirectory = resolve(projectDirectory, '..');
const outputDirectory = resolve(websiteDirectory, 'app');

if (outputDirectory !== resolve(websiteDirectory, 'app')) {
  throw new Error(`Refusing to replace unexpected output directory: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });

console.log(`Synced the web app build to ${outputDirectory}`);
