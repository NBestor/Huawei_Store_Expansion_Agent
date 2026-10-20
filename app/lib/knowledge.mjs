import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dependency } from './dependencies.mjs';
import { products, within, knowledgeRoot, parseCsv } from './local.mjs';
import { failure } from './config.mjs';

const vmallHosts = new Set(['www.vmall.com', 'item.vmall.com', 'm.vmall.com']);
const consumerHost = 'consumer.huawei.com';
const ecosystemDirectories = {
  phone: { label: '手机', path: '/cn/phones/' },
  tablet: { label: '平板', path: '/cn/tablets/' },
  wearable: { label: '穿戴设备', path: '/cn/wearables/' },
  audio: { label: '耳机', path: '/cn/headphones/' },
};
const priceSource = 'P1-产品参数库/08-官方公开价格快照/官方价格快照.csv';

let indexPromise;
export function factIndex() {
  return indexPromise ||= (async () => {
    const result = [];
    for (const product of await products()) for (const filename of ['产品事实.md', '卖点与限制.md']) {
      const relative = `${product.id}/${filename}`;
      try { await within(knowledgeRoot, relative); result.push({ path: relative, productId: product.id, product: product.name }); } catch {}
    }
    return result;
  })();
}
export function vmallUrl(value) {
  let url; try { url = new URL(value); } catch { throw failure('网页依据需要完整的华为商城 HTTPS 链接。'); }
  if (url.protocol !== 'https:' || !vmallHosts.has(url.hostname) || url.port || url.username || url.password) throw failure('网页核验仅允许华为商城 www、item 或 m.vmall.com 的明确链接。');
  url.hash = ''; return url.href;
}
export function huaweiConsumerUrl(value) {
  let url; try { url = new URL(value); } catch { throw failure('生态设备依据需要完整的华为消费者业务 HTTPS 链接。'); }
  if (url.protocol !== 'https:' || url.hostname !== consumerHost || url.port || url.username || url.password || !url.pathname.startsWith('/cn/')) throw failure('生态设备依据仅允许华为消费者业务中国官网的 HTTPS 页面。');
  url.hash = ''; return url.href;
}
function decodeHtml(text) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const value = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }).replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function modelTerms(product) {
  const name = String(product?.name || '').replace(/^HUAWEI\s+/i, '').replace(/[（()）]/g, ' ');
  const tokens = name.match(/[\p{L}\p{N}]+/gu) || [];
  const harmony = /鸿蒙版|HarmonyOS版/i.test(name), coreUltra = /酷睿\s*Ultra/i.test(name), ultimate = /非凡大师/i.test(name);
  const required = tokens.filter(term => term.length > 1 && !['2024', '版', '系列'].includes(term) &&
    !(harmony && /^(鸿蒙版|HarmonyOS)$/i.test(term)) && !(coreUltra && term === '酷睿') && !(ultimate && term === '非凡大师'));
  if (/\bD\s*\d/i.test(name) && !required.includes('D')) required.push('D');
  return { required, name };
}
function sameProduct(text, product) {
  const normalized = String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = new Set(normalized.split(/\s+/));
  const { required, name } = modelTerms(product);
  if (required.some(term => !tokens.has(term.toLowerCase()))) return false;
  if (/\bD\s*\d/i.test(name) && !/\bd\s*\d+\b/i.test(normalized)) return false;
  if (/\bPro\s+S\b/i.test(name) && !/\bpro\s+s\b/i.test(normalized)) return false;
  if (/鸿蒙版|HarmonyOS版/i.test(name) && !['鸿蒙版', 'harmonyos'].some(term => tokens.has(term.toLowerCase()))) return false;
  if (/酷睿\s*Ultra/i.test(name) && !['酷睿 ultra', 'core ultra'].some(term => normalized.includes(term))) return false;
  if (/微绒典藏版/i.test(name) && !tokens.has('微绒典藏版')) return false;
  if (/非凡大师/i.test(name) && !['非凡大师', 'ultimate design'].some(term => normalized.includes(term))) return false;
  return true;
}
export async function fetchVmall(value, transport = fetch, product) {
  let url = vmallUrl(value), response;
  for (let redirect = 0; redirect < 4; redirect++) {
    try { response = await transport(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html, text/plain' } }); }
    catch { throw failure('华为商城页面读取失败，请稍后重试。'); }
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    if (!location) throw failure('华为商城页面跳转缺少目标地址。');
    url = vmallUrl(new URL(location, url).href);
  }
  if (response?.status >= 300 && response.status < 400) throw failure('华为商城页面跳转次数过多。');
  if (!response.ok || !/text\/(html|plain)/i.test(response.headers.get('content-type') || '')) throw failure('华为商城页面暂不可读取为文字依据。');
  let size = 0; const parts = [];
  for await (const part of response.body) { size += part.length; if (size > 1e6) throw failure('华为商城页面超过读取大小上限。'); parts.push(part); }
  const text = decodeHtml(Buffer.concat(parts).toString('utf8').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, '\n')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 40000);
  if (text.length < 40) throw failure('页面没有足够的可读文字，不能作为核验依据。');
  if (!sameProduct(text, product)) throw failure('商城页面文字与当前精确型号不匹配，已拒绝作为依据。');
  return { path: url, text, kind: 'web', fetchedAt: new Date().toISOString() };
}

function imageHostAllowed(hostname) {
  return ['vmall.com', 'vmallres.com', 'huawei.com', 'huawei.com.cn'].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}
export function usableOfficialImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && imageHostAllowed(url.hostname) && /[.](?:jpe?g|png|webp)$/i.test(url.pathname) && !/(?:logo|icon|avatar|sprite|awards?|badge|certificate|blur|vague|placeholder|loading|wechat|weixin|qrcode|switch-light|top-feactures|highlights-|touch-control-screen|oled-high-definition|display-bg)/i.test(url.pathname);
  } catch { return false; }
}
export function distinctOfficialImages(images) {
  const grouped = new Map();
  const key = value => new URL(value).pathname.replace(/(?:-xs|-mobile|_mobile|_mob|-mob|-m|-small|-2x|@2x|-thumb)(?=[-.])/gi, '').replace(/[.](?:jpe?g|png|webp)$/i, '');
  const quality = value => /(?:-xs|-mobile|_mobile|_mob|-mob|-m|-small|-thumb)(?=[-.])/i.test(new URL(value).pathname) ? 0 : 1;
  for (const image of images) {
    if (!usableOfficialImage(image.sourceUrl)) continue;
    const group = key(image.sourceUrl);
    if (!grouped.has(group) || quality(image.sourceUrl) > quality(grouped.get(group).sourceUrl)) grouped.set(group, image);
  }
  return [...grouped.values()];
}
export function extractOfficialImageUrls(html, pageUrl) {
  const decoded = decodeHtml(String(html).replace(/\\\//g, '/'));
  const raw = [];
  for (const match of decoded.matchAll(/<(?:meta|img|source)\b[^>]*>/gi)) {
    const tag = match[0], metaImage = /property=["']og:image["']/i.test(tag) || /name=["']twitter:image["']/i.test(tag);
    if (/^<meta/i.test(tag) && !metaImage) continue;
    for (const attr of ['content', 'data-src', 'data-original', 'data-lazy-src', 'src', 'srcset']) {
      const value = tag.match(new RegExp(`\\b${attr}=["']([^"']+)`, 'i'))?.[1];
      if (value) raw.push(...(attr === 'srcset' ? value.split(',').map(item => item.trim().split(/\s+/)[0]) : [value]));
    }
  }
  const urls = [], seen = new Set();
  for (const value of raw) {
    try {
      const url = new URL(value, pageUrl); url.hash = '';
      if (!usableOfficialImage(url.href)) continue;
      if (!seen.has(url.href)) { seen.add(url.href); urls.push(url.href); }
    } catch {}
  }
  // Prefer desktop originals; collapse responsive sizes and alternate formats of the same shot.
  const groups = new Map();
  const quality = value => /(?:-thumb|-xs|-mobile|_mobile|_mob|-mob|-m|-small)(?:[-_.])/i.test(new URL(value).pathname) ? 0 : /(?:-2x|@2x)[.]/i.test(new URL(value).pathname) ? 1 : 2;
  for (const url of urls) {
    const key = new URL(url).pathname.replace(/(?:-xs|-mobile|_mobile|_mob|-mob|-m|-small|-2x|@2x|-thumb)(?=[-.])/gi, '').replace(/[.](?:jpe?g|png|webp)$/i, '');
    if (!groups.has(key) || quality(url) > quality(groups.get(key))) groups.set(key, url);
  }
  return [...groups.values()].slice(0, 48);
}
async function fetchOfficialImage(url, transport, signal) {
  let response;
  try { response = await transport(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), headers: { Accept: 'image/webp,image/png,image/jpeg' } }); }
  catch { return null; }
  const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || !response.body) return null;
  let size = 0; const chunks = [];
  try {
    for await (const chunk of response.body) { size += chunk.length; if (size > 8 * 1024 * 1024) return null; chunks.push(chunk); }
  } catch { return null; }
  const data = Buffer.concat(chunks);
  if (data.length < 256) return null;
  try {
    const info = await dependency('sharp')(data, { limitInputPixels: 40_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(info.format) || !info.width || !info.height || info.width < 480 || info.height < 300 || info.pages > 1) return null;
    return { type: `image/${info.format}`, data };
  } catch { return null; }
}
export async function officialProductPages(product) {
  const pages = [];
  try {
    const rows = parseCsv(await readFile(await within(knowledgeRoot, `${product.id}/图片索引.csv`), 'utf8'));
    for (const row of rows) {
      if (row['产品型号'] !== product.name) continue;
      try {
        const url = huaweiConsumerUrl(row['来源页面']);
        if (/^\/cn\/(?:laptops|harmonyos-computer)\/[^/]+\//.test(new URL(url).pathname)) pages.push(url);
      } catch {}
    }
  } catch {}
  return [...new Set([...pages, ...await discoverVmall(product)])].slice(0, 3);
}
async function indexedImageDirectories(product, pageUrl) {
  const directories = [];
  try {
    const rows = parseCsv(await readFile(await within(knowledgeRoot, `${product.id}/图片索引.csv`), 'utf8'));
    for (const row of rows) {
      if (row['产品型号'] !== product.name || huaweiConsumerUrl(row['来源页面']) !== pageUrl) continue;
      const image = new URL(row['原始图片URL']);
      const directory = image.pathname.match(/^(.*[/]pdp[/](?:laptops|harmonyos-computer)[/][^/]+[/])/i)?.[1];
      if (directory && imageHostAllowed(image.hostname)) directories.push(directory);
    }
  } catch {}
  return [...new Set(directories)];
}
const imageRequests = new WeakMap();
export async function cacheOfficialProductImages(product, store, transport = fetch, { refresh = false } = {}) {
  const cached = distinctOfficialImages(store.officialImages(product.id));
  if (cached.length && !refresh) return cached;
  let pending = imageRequests.get(store);
  if (!pending) imageRequests.set(store, pending = new Map());
  if (pending.has(product.id)) return pending.get(product.id);
  const request = collectOfficialProductImages(product, store, transport);
  pending.set(product.id, request);
  try { return await request; } finally { pending.delete(product.id); }
}
async function collectOfficialProductImages(product, store, transport) {
  const pages = await officialProductPages(product), found = [], hashes = new Set(), deadline = Date.now() + 45000, signal = AbortSignal.timeout(45000);
  for (const pageUrl of pages) {
    if (Date.now() >= deadline) break;
    let response;
    try { response = await transport(pageUrl, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), headers: { Accept: 'text/html' } }); } catch { continue; }
    if (!response.ok || !response.body || !/text\/html/i.test(response.headers.get('content-type') || '')) continue;
    const parts = []; let size = 0;
    try { for await (const part of response.body) { size += part.length; if (size > 2_000_000) throw new Error('page too large'); parts.push(part); } } catch { continue; }
    let html = Buffer.concat(parts).toString('utf8');
    const pageText = decodeHtml(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
    // Consumer product URLs come from the exact model's curated image index.
    if (new URL(pageUrl).hostname !== consumerHost && !sameProduct(pageText, product)) continue;
    html = html.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const directories = await indexedImageDirectories(product, pageUrl);
    const candidates = extractOfficialImageUrls(html, pageUrl).sort((a, b) => Number(/(?:key-vision|[-_]kv[0-9]*[.]|[-_]hero[.]|[/]hero[.])/i.test(b)) - Number(/(?:key-vision|[-_]kv[0-9]*[.]|[-_]hero[.]|[/]hero[.])/i.test(a)));
    for (const [index, sourceUrl] of candidates.entries()) {
      if (Date.now() >= deadline) break;
      const imagePath = new URL(sourceUrl).pathname;
      if (new URL(pageUrl).hostname === consumerHost && !(directories.length ? directories.some(directory => imagePath.startsWith(directory)) : imagePath.includes(`/${new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1)}/`))) continue;
      const image = await fetchOfficialImage(sourceUrl, transport, signal);
      if (!image) continue;
      const hash = createHash('sha256').update(image.data).digest('hex');
      if (hashes.has(hash)) continue;
      hashes.add(hash);
      const id = createHash('sha256').update(`${product.id}\n${sourceUrl}\n${hash}`).digest('hex').slice(0, 32);
      store.saveOfficialImage({ id, productId: product.id, sourceUrl, sourcePage: pageUrl, description: `${product.name} 官方商品图片 ${found.length + 1}`, name: `${product.id.split('/').pop()}-official-${index + 1}`, ...image });
      found.push({ id, productId: product.id, sourceUrl, sourcePage: pageUrl, description: `${product.name} 官方商品图片 ${found.length + 1}`, name: `${product.id.split('/').pop()}-official-${index + 1}`, url: `/api/official-image/${id}`, cachedAt: new Date().toISOString() });
      if (found.length >= 12) break;
    }
    if (found.length >= 12) break;
  }
  return distinctOfficialImages(store.officialImages(product.id));
}

async function fetchConsumerPage(value, transport = fetch) {
  let url = huaweiConsumerUrl(value), response;
  for (let redirect = 0; redirect < 4; redirect++) {
    try { response = await transport(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html' } }); }
    catch { throw failure('华为消费者业务官网页面读取失败，请稍后重试。'); }
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    if (!location) throw failure('华为官网页面跳转缺少目标地址。');
    url = huaweiConsumerUrl(new URL(location, url).href);
  }
  if (response?.status >= 300 && response.status < 400) throw failure('华为官网页面跳转次数过多。');
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw failure('华为官网页面暂不可读取为文字依据。');
  let size = 0; const parts = [];
  for await (const part of response.body) { size += part.length; if (size > 1e6) throw failure('华为官网页面超过读取大小上限。'); parts.push(part); }
  const html = Buffer.concat(parts).toString('utf8');
  const title = decodeHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const text = decodeHtml(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, '\n')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 30000);
  if (text.length < 80) throw failure('页面没有足够的可读文字，不能作为依据。');
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1]);
  return { path: url, title, text, links, kind: 'web', fetchedAt: new Date().toISOString() };
}

export class EcosystemTools {
  constructor(devices = [], transport = fetch) { this.devices = [...new Set(devices)].filter(device => ecosystemDirectories[device]); this.transport = transport; this.resultPromise = null; }
  async discover() {
    return this.resultPromise ||= this.load();
  }
  async load() {
    const documents = [], trace = [];
    for (const device of this.devices) {
      const directory = ecosystemDirectories[device], url = `https://${consumerHost}${directory.path}`;
      try {
        const listing = await fetchConsumerPage(url, this.transport);
        const candidates = [...new Set(listing.links.map(href => { try { return huaweiConsumerUrl(new URL(decodeHtml(href), url).href); } catch { return ''; } }).filter(link => {
          try { const path = new URL(link).pathname; return path.startsWith(directory.path) && path !== directory.path && !/\/(support|accessories|compare|where-to-buy)\//i.test(path); } catch { return false; }
        }))].slice(0, 8);
        let found = 0;
        for (const candidate of candidates) {
          if (found >= 2) break;
          try {
            const page = await fetchConsumerPage(candidate, this.transport);
            if (!page.title || /华为消费者业务|HUAWEI Consumer/i.test(page.title) && page.text.length < 300) continue;
            page.ecosystemCategory = device; page.ecosystemCategoryLabel = directory.label; page.kind = 'ecosystem-web';
            documents.push(page); found++;
          } catch (error) { trace.push({ action: 'ecosystem_read', target: candidate, result: safeErrorMessage(error), at: new Date().toISOString() }); }
        }
        trace.push({ action: 'ecosystem_discover', target: url, result: `官方目录读取完成，取得 ${found} 个候选型号页面`, at: new Date().toISOString() });
      } catch (error) { trace.push({ action: 'ecosystem_discover', target: url, result: safeErrorMessage(error), at: new Date().toISOString() }); }
    }
    return { documents, trace };
  }
}

function safeErrorMessage(error) { return error?.publicMessage || '官方页面暂不可读取'; }

export async function discoverVmall(product) {
  let rows;
  try { rows = parseCsv(await readFile(await within(knowledgeRoot, priceSource), 'utf8')); }
  catch { return []; }
  const links = [];
  const productKey = value => String(value || '').toLocaleLowerCase()
    .replace(/^huawei\s*/i, '').replace(/[（(]鸿蒙版[）)]|鸿蒙版/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  const key = productKey(product.name);
  const matching = rows.filter(row => productKey(row['规范产品名称']) === key || productKey(row['原始产品名称']) === key);
  for (const row of matching) {
    const raw = row['官方URL'] || '';
    try {
      const parsed = new URL(vmallUrl(raw));
      if (!links.includes(parsed.href)) links.push(parsed.href);
    } catch {}
  }
  return links.sort((left, right) => {
    const score = value => {
      const url = new URL(value);
      return (url.hostname === 'item.vmall.com' ? 10 : 0) + (url.pathname.includes('/product/comdetail/') ? 10 : 0) + (url.searchParams.has('prdId') ? 2 : 0) + (url.searchParams.has('sbomCode') ? 1 : 0);
    };
    return score(right) - score(left);
  }).slice(0, 1);
}

export class FactTools {
  constructor(product, urls = [], transport = fetch) { this.product = product; this.urls = [...new Set(urls.map(vmallUrl))]; this.transport = transport; this.discovered = false; }
  async discover() {
    if (!this.discovered) {
      this.urls = [...new Set([...this.urls, ...await discoverVmall(this.product)])];
      this.discovered = true;
    }
    return this.urls;
  }
  async index() { return (await factIndex()).filter(item => item.productId === this.product.id); }
  async read(relative) {
    if (!(await this.index()).some(item => item.path === relative)) throw failure('只允许读取当前型号目录中的产品事实.md和卖点与限制.md。');
    const text = await readFile(await within(knowledgeRoot, relative), 'utf8');
    if (text.length > 60000) throw failure('事实文件超过读取上限。');
    return { path: relative, text, kind: 'local', productId: this.product.id, fetchedAt: new Date().toISOString() };
  }
  async web(url) {
    const allowed = vmallUrl(url);
    if (!this.urls.includes(allowed)) throw failure('这个网页链接未由用户或系统明确提供。');
    return { ...await fetchVmall(allowed, this.transport, this.product), productId: this.product.id };
  }
}
