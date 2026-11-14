// Generates crisp PNG PWA icons (192x192, 512x512, 180x180 apple-touch-icon, 72x72 badge)
// with a Syro-Malabar Sanctuary Navy & Liturgical Gold Mar Thoma Cross emblem using Node built-ins.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const publicDir = join(process.cwd(), 'public');
mkdirSync(publicDir, { recursive: true });

// CRC32 table for valid PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter type 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', deflateSync(raw, { level: 9 })),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawParishIcon(size, { monochrome = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const navy = [30, 58, 95, 255];      // #1E3A5F
  const gold = [212, 175, 55, 255];    // #D4AF37
  const ivory = [250, 248, 245, 255];  // #FAF8F5
  const clear = [0, 0, 0, 0];

  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - cx) / (size / 2);
      const ny = (y - cy) / (size / 2);

      let color = monochrome ? clear : navy;

      // Subtle inner gold ring
      const r = Math.hypot(nx, ny);
      if (!monochrome && r >= 0.78 && r <= 0.84) {
        color = gold;
      }

      // Stylized Cross (vertical + horizontal beam + stepped base)
      const inVert = Math.abs(nx) <= 0.11 && ny >= -0.52 && ny <= 0.44;
      const inHoriz = Math.abs(ny + 0.12) <= 0.11 && Math.abs(nx) <= 0.44;
      // Flared cross tips
      const topTip = Math.abs(nx) <= 0.17 && ny >= -0.56 && ny <= -0.44;
      const leftTip = Math.abs(ny + 0.12) <= 0.16 && nx >= -0.48 && nx <= -0.36;
      const rightTip = Math.abs(ny + 0.12) <= 0.16 && nx <= 0.48 && nx >= 0.36;
      // Stepped pedestal
      const step1 = Math.abs(nx) <= 0.24 && ny >= 0.36 && ny <= 0.46;
      const step2 = Math.abs(nx) <= 0.36 && ny >= 0.46 && ny <= 0.56;

      if (inVert || inHoriz || topTip || leftTip || rightTip || step1 || step2) {
        color = monochrome ? [255, 255, 255, 255] : ivory;
      }

      // Center gold medallion dot
      if (!monochrome && Math.hypot(nx, ny + 0.12) <= 0.08) {
        color = gold;
      }

      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
      buf[idx + 3] = color[3];
    }
  }
  return encodePng(size, size, buf);
}

writeFileSync(join(publicDir, 'pwa-192x192.png'), drawParishIcon(192));
writeFileSync(join(publicDir, 'pwa-512x512.png'), drawParishIcon(512));
writeFileSync(join(publicDir, 'apple-touch-icon.png'), drawParishIcon(180));
writeFileSync(join(publicDir, 'badge-72x72.png'), drawParishIcon(72, { monochrome: true }));

console.log('Generated PWA PNG icons in public/.');
