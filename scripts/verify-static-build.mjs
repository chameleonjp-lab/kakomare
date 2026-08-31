import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const required = ['index.html', 'favicon.svg', 'og-image.svg', 'assets'];
for (const item of required) await access(resolve(root, item));
const index = await readFile(resolve(root, 'index.html'), 'utf8');
if (!index.includes('/kakomare/')) throw new Error('dist/index.htmlに/kakomare/の公開パスがありません。');
if (!index.includes('./favicon.svg')) throw new Error('faviconの相対参照がありません。');
if (!index.includes('og-image.svg')) throw new Error('OGP画像の参照がありません。');
if (!index.includes('https://chameleonjp-lab.github.io/kakomare/og-image.svg')) throw new Error('OGP画像の公開URLがありません。');
const assets = await readdir(resolve(root, 'assets'));
if (!assets.some((item) => item.endsWith('.js'))) throw new Error('ビルド済みJavaScriptがありません。');
console.log(`静的公開ファイルを確認しました（assets ${assets.length}件）。`);
