import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const excludedDirectories = new Set([
  '.git',
  '.cache',
  '.next',
  '.nyc_output',
  '.output',
  '.parcel-cache',
  '.turbo',
  '.vite',
  'artifacts',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
]);
const textExtensions = new Set([
  '.astro', '.bash', '.cjs', '.css', '.fish', '.gql', '.graphql', '.html', '.ini', '.js', '.json', '.jsx',
  '.less', '.lock', '.md', '.mdx', '.mjs', '.npmrc', '.sass', '.scss', '.sh', '.sql', '.svelte', '.svg',
  '.toml', '.ts', '.tsx', '.txt', '.vue', '.webmanifest', '.xml', '.yaml', '.yml', '.zsh',
]);
const textFileNames = new Set(['.gitignore', '.npmrc', 'Dockerfile', 'LICENSE', 'README']);

// Keep restricted titles out of the repository itself while still checking for them.
const restrictedTerms = [
  [97, 113, 117, 97, 97, 113, 117, 97],
  [119, 101, 116, 114, 105, 120],
  [105, 113, 0x30b2, 0x30fc, 0x30e0],
].map((codePoints) => String.fromCodePoint(...codePoints));

function normalizeForComparison(value) {
  return decodeRepresentations(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{White_Space}\p{P}\p{S}\p{Cf}_]+/gu, '');
}

function decodeRepresentations(value) {
  return value
    .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (_, hex) => safeCodePoint(hex))
    .replace(/\\u([0-9a-f]{4})/giu, (_, hex) => safeCodePoint(hex))
    .replace(/\\x([0-9a-f]{2})/giu, (_, hex) => safeCodePoint(hex))
    .replace(/&#x([0-9a-f]{1,6});?/giu, (_, hex) => safeCodePoint(hex))
    .replace(/&#([0-9]{1,7});?/gu, (_, decimal) => safeCodePoint(Number(decimal).toString(16)))
    .replace(/&(tab|newline|nbsp);/giu, ' ');
}

function safeCodePoint(hex) {
  const value = Number.parseInt(hex, 16);
  return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
}

function isTextFile(name) {
  return textFileNames.has(name) || textExtensions.has(extname(name).toLocaleLowerCase('en-US'));
}

const files = [];
const paths = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    paths.push(path);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(path);
    } else if (entry.isFile()) files.push({ path, text: isTextFile(entry.name) });
  }
}

await walk(root);
const normalizedRestrictedTerms = restrictedTerms.map(normalizeForComparison);
for (const path of paths) {
  const normalizedPath = normalizeForComparison(relative(root, path));
  if (normalizedRestrictedTerms.some((term) => normalizedPath.includes(term))) throw new Error(`独自名称検査に失敗しました: ${relative(root, path)}`);
}
let textFileCount = 0;
for (const file of files) {
  const bytes = await readFile(file.path);
  const candidates = file.text ? [bytes.toString('utf8')] : [bytes.toString('utf8'), bytes.toString('latin1')];
  if (file.text) textFileCount += 1;
  if (candidates.map(normalizeForComparison).some((text) => normalizedRestrictedTerms.some((term) => text.includes(term)))) {
    throw new Error(`独自名称検査に失敗しました: ${relative(root, file.path)}`);
  }
}
console.log(`独自名称検査を完了しました（テキスト${textFileCount}件、全ファイル${files.length}件）。`);
