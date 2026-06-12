/* Gera ícones PNG simples (RGBA) para o PWA da Gestão, sem dependências externas. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });
  const idat = chunk('IDAT', idatData);

  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx, dy = py - cy;
  return (dx * dx + dy * dy) <= r * r;
}

function inCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return (dx * dx + dy * dy) <= r * r;
}

function generateIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [255, 90, 0, 255];   // #FF5A00
  const fg = [255, 255, 255, 255]; // branco

  // burger geometry (proporcional ao tamanho)
  const bunTop    = { x0: size * 0.20, y0: size * 0.27, x1: size * 0.80, y1: size * 0.40, r: size * 0.07 };
  const patty     = { x0: size * 0.18, y0: size * 0.45, x1: size * 0.82, y1: size * 0.55, r: size * 0.03 };
  const bunBottom = { x0: size * 0.20, y0: size * 0.60, x1: size * 0.80, y1: size * 0.71, r: size * 0.07 };
  const seeds = [
    { cx: size * 0.36, cy: size * 0.32, r: size * 0.018 },
    { cx: size * 0.50, cy: size * 0.30, r: size * 0.018 },
    { cx: size * 0.64, cy: size * 0.32, r: size * 0.018 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = bg;

      if (inRoundedRect(x, y, bunTop.x0, bunTop.y0, bunTop.x1, bunTop.y1, bunTop.r) ||
          inRoundedRect(x, y, patty.x0, patty.y0, patty.x1, patty.y1, patty.r) ||
          inRoundedRect(x, y, bunBottom.x0, bunBottom.y0, bunBottom.x1, bunBottom.y1, bunBottom.r)) {
        color = fg;
      }
      for (const s of seeds) {
        if (inCircle(x, y, s.cx, s.cy, s.r)) color = bg;
      }

      const idx = (y * size + x) * 4;
      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
      buf[idx + 3] = color[3];
    }
  }

  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const files = {
  192: 'day-lanches-gestao-192.png',
  512: 'day-lanches-gestao-512.png',
  180: 'day-lanches-gestao-apple-touch.png',
  48:  'favicon.png',
};

for (const [size, name] of Object.entries(files)) {
  const png = generateIcon(Number(size));
  fs.writeFileSync(path.join(outDir, name), png);
  console.log('Gerado:', name, png.length, 'bytes');
}
