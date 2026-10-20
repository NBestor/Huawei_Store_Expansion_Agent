import { failure } from './config.mjs';

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }).replace(/&amp;nbsp;/gi, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

const labelGroups = [
  ['国补', '以旧换新', '消费券', '购新补贴', '降价', '促销'],
  ['开学季', '毕业季', '寒暑假', '国庆', '春节', '返乡', '出游'],
  ['考试', '考研', '考公', '实习', '求职', '线上学习'],
  ['远程办公', '出差', '通勤', '效率工具'],
  ['新品发布', 'AI应用', '鸿蒙生态', '内容创作', '数码趋势'],
  ['家庭消费', '居家生活', '亲子', '生活方式'],
];

function audienceLabels(audience = '') {
  const value = audience.toLowerCase();
  if (/学生|新生|考研|考公|校园/.test(value)) return [...labelGroups[1], ...labelGroups[2]];
  if (/职场|办公|出差|通勤|商务/.test(value)) return [...labelGroups[0], ...labelGroups[3], ...labelGroups[4]];
  if (/创作者|内容|设计|摄影|视频/.test(value)) return [...labelGroups[4], ...labelGroups[3], ...labelGroups[5]];
  if (/家庭|亲子|父母|家用/.test(value)) return [...labelGroups[0], ...labelGroups[1], ...labelGroups[5]];
  if (/游戏|数码|科技/.test(value)) return [...labelGroups[0], ...labelGroups[4], ...labelGroups[3]];
  return [...labelGroups[0], ...labelGroups[1], ...labelGroups[4]];
}

function buildQuery(audience) {
  const labels = audienceLabels(audience).slice(0, 12).map(value => `"${value}"`).join(' OR ');
  return `(${audience} OR ${labels})`;
}

function readItems(xml, now) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = tag(item, 'title'), link = tag(item, 'link'), description = tag(item, 'description'), publishedAt = tag(item, 'pubDate');
    const timestamp = Date.parse(publishedAt);
    let parsed;
    try { parsed = new URL(link); } catch { return null; }
    if (!title || !description || !Number.isFinite(timestamp) || timestamp > now + 12 * 60 * 60 * 1000 || parsed.protocol !== 'https:') return null;
    return { title: title.slice(0, 240), summary: description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 360), url: parsed.href, publishedAt: new Date(timestamp).toISOString() };
  }).filter(Boolean);
}

export async function searchTopics({ audience, product, classify, transport = fetch, now = Date.now }) {
  if (typeof audience !== 'string' || !audience.trim() || audience.length > 80 || typeof product !== 'string' || !product.trim() || product.length > 120) throw failure('热点搜索需要有效的人群和产品。');
  if (typeof classify !== 'function') throw failure('热点搜索缺少AI相关性筛选配置。');
  const query = buildQuery(audience.trim());
  const google = new URL('https://news.google.com/rss/search');
  google.search = new URLSearchParams({ q: query, hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' });
  const bing = new URL('https://www.bing.com/news/search');
  bing.search = new URLSearchParams({ q: query, format: 'rss' });
  let available = false, lastProvider = '';
  for (const [provider, url] of [['Google News', google], ['Bing News', bing]]) {
    let response;
    try { response = await transport(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } }); }
    catch { continue; }
    if (!response.ok) continue;
    available = true; lastProvider = provider;
    const xml = await response.text();
    if (xml.length > 1_000_000) continue;
    const items = readItems(xml, now());
    const unique = [...new Map(items.map(item => [item.title.toLocaleLowerCase(), item])).values()]
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 12);
    if (unique.length) {
      const topics = await classify(unique);
      if (Array.isArray(topics) && topics.length) return { query, provider, searchedAt: new Date(now()).toISOString(), topics: topics.slice(0, 5) };
    }
  }
  if (!available) throw failure('热点搜索服务暂不可用，请稍后重试。');
  if (lastProvider) return { query, provider: lastProvider, searchedAt: new Date(now()).toISOString(), topics: [] };
  throw failure('暂未找到可用的相关热点，请重试或跳过热点。');
}
