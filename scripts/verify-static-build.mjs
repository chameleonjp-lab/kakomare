import { readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';

const root = resolve(process.cwd(), 'dist');
const publicUrl = new URL('https://chameleonjp-lab.github.io/kakomare/');
const supportedOgpTypes = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'giu'))].map((match) => match[0]);
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu').exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

function linkByRel(html, relation) {
  return tags(html, 'link').find((tag) => attribute(tag, 'rel')?.toLocaleLowerCase('en-US').split(/\s+/u).includes(relation));
}

function metaContent(html, property) {
  const tag = tags(html, 'meta').find((candidate) => {
    const key = attribute(candidate, 'property') ?? attribute(candidate, 'name');
    return key?.toLocaleLowerCase('en-US') === property;
  });
  return tag ? attribute(tag, 'content') : null;
}

function localPathForReference(reference, label) {
  let url;
  try {
    url = new URL(reference, publicUrl);
  } catch {
    throw new Error(`${label}のURLが不正です。`);
  }
  if (url.origin !== publicUrl.origin || !url.pathname.startsWith(publicUrl.pathname)) {
    throw new Error(`${label}が/kakomare/配下を参照していません: ${reference}`);
  }
  const path = resolve(root, decodeURIComponent(url.pathname.slice(publicUrl.pathname.length)));
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`${label}が公開ディレクトリ外を参照しています。`);
  return path;
}

async function requireNonEmptyFile(reference, label) {
  const path = localPathForReference(reference, label);
  const information = await stat(path).catch(() => null);
  if (!information?.isFile()) throw new Error(`${label}の参照先がありません: ${relative(root, path)}`);
  if (information.size <= 0) throw new Error(`${label}の参照先が空です: ${relative(root, path)}`);
  return path;
}

function hasSignature(bytes, signature, offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function verifyPng(bytes) {
  if (!hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw new Error('OGP画像のPNG署名が不正です。');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bytesPerPixel = 0;
  let sawHeader = false;
  let sawEnd = false;
  const imageData = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('OGP画像のPNGチャンクが途中で切れています。');
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('OGP画像のPNGチャンク長が不正です。');
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== expectedCrc) throw new Error(`OGP画像の${type}チャンクCRCが不正です。`);
    if (!sawHeader && type !== 'IHDR') throw new Error('OGP画像の先頭チャンクがIHDRではありません。');
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) throw new Error('OGP画像のIHDRチャンクが不正です。');
      sawHeader = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('OGP画像は8bit RGBAの非インターレースPNGにしてください。');
      bytesPerPixel = 4;
    } else if (type === 'IDAT') imageData.push(data);
    else if (type === 'IEND') {
      if (length !== 0) throw new Error('OGP画像のIENDチャンクが不正です。');
      sawEnd = true;
      offset = end;
      break;
    }
    offset = end;
  }
  if (!sawHeader || imageData.length === 0 || !sawEnd || offset !== bytes.length) throw new Error('OGP画像に必要なPNGチャンクがありません。');
  if (width !== 1200 || height !== 630) throw new Error(`OGP画像の寸法が1200x630ではありません: ${width}x${height}`);
  let raw;
  try {
    raw = inflateSync(Buffer.concat(imageData));
  } catch {
    throw new Error('OGP画像の圧縮データを展開できません。');
  }
  const stride = width * bytesPerPixel + 1;
  if (raw.length !== stride * height) throw new Error('OGP画像の画素データ長が寸法と一致しません。');
  for (let row = 0; row < height; row += 1) if (raw[row * stride] > 4) throw new Error('OGP画像のPNGフィルター値が不正です。');
  return { width, height };
}

async function verifyOgpImage(path, extension) {
  const bytes = await readFile(path);
  if (extension === '.png') return verifyPng(bytes);
  const valid = extension === '.png'
    ? false
    : extension === '.jpg' || extension === '.jpeg'
      ? hasSignature(bytes, [0xff, 0xd8, 0xff])
      : extension === '.gif'
        ? hasSignature(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasSignature(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
        : hasSignature(bytes, [0x52, 0x49, 0x46, 0x46]) && hasSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  if (!valid) throw new Error(`OGP画像の内容が${extension}形式ではありません。`);
  return null;
}

const indexPath = resolve(root, 'index.html');
const indexInformation = await stat(indexPath).catch(() => null);
if (!indexInformation?.isFile() || indexInformation.size <= 0) throw new Error('dist/index.htmlがないか空です。');
const index = await readFile(indexPath, 'utf8');

const canonicalTag = linkByRel(index, 'canonical');
const canonical = canonicalTag ? attribute(canonicalTag, 'href') : null;
if (canonical !== publicUrl.href) throw new Error(`canonicalが公開URLと一致しません: ${canonical ?? '未設定'}`);

const faviconTag = linkByRel(index, 'icon');
const favicon = faviconTag ? attribute(faviconTag, 'href') : null;
if (!favicon) throw new Error('faviconの参照がありません。');
await requireNonEmptyFile(favicon, 'favicon');

const styleReferences = tags(index, 'link')
  .filter((tag) => attribute(tag, 'rel')?.toLocaleLowerCase('en-US').split(/\s+/u).includes('stylesheet'))
  .map((tag) => attribute(tag, 'href'))
  .filter((reference) => reference !== null);
if (styleReferences.length === 0) throw new Error('ビルド済みCSSの参照がありません。');
for (const reference of styleReferences) {
  if (extname(new URL(reference, publicUrl).pathname).toLocaleLowerCase('en-US') !== '.css') throw new Error(`CSS参照の拡張子が不正です: ${reference}`);
  await requireNonEmptyFile(reference, 'CSS');
}

const scriptReferences = tags(index, 'script')
  .map((tag) => attribute(tag, 'src'))
  .filter((reference) => reference !== null);
if (scriptReferences.length === 0) throw new Error('ビルド済みJavaScriptの参照がありません。');
for (const reference of scriptReferences) await requireNonEmptyFile(reference, 'JavaScript');

const ogpReference = metaContent(index, 'og:image');
if (!ogpReference) throw new Error('OGP画像の参照がありません。');
const ogpUrl = new URL(ogpReference, publicUrl);
if (ogpUrl.origin !== publicUrl.origin || !ogpUrl.pathname.startsWith(publicUrl.pathname)) throw new Error('OGP画像が公開サブパス外を参照しています。');
const ogpExtension = extname(ogpUrl.pathname).toLocaleLowerCase('en-US');
const expectedOgpType = supportedOgpTypes.get(ogpExtension);
if (!expectedOgpType) throw new Error('OGP画像はPNG、JPG、GIF、WebPのいずれかにしてください。');
const declaredOgpType = metaContent(index, 'og:image:type');
if (declaredOgpType !== expectedOgpType) throw new Error(`og:image:typeが画像形式と一致しません: ${declaredOgpType ?? '未設定'}`);
const ogpPath = await requireNonEmptyFile(ogpReference, 'OGP画像');
const ogpDimensions = await verifyOgpImage(ogpPath, ogpExtension);
if (ogpDimensions) {
  const declaredWidth = Number(metaContent(index, 'og:image:width'));
  const declaredHeight = Number(metaContent(index, 'og:image:height'));
  if (declaredWidth !== ogpDimensions.width || declaredHeight !== ogpDimensions.height) throw new Error('OGP画像の宣言寸法が実画像と一致しません。');
}

const twitterCard = metaContent(index, 'twitter:card');
const twitterImage = metaContent(index, 'twitter:image');
if (twitterCard && twitterImage !== ogpReference) throw new Error('twitter:imageがOGP画像と一致しません。');

console.log(`静的公開ファイルを確認しました（CSS ${styleReferences.length}件、JavaScript ${scriptReferences.length}件、OGP ${relative(root, ogpPath)}）。`);
