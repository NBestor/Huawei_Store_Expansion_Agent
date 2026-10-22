import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dependency } from '../lib/dependencies.mjs';
const sharp = dependency('sharp'), root = path.resolve('官网产品照片集');
const sheetRoot = path.join(root, '核对缩略图');
await mkdir(sheetRoot, { recursive: true });
for (const directory of await readdir(root, { withFileTypes: true })) {
  if (!directory.isDirectory() || directory.name === '核对缩略图') continue;
  const files = (await readdir(path.join(root, directory.name))).filter(file => /\.(jpg|png|webp)$/i.test(file)).sort();
  for (let offset = 0; offset < files.length; offset += 12) {
    const slice = files.slice(offset, offset + 12), layers = [];
    for (const [i, filename] of slice.entries()) {
      const thumb = await sharp(await readFile(path.join(root, directory.name, filename))).flatten({ background: '#f3f3f3' }).resize(390, 230, { fit: 'contain', background: '#f3f3f3' }).png().toBuffer();
      const label = `<svg width="390" height="50"><rect width="390" height="50" fill="white"/><text x="8" y="20" font-family="Arial" font-size="14" fill="black">${filename.slice(0, 49).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text><text x="8" y="40" font-family="Arial" font-size="12" fill="#555">${filename.slice(49, 95).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text></svg>`;
      layers.push({ input: thumb, left: (i % 3) * 400 + 5, top: Math.floor(i / 3) * 290 + 5 });
      layers.push({ input: Buffer.from(label), left: (i % 3) * 400 + 5, top: Math.floor(i / 3) * 290 + 235 });
    }
    const output = path.join(sheetRoot, `${directory.name}-${offset / 12 + 1}.jpg`);
    await sharp({ create: { width: 1200, height: Math.ceil(slice.length / 3) * 290, channels: 3, background: '#ddd' } }).composite(layers).jpeg({ quality: 88 }).toFile(output);
    console.log(output);
  }
}
