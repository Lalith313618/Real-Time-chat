const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createPng(width, height) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Generate pixels (RGBA) with scanline filter byte 0
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      
      // Calculate normalized coords
      const nx = x / width;
      const ny = y / height;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy) / (width / 2);

      // Deep dark violet-blue gradient background
      let r = Math.round(15 + 40 * (nx + ny) / 2);
      let g = Math.round(23 + 20 * (1 - ny));
      let b = Math.round(42 + 120 * nx);
      let a = 255;

      // Squircle mask (corner rounding)
      const cornerRadius = 0.28 * width;
      const cx = Math.abs(x - width / 2) - (width / 2 - cornerRadius);
      const cy = Math.abs(y - height / 2) - (height / 2 - cornerRadius);
      if (cx > 0 && cy > 0) {
        const cdist = Math.sqrt(cx * cx + cy * cy);
        if (cdist > cornerRadius) {
          a = 0; // Transparent outside rounded corner
        }
      }

      // Central glowing chat badge
      if (a > 0) {
        // Chat bubble shape inside [0.2w, 0.8w] x [0.2h, 0.72h]
        const bx = (x / width);
        const by = (y / height);
        if (bx >= 0.22 && bx <= 0.78 && by >= 0.20 && by <= 0.72) {
          // Inside chat bubble bounding
          const relX = (bx - 0.22) / 0.56;
          const relY = (by - 0.20) / 0.52;
          
          // Indigo-violet-magenta gradient
          r = Math.round(99 + 120 * relX);
          g = Math.round(102 + 40 * (1 - relY));
          b = Math.round(241 - 30 * relX);

          // Three white message dots
          const dotDist1 = Math.sqrt(Math.pow(relX - 0.32, 2) + Math.pow(relY - 0.48, 2));
          const dotDist2 = Math.sqrt(Math.pow(relX - 0.50, 2) + Math.pow(relY - 0.48, 2));
          const dotDist3 = Math.sqrt(Math.pow(relX - 0.68, 2) + Math.pow(relY - 0.48, 2));

          if (dotDist1 < 0.07 || dotDist2 < 0.07 || dotDist3 < 0.07) {
            r = 255;
            g = 255;
            b = 255;
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

const iconsDir = path.join(__dirname, '..', 'frontend', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPng(192, 192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPng(512, 512));
console.log('Successfully generated icon-192.png and icon-512.png!');
