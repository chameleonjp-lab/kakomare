import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'src');
const forbidden = [/aqua\s*aqua/i, /wetrix/i, /iq\s*ゲーム/i];
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(ts|tsx|css|html)$/u.test(entry.name)) files.push(path);
  }
}
await walk(root);
for (const path of files) {
  const text = await readFile(path, 'utf8');
  if (forbidden.some((pattern) => pattern.test(text))) throw new Error(`独自名称検査に失敗しました: ${path}`);
}
console.log(`独自名称検査を完了しました（${files.length}ファイル）。`);
