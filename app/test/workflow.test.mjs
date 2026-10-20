import test from 'node:test';
import assert from 'node:assert/strict';
import { products, evidence, within, knowledgeRoot, parseCsv } from '../lib/local.mjs';
import { generate, voiceProfiles } from '../lib/workflow.mjs';
import { createApp } from '../server.mjs';
import { HistoryStore } from '../lib/store.mjs';
import { normalizeVerification, sourceChunks } from '../lib/verification.mjs';
import { dependency } from '../lib/dependencies.mjs';
import { searchTopics } from '../lib/topics.mjs';
import { getTagLibrary, recommendPresetTags } from '../lib/tags.mjs';

test('CSV preserves quoted commas and escaped quotes', () => { assert.deepEqual(parseCsv('a,b\n"one,two","say ""yes"""\n'), [{ a: 'one,two', b: 'say "yes"' }]); });
test('preset tag library has distinct typed records and valid category references', () => {
  const library = getTagLibrary(), categoryIds = new Set(library.categories.map(item => item.id));
  assert.equal(library.categories.length, 10); assert.equal(library.categories.find(item => item.id === 'computer').available, true);
  assert.ok(library.categories.filter(item => item.id !== 'computer').every(item => item.available === false));
  const all = [...library.categoryTags, ...library.timingTags, ...library.hotTags, ...library.crossTags];
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
  for (const tag of all) {
    assert.ok(tag.id && tag.label && tag.angle && tag.guardrails.length);
    assert.ok(tag.categories.every(id => categoryIds.has(id)));
  }
  assert.ok(library.timingTags.some(item => item.id === 'time-national-subsidy'));
  const subsidy = library.timingTags.find(item => item.id === 'time-national-subsidy');
  assert.deepEqual(subsidy.categories, ['computer']);
  assert.match(subsidy.angle, /推荐本款电脑/); assert.match(subsidy.guardrails.join(' '), /不得承诺可享/);
  assert.deepEqual(library.hotTags.find(item => item.id === 'hot-subsidy').categories, ['computer']);
  assert.ok(library.hotTags.some(item => item.id === 'hot-price-cut'));
  assert.ok(library.needMappings.travel.categories.includes('phone'));
});
test('tag recommendations stay PC-focused and activate timing by month', () => {
  const student = recommendPresetTags({ audience: '大学新生', month: 9 });
  assert.ok(student.scenes.length <= 5); assert.ok(student.timing.length <= 3);
  assert.ok(student.scenes.every(tag => tag.categories.includes('computer')));
  assert.ok(student.timing.every(tag => tag.categories.includes('computer') && tag.effective.months.includes(9)));
  assert.equal(student.scenes[0].id, 'computer-campus');
  const october = recommendPresetTags({ audience: '职场人士', month: 10 });
  assert.ok(october.timing.some(tag => tag.id === 'time-national-day'));
  assert.throws(() => recommendPresetTags({ audience: '学生', month: 13 }));
});
test('topic search uses audience labels, keeps older HTTPS results and prioritizes freshness', async () => {
  const now = Date.parse('2026-10-20T00:00:00Z');
  const xml = `<rss><channel>
    <item><title>新鲜热点</title><link>https://news.example/a</link><description><![CDATA[近期&nbsp;话题摘要]]></description><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate></item>
    <item><title>旧热点</title><link>https://news.example/b</link><description>旧摘要</description><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate></item>
    <item><title>不安全链接</title><link>http://news.example/c</link><description>摘要</description><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate></item>
    <item><title>无时间</title><link>https://news.example/d</link><description>摘要</description></item>
  </channel></rss>`;
  let requested;
  const result = await searchTopics({ audience: '大学新生', product: 'MateBook', now: () => now, classify: async topics => topics.map((topic, index) => ({ ...topic, tag: '学习效率', angle: `创作切入 ${index}` })), transport: async (url, options) => { requested = new URL(url); assert.equal(options.redirect, 'follow'); return { ok: true, text: async () => xml }; } });
  assert.match(requested.searchParams.get('q'), /大学新生/);
  assert.match(requested.searchParams.get('q'), /开学季/);
  assert.deepEqual(result.topics.map(topic => topic.title), ['新鲜热点', '旧热点']);
  assert.equal(result.topics[0].summary, '近期 话题摘要');
  assert.equal(result.topics[0].publishedAt, '2026-10-19T10:00:00.000Z');
  assert.equal(result.topics[0].tag, '学习效率');
  assert.equal(result.topics[0].angle, '创作切入 0');
  assert.equal(result.provider, 'Google News');
});
test('topic search falls back to Bing when Google has no AI-relevant entries', async () => {
  let calls = 0;
  const stale = '<rss><channel><item><title>旧热点</title><link>https://news.example/old</link><description>旧摘要</description><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  const fresh = '<rss><channel><item><title>新热点</title><link>https://news.example/new</link><description>近期摘要</description><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  const result = await searchTopics({ audience: '大学新生', product: 'MateBook', now: () => Date.parse('2026-10-20T00:00:00Z'), classify: async topics => calls === 1 ? [] : topics.map(topic => ({ ...topic, tag: '学习效率', angle: '结合线上学习' })), transport: async () => ({ ok: true, text: async () => ++calls === 1 ? stale : fresh }) });
  assert.equal(calls, 2); assert.equal(result.provider, 'Bing News'); assert.equal(result.topics[0].title, '新热点');
});
test('real reference evidence, platform image counts and honest pending checks', async () => {
  const list = await products(); assert.ok(list.length >= 3);
  const source = await evidence(list[0].id); assert.ok(source.facts.length > 100); assert.ok(source.images.length >= 3);
  for (const [platform, count] of [['xiaohongshu', 3], ['wechat', 3], ['moments', 1]]) {
    const draft = generate({ audience: '大学新生', scene: '开学购机', platform }, source);
    assert.equal(draft.images.length, count); assert.equal(draft.checks[0].status, 'pending');
    assert.match(draft.body, /开学购机/); assert.equal(draft.mode, 'local-rule-draft');
  }
  await assert.rejects(within(knowledgeRoot, '../../package.json'));
  await assert.rejects(evidence('../invalid'));
});
test('voice profiles change the rule-draft CTA and task validation rejects unknown voices', async () => {
  const product = (await products())[0], source = await evidence(product.id);
  for (const [voice, profile] of Object.entries(voiceProfiles)) {
    const draft = generate({ audience: '大学新生', scene: '开学购机', platform: 'moments', voice }, source);
    assert.equal(draft.cta, profile.cta);
    assert.equal(draft.strategy.voice, profile.label);
  }
  const store = new HistoryStore(':memory:');
  const server = createApp({ store, imageTransport: async () => { throw new Error('offline fixture'); } }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = body => fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const baseTask = { productId: product.id, audience: '大学新生', platform: 'moments', engine: 'rules' };
    const defaulted = await (await post(baseTask)).json(); assert.equal(defaulted.task.voice, 'friendly');
    const selected = await (await post({ ...baseTask, voice: 'warm' })).json(); assert.equal(selected.task.voice, 'warm');
    assert.equal((await post({ ...baseTask, voice: 'unknown' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
test('HTTP validates incomplete tasks, serves topic search and blocks ima rule fallback', async () => {
  const store = new HistoryStore(':memory:');
  let topicInput;
  const server = createApp({ store, imageTransport: async () => { throw new Error('offline fixture'); }, topicSearch: async input => { topicInput = input; return { topics: [{ title: '近期热点' }] }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (body, route = '/api/generate') => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({})).status, 400);
    assert.equal((await post(null)).status, 400);
    const list = await (await fetch(`${base}/api/products`)).json();
    const tags = await (await fetch(`${base}/api/tags`)).json();
    assert.equal(tags.categories.length, 10); assert.ok(tags.hotTags.some(tag => tag.id === 'hot-subsidy'));
    const recommendations = await (await fetch(`${base}/api/tags/recommend?audience=${encodeURIComponent('大学新生')}&month=9`)).json();
    assert.equal(recommendations.scenes[0].id, 'computer-campus'); assert.ok(recommendations.timing.every(tag => tag.effective.months.includes(9)));
    const subsidy = tags.timingTags.find(tag => tag.id === 'time-national-subsidy');
    const angleResponse = await post({ productId: list[0].id, tagId: subsidy.id, audience: '大学新生', platform: 'moments', autoOfficialImages: false });
    const angled = await angleResponse.json(); assert.equal(angleResponse.status, 200);
    assert.equal(angled.task.tag.angle, subsidy.angle); assert.equal(angled.task.scene, subsidy.angle);
    assert.ok(!angled.body.includes(subsidy.angle), 'internal angle instructions must not be copied into rule-draft body');
    store.delete(angled.sessionId);
    const activeTags = [...tags.categoryTags, ...tags.timingTags, ...tags.hotTags, ...tags.crossTags].filter(tag => tag.categories.includes('computer'));
    assert.equal(activeTags.length, 48);
    assert.ok(activeTags.every(tag => /电脑/.test(tag.angle)));
    assert.equal((await fetch(`${base}/api/tags/recommend?month=13`)).status, 400);
    assert.equal((await fetch(`${base}/api/tags/recommend?month=0`)).status, 400);
    assert.equal((await post({ productId: list[0].id, audience: '大学新生', categoryId: 'phone', platform: 'moments' })).status, 409);
    assert.equal((await post({ productId: 'invalid', audience: '大学新生' }, '/api/topics')).status, 400);
    const topicResponse = await post({ productId: list[0].id, audience: '大学新生' }, '/api/topics');
    assert.equal(topicResponse.status, 200); assert.equal((await topicResponse.json()).topics[0].title, '近期热点');
    assert.equal(topicInput.product, list[0].name);
    assert.equal(typeof topicInput.classify, 'function');
    const task = { productId: list[0].id, tagId: 'computer-campus', audience: '<script>alert(1)</script>', scene: '移动办公', platform: 'moments', ecosystemDevices: ['phone', 'tablet', 'phone'] };
    assert.equal((await post({ ...task, ecosystemDevices: ['television'] })).status, 400);
    assert.equal((await post({ ...task, mode: 'ima' })).status, 409);
    const response = await post(task); assert.equal(response.status, 200); const draft = await response.json(); assert.equal(draft.task.engine, 'rules'); assert.equal(draft.task.tag.id, 'computer-campus'); assert.deepEqual(draft.task.ecosystemDevices, ['phone', 'tablet']);
    assert.match(draft.sessionId, /^[\da-f-]{36}$/); assert.equal(draft.version, 1); assert.equal(draft.verification.status, 'warning');
    const history = await (await fetch(`${base}/api/history`)).json(); assert.equal(history.length, 1); assert.equal(history[0].versionCount, 1);
    const editedResponse = await fetch(`${base}/api/sessions/${draft.sessionId}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'manual', expectedRevision: draft.revision, content: { title: `${draft.title} 新版`, body: draft.body, cta: draft.cta, tags: draft.tags } }) });
    assert.equal(editedResponse.status, 200); const edited = await editedResponse.json(); assert.equal(edited.version, 2); assert.equal(edited.title, `${draft.title} 新版`);
    const stale = await fetch(`${base}/api/sessions/${draft.sessionId}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: draft.revision, version: 1 }) }); assert.equal(stale.status, 409);
    const restored = await (await fetch(`${base}/api/sessions/${draft.sessionId}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: edited.revision, version: 1 }) })).json(); assert.equal(restored.title, draft.title); assert.equal(restored.versions.length, 2);
    const exported = await fetch(`${base}/api/sessions/${draft.sessionId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: restored.revision }) });
    assert.equal(exported.status, 200); assert.match(exported.headers.get('content-type'), /application\/pdf/);
    assert.match(exported.headers.get('content-disposition'), /\.pdf/);
    const bytes = Buffer.from(await exported.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const parsed = await dependency('pdf-lib').PDFDocument.load(bytes);
    assert.ok(parsed.getPageCount() >= draft.images.length + 3, 'PDF includes the cover, copy, image pages, and source page');
    const imageObjects = parsed.context.enumerateIndirectObjects().filter(([, object]) => object?.dict?.get?.(dependency('pdf-lib').PDFName.of('Subtype'))?.toString() === '/Image');
    assert.ok(imageObjects.length >= draft.images.length, 'all selected photos are embedded as image objects');
    const image = await fetch(`${base}${draft.images[0].url}`); assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /image/);
    assert.equal((await fetch(`${base}/api/image?path=../../package.json`)).status, 400);
    assert.equal((await fetch(base)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('HTTP fragment editing preserves locks, automatically verifies and enforces server export decisions', async () => {
  const store = new HistoryStore(':memory:'); let edits = 0, inspections = 0, conflict = false;
  const model = {
    async editFragment() { edits++; return '更新后的结尾。'; },
    async inspect(_task, source, draft) {
      inspections++;
      const chunks = sourceChunks(source), cite = { sourceId: chunks[0].id, quote: chunks[0].text.slice(0, 20) };
      return { source, verification: normalizeVerification({ summary: conflict ? '明确冲突' : '无充分依据，供用户确认', claims: [{ field: 'body', statement: draft.body, status: conflict ? 'conflict' : 'warning', explanation: '测试独立核验结论', evidence: conflict ? [cite] : [] }] }, draft, chunks, 'test') };
    },
  };
  const server = createApp({ store, model, imageTransport: async () => { throw new Error('offline fixture'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body, method = 'POST') => fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const product = (await products())[0];
    const initial = await (await post('/api/generate', { productId: product.id, audience: '大学新生', scene: '学习', platform: 'moments', engine: 'rules' })).json();
    const route = `/api/sessions/${initial.sessionId}`;
    const locked = await (await post(`${route}/locks`, { expectedRevision: initial.revision, operation: 'add', field: 'body', start: 0, end: 4 })).json();
    const denied = await post(`${route}/edit`, { expectedRevision: locked.revision, action: 'ai', field: 'body', start: 0, end: 6, instruction: '改写' });
    assert.equal(denied.status, 400); assert.equal(edits, 0);
    const start = locked.body.length - 4;
    const response = await post(`${route}/edit`, { expectedRevision: locked.revision, action: 'ai', field: 'body', start, end: locked.body.length, instruction: '精简结尾' });
    assert.equal(response.status, 200); const edited = await response.json();
    assert.equal(edited.body, locked.body.slice(0, start) + '更新后的结尾。');
    assert.equal(edited.title, locked.title); assert.equal(edited.cta, locked.cta);
    assert.deepEqual(edited.locks, locked.locks); assert.equal(edited.version, 3);
    assert.equal(edits, 1); assert.equal(inspections, 1); assert.equal(edited.verification.status, 'warning');
    assert.equal((await post(`${route}/export`, { expectedRevision: edited.revision })).status, 200);
    conflict = true;
    const checked = await (await post(`${route}/recheck`, { expectedRevision: edited.revision })).json();
    assert.equal(checked.verification.status, 'conflict');
    const blocked = await post(`${route}/export`, { expectedRevision: checked.revision, exportable: true, verification: { status: 'verified' } });
    assert.equal(blocked.status, 409);
    const restored = await (await fetch(`${base}${route}`)).json();
    assert.equal(restored.verification.status, 'conflict'); assert.equal(restored.versions.length, 4);
    assert.equal((await post('/api/history', {}, 'DELETE')).status, 400);
    assert.equal((await post('/api/history', { confirm: 'DELETE_ALL_HISTORY' }, 'DELETE')).status, 200);
    assert.equal((await fetch(`${base}${route}`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
