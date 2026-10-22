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

function buildQueries(audience) {
  const group = labels => `(${labels.map(value => `"${value}"`).join(' OR ')})`;
  const people = /学生|新生|校园|考研|考公/.test(audience) ? ['大学生', '大学新生', '校园']
    : /职场|办公|出差|通勤|商务/.test(audience) ? ['职场', '办公', '出差']
    : /创作者|内容|设计|摄影|视频/.test(audience) ? ['内容创作', '摄影', '视频剪辑']
    : /家庭|亲子|父母|家用/.test(audience) ? ['家庭', '亲子', '居家'] : ['数码', '游戏', '科技'];
  return [
    `${group(people)} ${group(['国补', '以旧换新', '消费券', '购机优惠'])}`,
    `${group(audienceLabels(audience).slice(0, 7))} ${group(['电脑', '笔记本', '数码'])}`,
    `${group(people)} ${group(['AI应用', '学习工具', '效率工具', '鸿蒙生态'])}`,
  ];
}

function readItems(xml, now) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = tag(item, 'title'), link = tag(item, 'link'), description = tag(item, 'description'), publishedAt = tag(item, 'pubDate');
    const timestamp = Date.parse(publishedAt);
    let parsed;
    try { parsed = new URL(link); } catch { return null; }
    if (!title || !description || /博彩|赌博|赌场|体育投注|亚[博愽搏]|澳门.*娱乐城|真人娱乐/.test(`${title} ${description}`) || !Number.isFinite(timestamp) || timestamp > now + 12 * 60 * 60 * 1000 || parsed.protocol !== 'https:') return null;
    return { title: title.slice(0, 240), summary: description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 360), url: parsed.href, publishedAt: new Date(timestamp).toISOString() };
  }).filter(Boolean);
}

export async function searchTopics({ audience, product, classify, generate, transport = fetch, now = Date.now }) {
  if (typeof audience !== 'string' || !audience.trim() || audience.length > 80 || typeof product !== 'string' || !product.trim() || product.length > 120) throw failure('热点搜索需要有效的人群和产品。');
  if (typeof generate === 'function') {
    const topics = await generate();
    if (Array.isArray(topics) && topics.length) return { query: audience.trim(), provider: 'deepseek-model', candidateCount: topics.length, searchedAt: new Date(now()).toISOString(), topics: topics.slice(0, 5) };
    throw failure('热点生成暂不可用，请稍后重试。');
  }
  if (typeof classify !== 'function') throw failure('热点搜索缺少AI相关性筛选配置。');
  const queries = buildQueries(audience.trim()), query = queries.join('；');
  let available = false, lastProvider = '', candidateCount = 0;
  const seen = new Set();
  for (const provider of ['Google News', 'Bing News']) {
    const batches = await Promise.allSettled(queries.map(async term => {
      const url = new URL(provider === 'Google News' ? 'https://news.google.com/rss/search' : 'https://www.bing.com/news/search');
      url.search = new URLSearchParams(provider === 'Google News' ? { q: term, hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' } : { q: term, format: 'rss' });
      const response = await transport(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      if (!response.ok) throw new Error('Unavailable feed');
      const xml = await response.text();
      if (xml.length > 1_000_000 || !/<rss(?:\s|>)/i.test(xml)) throw new Error('Invalid feed');
      return readItems(xml, now()).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    }));
    const feeds = batches.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (!feeds.length) continue;
    available = true; lastProvider = provider;
    // Interleave query groups so one broad, busy topic cannot crowd out all other angles.
    const unique = [];
    for (let index = 0; index < Math.max(0, ...feeds.map(items => items.length)) && unique.length < 18; index++) {
      for (const feed of feeds) {
        const item = feed[index], key = item?.title.toLocaleLowerCase();
        if (!item || seen.has(key) || unique.length >= 18) continue;
        seen.add(key); unique.push(item);
      }
    }
    candidateCount += unique.length;
    if (unique.length) {
      const topics = await classify(unique);
      if (Array.isArray(topics) && topics.length) return { query, provider, candidateCount, searchedAt: new Date(now()).toISOString(), topics: topics.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 5) };
    }
  }
  if (!available) throw failure('热点搜索服务暂不可用，请稍后重试。');
  if (lastProvider) return { query, provider: lastProvider, candidateCount, searchedAt: new Date(now()).toISOString(), topics: [] };
  throw failure('暂未找到可用的相关热点，请重试或跳过热点。');
}
