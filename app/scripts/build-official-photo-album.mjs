import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { products, knowledgeRoot, parseCsv } from '../lib/local.mjs';
import { officialProductPages, extractOfficialImageUrls, usableOfficialImage } from '../lib/knowledge.mjs';
import { dependency } from '../lib/dependencies.mjs';

const albumRoot = path.resolve('官网产品照片集');
const sharp = dependency('sharp');
const safe = value => value.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 90);
const timeout = ms => AbortSignal.timeout(ms);
let previous = [];
try { previous = JSON.parse(await readFile(path.join(albumRoot, '照片索引.json'), 'utf8')); } catch {}
const previousBySource = new Map(previous.map(image => [`${image.productId}\n${image.sourceUrl}`, image]));

async function pageDirectory(product, pageUrl) {
  try {
    const rows = parseCsv(await readFile(path.join(knowledgeRoot, product.id, '图片索引.csv'), 'utf8'));
    const row = rows.find(item => item['产品型号'] === product.name && item['来源页面'] === pageUrl);
    if (!row) return '';
    const imageUrl = new URL(row['原始图片URL']);
    return imageUrl.pathname.match(/^(.*\/pdp\/(?:laptops|harmonyos-computer)\/[^/]+\/)/i)?.[1] || '';
  } catch { return ''; }
}

async function readImage(url) {
  let response;
  try { response = await fetch(url, { signal: timeout(10000), headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' } }); } catch { return null; }
  const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || !response.body) return null;
  let bytes;
  try { bytes = Buffer.from(await response.arrayBuffer()); } catch { return null; }
  if (bytes.length > 8 * 1024 * 1024 || bytes.length < 512) return null;
  try {
    const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(info.format) || !info.width || !info.height || info.width < 480 || info.height < 300 || info.pages > 1) return null;
    return { bytes, info };
  } catch { return null; }
}

const manifest = [];
for (const product of await products()) {
  const slug = safe(product.name);
  const directory = path.join(albumRoot, slug);
  await mkdir(directory, { recursive: true });
  const pages = await officialProductPages(product);
  const seen = new Set();
  let saved = 0;
  for (const pageUrl of pages) {
    let response;
    try { response = await fetch(pageUrl, { signal: timeout(15000), headers: { Accept: 'text/html' } }); } catch { continue; }
    if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) continue;
    let html;
    try { html = await response.text(); } catch { continue; }
    const imageRoot = await pageDirectory(product, pageUrl);
    const candidates = extractOfficialImageUrls(html, pageUrl).filter(url => {
      const parsed = new URL(url);
      return usableOfficialImage(url) && parsed.hostname === 'consumer.huawei.com' && (!imageRoot || parsed.pathname.startsWith(imageRoot));
    });
    for (const [index, sourceUrl] of candidates.entries()) {
      const result = await readImage(sourceUrl);
      if (!result) continue;
      const digest = createHash('sha256').update(result.bytes).digest('hex');
      if (seen.has(digest)) continue;
      seen.add(digest);
      const originalName = path.posix.basename(new URL(sourceUrl).pathname).replace(/\.(?:jpe?g|png|webp)$/i, '');
      const ext = result.info.format === 'jpeg' ? 'jpg' : result.info.format;
      const filename = `${String(saved + 1).padStart(3, '0')}-${safe(originalName) || `official-${index + 1}`}.${ext}`;
      const old = previousBySource.get(`${product.id}\n${sourceUrl}`);
      const review = old?.sha256 === digest ? old : {};
      const localFilename = review.filename || `${previous.length ? '待核对新图/' : ''}${slug}/${filename}`;
      if (!review.filename) {
        await mkdir(path.dirname(path.join(albumRoot, localFilename)), { recursive: true });
        await writeFile(path.join(albumRoot, localFilename), result.bytes);
      }
      manifest.push({ ...review, productId: product.id, product: product.name, filename: localFilename, sourcePage: pageUrl, sourceUrl, width: result.info.width, height: result.info.height, bytes: result.bytes.length, sha256: digest, visualDescription: review.visualDescription || '', suitableFor: review.suitableFor || '', avoidFor: review.avoidFor || '', reviewStatus: review.reviewStatus || '待逐张视觉核对' });
      saved++;
    }
  }
  console.log(`${product.name}: ${saved} 张`);
}

// Keep the last reviewed index intact on network failure or when new assets require review.
const outputName = previous.length ? '待核对采集索引.json' : '照片索引.json';
await writeFile(path.join(albumRoot, outputName), `${JSON.stringify(manifest, null, 2)}\n`);
const columns = ['产品型号', '本地文件', '画面识别', '适合配文', '不适合表达', '官网页面', '原始图片URL', '尺寸', 'SHA-256', '核对状态'];
const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const rows = manifest.map(item => [item.product, item.filename, item.visualDescription, item.suitableFor, item.avoidFor, item.sourcePage, item.sourceUrl, `${item.width}x${item.height}`, item.sha256, item.reviewStatus]);
if (!previous.length) await writeFile(path.join(albumRoot, '照片索引.csv'), `\uFEFF${[columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n')}\r\n`);
console.log(`完成：${manifest.length} 张官方图片；照片集目录 ${albumRoot}`);
