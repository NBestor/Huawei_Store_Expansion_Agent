import { readFile } from 'node:fs/promises';
import { products, within, knowledgeRoot, parseCsv } from './local.mjs';
import { failure } from './config.mjs';

const vmallHosts = new Set(['www.vmall.com', 'item.vmall.com', 'm.vmall.com']);
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
