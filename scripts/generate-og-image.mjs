import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/og-image.png');
const width = 1200;
const height = 630;
const pixels = Buffer.alloc(width * height * 4);

const colors = {
  background: [7, 19, 31, 255],
  grid: [22, 50, 70, 255],
  cyan: [99, 215, 230, 255],
  cream: [242, 240, 232, 255],
  amber: [255, 190, 92, 255],
  danger: [255, 112, 106, 255],
  violet: [167, 139, 250, 255],
};

function setPixel(x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || px >= width || py < 0 || py >= height) return;
  const offset = (py * width + px) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fill(color) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
}

function circle(cx, cy, radius, color, filled = false, thickness = 2) {
  const outer = radius + thickness / 2;
  const inner = filled ? 0 : Math.max(0, radius - thickness / 2);
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y += 1) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= outer && distance >= inner) setPixel(x, y, color);
    }
  }
}

function line(x1, y1, x2, y2, color, thickness = 2) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    circle(x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio, thickness / 2, color, true, 1);
  }
}

function rectangle(x, y, rectangleWidth, rectangleHeight, color) {
  for (let py = y; py < y + rectangleHeight; py += 1) {
    for (let px = x; px < x + rectangleWidth; px += 1) setPixel(px, py, color);
  }
}

const titleGlyphs = [
  ['0010000', '1111110', '0010010', '0010010', '0100010', '0100100', '1001000'],
  ['1111110', '0000010', '0000010', '0000010', '0000010', '0000010', '1111110'],
  ['1111110', '0000100', '0001000', '1010000', '0100000', '0010000', '0000000'],
  ['1000000', '1000000', '1000000', '1000010', '1000100', '1001000', '1110000'],
];

function drawTitle(x, y, scale, color) {
  for (let glyphIndex = 0; glyphIndex < titleGlyphs.length; glyphIndex += 1) {
    const glyph = titleGlyphs[glyphIndex];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') rectangle(x + glyphIndex * scale * 8 + column * scale, y + row * scale, scale, scale, color);
      }
    }
  }
}

function hexagon(cx, cy, radius, color, thickness = 5) {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    line(from[0], from[1], to[0], to[1], color, thickness);
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuffer, data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(payload), data.length + 8);
  return result;
}

fill(colors.background);
const centerX = 370;
const centerY = height / 2;
circle(centerX, centerY, 150, colors.grid, false, 3);
circle(centerX, centerY, 240, colors.grid, false, 3);
for (let index = 0; index < 6; index += 1) {
  const angle = index * Math.PI / 3;
  line(centerX, centerY, centerX + Math.cos(angle) * 330, centerY + Math.sin(angle) * 330, colors.grid, 3);
  const enemyX = centerX + Math.cos(angle) * 270;
  const enemyY = centerY + Math.sin(angle) * 270;
  hexagon(enemyX, enemyY, 24 + index % 2 * 5, index % 3 === 0 ? colors.violet : colors.danger, 6);
}
hexagon(centerX, centerY, 112, colors.cyan, 10);
hexagon(centerX, centerY, 78, colors.amber, 5);
for (let index = 0; index < 6; index += 1) {
  const angle = -Math.PI / 2 + index * Math.PI / 3;
  line(centerX + Math.cos(angle) * 112, centerY + Math.sin(angle) * 112, centerX + Math.cos(angle) * 185, centerY + Math.sin(angle) * 185, colors.cyan, 6);
}
circle(centerX, centerY, 52, colors.cream, true, 1);
circle(centerX, centerY, 52, colors.amber, false, 12);
circle(centerX, centerY, 20, colors.background, true, 1);
drawTitle(700, 266, 14, colors.cream);

const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const rowOffset = y * (width * 4 + 1);
  raw[rowOffset] = 0;
  pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, png);
console.log(`OGP画像を生成しました: ${output}`);
