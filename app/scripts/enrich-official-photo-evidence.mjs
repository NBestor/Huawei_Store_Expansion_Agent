import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('官网产品照片集');
const manifest = JSON.parse(await readFile(path.join(root, '照片索引.json'), 'utf8'));
const decode = value => String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const text = value => decode(value.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1].toLowerCase(), decode(match[2])]));

async function readPage(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'consumer.huawei.com' || parsed.username || parsed.password || parsed.port) throw new Error('非官网页面');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/html' } });
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('官网页面暂不可读取');
  const parts = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > 2_000_000) throw new Error('页面超出大小上限'); parts.push(part); }
  const html = Buffer.concat(parts).toString('utf8');
  const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const headings = [...html.matchAll(/<h[1-4]\b[^>]*>[\s\S]*?<\/h[1-4]>/gi)].map(match => ({ index: match.index, value: text(match[0]) })).filter(item => item.value);
  const tags = [...html.matchAll(/<(?:img|source)\b[^>]*>/gi)].map(match => ({ index: match.index, tag: match[0], attrs: attrs(match[0]) }));
  const entries = manifest.filter(image => image.sourcePage === url);
  for (const image of entries) {
    const pathname = new URL(image.sourceUrl).pathname;
    const filename = path.posix.basename(pathname);
    const candidates = tags.filter(item => item.tag.includes(pathname) || item.tag.includes(filename));
    const matched = candidates.find(item => item.attrs.alt)?.attrs.alt || '';
    const index = candidates[0]?.index;
    const nearestHeading = index === undefined ? '' : headings.filter(item => item.index < index).at(-1)?.value || '';
    // Adjacent headings and alt text are navigational context, never an exact claim citation.
    image.pageEvidence = { title, imageAlt: matched, precedingHeading: nearestHeading, path: url, fetchedAt: new Date().toISOString(), note: '官网原始 alt 和相邻标题仅作索引上下文，不能替代具体卖点的原文核验。' };
  }
  return { url, title, images: entries.length, altCount: entries.filter(image => image.pageEvidence.imageAlt).length };
}

const pages = [...new Set(manifest.map(image => image.sourcePage))];
let failed = 0;
for (let offset = 0; offset < pages.length; offset += 3) {
  const results = await Promise.allSettled(pages.slice(offset, offset + 3).map(readPage));
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') console.log(JSON.stringify(result.value));
    else { failed++; console.log(JSON.stringify({ url: pages[offset + index], error: result.reason.message })); }
  }
}
await writeFile(path.join(root, '照片索引.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`官网上下文补充完成：成功 ${pages.length - failed} 页，失败 ${failed} 页。`);
