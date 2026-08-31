import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(process.cwd());
const originalityVerifier = resolve(repositoryRoot, 'scripts/verify-originality.mjs');
const staticVerifier = resolve(repositoryRoot, 'scripts/verify-static-build.mjs');
const temporaryDirectories: string[] = [];
const restrictedTerms = [
  [97, 113, 117, 97, 97, 113, 117, 97],
  [119, 101, 116, 114, 105, 120],
  [105, 113, 0x30b2, 0x30fc, 0x30e0],
].map((codePoints) => String.fromCodePoint(...codePoints));

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kakomare-release-'));
  temporaryDirectories.push(directory);
  return directory;
}

function run(script: string, cwd: string) {
  return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
}

function createValidDist(root: string): string {
  const dist = join(root, 'dist');
  const assets = join(dist, 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dist, 'og-image.png'), readFileSync(join(repositoryRoot, 'public/og-image.png')));
  writeFileSync(join(assets, 'app.css'), 'body { color: white; }');
  writeFileSync(join(assets, 'app.js'), 'console.log("カコマレ");');
  writeFileSync(join(dist, 'index.html'), `<!doctype html>
    <link rel="canonical" href="https://chameleonjp-lab.github.io/kakomare/">
    <link rel="icon" href="./favicon.svg">
    <link rel="stylesheet" href="/kakomare/assets/app.css">
    <meta property="og:image" content="https://chameleonjp-lab.github.io/kakomare/og-image.png">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="https://chameleonjp-lab.github.io/kakomare/og-image.png">
    <script type="module" src="/kakomare/assets/app.js"></script>`);
  return dist;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('release verification scripts', () => {
  it('scans repository text recursively while ignoring generated directories', () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    const restricted = restrictedTerms[1]!;
    writeFileSync(join(root, 'README.md'), '# カコマレ');
    writeFileSync(join(root, 'node_modules/ignored.txt'), restricted);
    expect(run(originalityVerifier, root).status).toBe(0);
    writeFileSync(join(root, 'src/leak.ts'), `export const title = '${restricted}';`);
    const rejected = run(originalityVerifier, root);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('src/leak.ts');
  });

  it('rejects every restricted title in escaped text, file names, and binary bytes', () => {
    for (const [index, restricted] of restrictedTerms.entries()) {
      const escapedRoot = temporaryDirectory();
      mkdirSync(join(escapedRoot, 'src'), { recursive: true });
      const escaped = [...restricted].map((character) => `\\u{${character.codePointAt(0)!.toString(16)}}`).join('');
      writeFileSync(join(escapedRoot, 'src/escaped.js'), `export const value = '${escaped}';`);
      expect(run(originalityVerifier, escapedRoot).status, `escaped ${index}`).not.toBe(0);

      const nameRoot = temporaryDirectory();
      writeFileSync(join(nameRoot, `${restricted}.txt`), 'name');
      expect(run(originalityVerifier, nameRoot).status, `name ${index}`).not.toBe(0);

      const binaryRoot = temporaryDirectory();
      writeFileSync(join(binaryRoot, `asset-${index}.bin`), Buffer.from(restricted));
      expect(run(originalityVerifier, binaryRoot).status, `binary ${index}`).not.toBe(0);
    }
  });

  it('accepts complete non-empty static references and a raster OGP image', () => {
    const root = temporaryDirectory();
    createValidDist(root);
    const result = run(staticVerifier, root);
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects an empty referenced stylesheet', () => {
    const root = temporaryDirectory();
    createValidDist(root);
    writeFileSync(join(root, 'dist/assets/app.css'), '');
    const result = run(staticVerifier, root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('CSSの参照先が空です');
  });

  it('rejects a truncated PNG even when its signature is present', () => {
    const root = temporaryDirectory();
    const dist = createValidDist(root);
    writeFileSync(join(dist, 'og-image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const result = run(staticVerifier, root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PNG');
  });

  it('rejects a PNG whose chunk data no longer matches its CRC', () => {
    const root = temporaryDirectory();
    const dist = createValidDist(root);
    const path = join(dist, 'og-image.png');
    const bytes = readFileSync(path);
    bytes[40] ^= 0xff;
    writeFileSync(path, bytes);
    const result = run(staticVerifier, root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('CRC');
  });

  it('rejects SVG as an OGP sharing image', () => {
    const root = temporaryDirectory();
    const dist = createValidDist(root);
    writeFileSync(join(dist, 'og-image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const indexPath = join(dist, 'index.html');
    const html = `<!doctype html>
      <link rel="canonical" href="https://chameleonjp-lab.github.io/kakomare/">
      <link rel="icon" href="./favicon.svg">
      <link rel="stylesheet" href="/kakomare/assets/app.css">
      <meta property="og:image" content="https://chameleonjp-lab.github.io/kakomare/og-image.svg">
      <meta property="og:image:type" content="image/svg+xml">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:image" content="https://chameleonjp-lab.github.io/kakomare/og-image.svg">
      <script type="module" src="/kakomare/assets/app.js"></script>`;
    writeFileSync(indexPath, html);
    const result = run(staticVerifier, root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PNG、JPG、GIF、WebP');
  });

  it('guards both Pages jobs against non-main workflow dispatches', () => {
    const workflow = join(repositoryRoot, '.github/workflows/deploy-pages.yml');
    const contents = readFileSync(workflow, 'utf8');
    expect(contents.match(/if: github\.ref == 'refs\/heads\/main'/gu)).toHaveLength(2);
  });

  it('runs both browsers in order and completes every release check before Pages upload', () => {
    const quality = readFileSync(join(repositoryRoot, '.github/workflows/quality.yml'), 'utf8');
    const deploy = readFileSync(join(repositoryRoot, '.github/workflows/deploy-pages.yml'), 'utf8');
    for (const workflow of [quality, deploy]) {
      const chromium = workflow.indexOf('npm run test:e2e:chromium');
      const webkit = workflow.indexOf('npm run test:e2e:webkit');
      expect(chromium).toBeGreaterThan(0);
      expect(webkit).toBeGreaterThan(chromium);
      expect(workflow).toContain('npm run lint && npm run typecheck && npm run test');
      expect(workflow).toContain('npm run build && npm run verify:dist && npm run verify:originality');
    }
    expect(deploy.indexOf('npm run verify:originality')).toBeLessThan(deploy.indexOf('actions/upload-pages-artifact'));
  });
});
