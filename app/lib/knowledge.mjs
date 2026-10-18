import { readFile } from 'node:fs/promises';
import { products, within, knowledgeRoot } from './local.mjs';
import { failure } from './config.mjs';

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
  let url; try { url = new URL(value); } catch { throw failure('网页依据需要完整的 https://www.vmall.com/ 链接。'); }
  if (!String(value).startsWith('https://www.vmall.com/') || url.protocol !== 'https:' || url.hostname !== 'www.vmall.com' || url.port || url.username || url.password) throw failure('网页核验仅允许 https://www.vmall.com/ 下的明确链接。');
  url.hash = ''; return url.href;
}
function decodeHtml(text) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const value = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }).replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
export async function fetchVmall(value, transport = fetch) {
  const url = vmallUrl(value);
  let response;
  try { response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html, text/plain' } }); }
  catch { throw failure('华为商城页面读取失败或发生跳转，请检查明确链接。'); }
  if (!response.ok || !/text\/(html|plain)/i.test(response.headers.get('content-type') || '')) throw failure('华为商城页面暂不可读取为文字依据。');
  let size = 0; const parts = [];
  for await (const part of response.body) { size += part.length; if (size > 1e6) throw failure('华为商城页面超过读取大小上限。'); parts.push(part); }
  const text = decodeHtml(Buffer.concat(parts).toString('utf8').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, '\n')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 40000);
  if (text.length < 40) throw failure('页面没有足够的可读文字，不能作为核验依据。');
  return { path: url, text, kind: 'web', fetchedAt: new Date().toISOString() };
}

export class FactTools {
  constructor(product, urls = [], transport = fetch) { this.product = product; this.urls = [...new Set(urls.map(vmallUrl))]; this.transport = transport; }
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
    return { ...await fetchVmall(allowed, this.transport), productId: this.product.id };
  }
}
