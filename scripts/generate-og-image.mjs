import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'public/og-image.svg');
const copy = resolve(root, 'dist/og-image.svg');
try {
  await copyFile(source, copy);
} catch {
  // The build directory may not exist when the script is called alone.
}
