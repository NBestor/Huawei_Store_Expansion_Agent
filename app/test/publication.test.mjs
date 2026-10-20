import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekAdapter } from '../lib/model.mjs';
import { ecosystemCard, publicationIssues, writerSources } from '../lib/publication.mjs';
import { findPresetTag } from '../lib/tags.mjs';
import { normalizeVerification, finalize } from '../lib/verification.mjs';
import { discoverOfficialSupport } from '../lib/knowledge.mjs';

const task = { ecosystemDevices: ['phone'], productName: 'HUAWEI MateBook 14' };
const chunks = [
  { id: 'S1', kind: 'ecosystem-web', ecosystemCategory: 'phone', path: 'https://consumer.huawei.com/cn/phones/pura/', text: 'HUAWEI Pura 90 支持与部分华为笔记本多屏协同，双方须满足系统版本和账号要求。' },
  { id: 'S2', kind: 'ecosystem-web', ecosystemCategory: 'pc', path: 'https://consumer.huawei.com/cn/laptops/matebook-14/', text: 'HUAWEI MateBook 14 的协同支持条件详见系统和设备兼容范围。' },
  { id: 'S3', kind: 'local', path: 'P1/卖点.md', text: '手机碰一碰传文件。' },
];
const candidate = { category: 'phone', model: 'HUAWEI Pura 90', sentence: '符合系统与账号条件时，可搭配 HUAWEI Pura 90 体验多屏协同。', evidence: [{ sourceId: 'S1', quote: chunks[0].text }, { sourceId: 'S2', quote: chunks[1].text }] };
const draft = body => ({ title: '电脑推荐', body, cta: '欢迎私信咨询。', tags: '' });

test('tag intent cannot disappear into generic PC copy or output hashtags', () => {
  const tagged = { tag: findPresetTag('time-national-subsidy') };
  assert.ok(publicationIssues(tagged, { ...draft('认识这款电脑的屏幕亮点。'), tags: '#国补' }, { card: null }).length);
  assert.deepEqual(publicationIssues(tagged, draft('借国补换新话题，认识这款电脑的屏幕亮点。'), { card: null }), []);
});
test('ecosystem card rejects wrong category, absent model, generic local and tablet-only collaboration', () => {
  assert.ok(ecosystemCard(candidate, task, chunks));
  assert.equal(ecosystemCard({ ...candidate, category: 'tablet' }, task, chunks), null);
  assert.equal(ecosystemCard({ ...candidate, model: 'HUAWEI Pura 80' }, task, chunks), null);
  assert.equal(ecosystemCard({ ...candidate, evidence: [{ sourceId: 'S3', quote: chunks[2].text }] }, task, chunks), null);
  assert.equal(ecosystemCard(candidate, task, [{ ...chunks[0], text: chunks[0].text.replace('笔记本', '平板') }, ...chunks.slice(1)]), null);
  assert.equal(ecosystemCard(candidate, { ...task, productName: 'HUAWEI MateBook 14 鸿蒙版' }, chunks), null);
  assert.equal(ecosystemCard(candidate, task, chunks.map(c => ({ ...c, path: 'https://evil.example/cn/test/' }))), null);
});
test('writer sees approved short quotes only and cannot expand one authorized collaboration sentence', () => {
  assert.equal(writerSources(chunks, { card: null }).some(source => source.kind === 'ecosystem-web'), false);
  const card = ecosystemCard(candidate, task, chunks);
  assert.deepEqual(publicationIssues(task, draft(candidate.sentence), { card }), []);
  assert.ok(publicationIssues(task, draft(candidate.sentence + '\n多屏协同，让办公更简单。'), { card }).length);
  assert.ok(publicationIssues(task, draft('华为手机都支持碰一碰。'), { card: null }).length);
});
test('semantic pairing reviewer can reject exact but incomplete official quotes', async () => {
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' }); let calls = 0;
  model.json = async system => { calls++; return system.includes('独立生态') ? { approved: false, reason: '未证明当前PC兼容范围' } : { card: candidate }; };
  const result = await model.selectEcosystem(task, { product: { name: task.productName } }, chunks);
  assert.equal(calls, 2); assert.equal(result.status, 'unavailable'); assert.equal(result.card, null);
});
test('local generic collaboration quote cannot falsely verify a companion claim', () => {
  const content = draft(chunks[2].text);
  const result = normalizeVerification({ summary: '测试', claims: [{ field: 'body', statement: content.body, status: 'verified', explanation: '支持', evidence: [{ sourceId: 'S3', quote: content.body }] }] }, content, chunks, 'test', { card: null });
  assert.equal(result.claims[0].status, 'warning');
});

test('topic angle and first paragraph cannot be bypassed by title, hashtags or a distant mention', () => {
  const topic = { topic: { title: '校园新装备', tag: '校园', angle: '面向校园日常推荐电脑' } };
  assert.ok(publicationIssues(topic, { ...draft('电脑屏幕值得了解。'), title: '校园新装备' }, { card: null }).length);
  assert.ok(publicationIssues(topic, draft('电脑亮点。'.repeat(50) + '校园换新。'), { card: null }).length);
  assert.ok(publicationIssues(topic, draft('一台新电脑。\n校园换新。'), { card: null }).length);
  assert.deepEqual(publicationIssues(topic, draft('校园里的课件与论文，给这台电脑的屏幕一个出场理由。'), { card: null }), []);
  assert.ok(publicationIssues({ tag: findPresetTag('time-national-subsidy') }, draft('最近国补话题挺热，看看这台电脑。'), { card: null }).length);
  assert.deepEqual(publicationIssues({}, draft('团队协同工作，也值得一台好电脑。'), { card: null }), []);
});

test('complete cross-page pairing survives approval, full evidence audit and recheck', async () => {
  // Synthetic fixture, not a statement about real Huawei device compatibility.
  const official = [
    { ...chunks[0], text: '测试设备 HUAWEI Pura 90 的官方型号说明。' },
    { ...chunks[1], text: '测试兼容说明：HUAWEI MateBook 14 与 HUAWEI Pura 90 在双方满足指定系统版本和同账号条件时支持多屏协同。' },
  ];
  const proposed = { ...candidate, evidence: official.map(chunk => ({ sourceId: chunk.id, quote: chunk.text })) };
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' });
  model.json = async system => system.includes('独立生态') ? { approved: true } : { card: proposed };
  const ecosystem = await model.selectEcosystem(task, { product: { name: task.productName } }, official);
  assert.equal(ecosystem.status, 'supported');
  assert.deepEqual(writerSources(official, ecosystem).map(chunk => chunk.text), official.map(chunk => chunk.text));
  const content = { ...draft(proposed.sentence), ecosystem };
  const claim = { field: 'body', statement: content.body, status: 'verified', explanation: '完整测试配对链', evidence: proposed.evidence };
  const report = normalizeVerification({ summary: '测试', claims: [claim] }, content, official, 'test', ecosystem);
  assert.equal(report.status, 'verified');
  const incomplete = normalizeVerification({ summary: '测试', claims: [{ ...claim, evidence: [claim.evidence[0]] }] }, content, official, 'test', ecosystem);
  assert.equal(incomplete.status, 'warning');
  const source = { product: { name: task.productName }, sourceMode: 'local', images: [{ url: '/test-image' }], documents: official };
  const result = finalize({ ...task, engine: 'model', platform: 'moments', audience: '职场', scene: '办公' }, source, content, report);
  assert.equal(result.ecosystem.status, 'supported');
  assert.equal(result.publication.status, 'pass');
  assert.ok(publicationIssues(task, draft(proposed.sentence.replace('符合系统与账号条件时，', '')), ecosystem).length);
  assert.equal(ecosystemCard({ ...proposed, sentence: proposed.sentence + '协同也不错。' }, task, official), null);
});

test('support search discovers only official Chinese compatibility URLs and never supplies snippets as evidence', async () => {
  const xml = '<rss><channel>' + [
    'https://consumer.huawei.com/cn/support/content/test/',
    'https://consumer.huawei.com.evil.test/cn/support/content/test/',
    'https://consumer.huawei.com/en/support/content/test/',
    'http://consumer.huawei.com/cn/support/content/test/',
    'https://consumer.huawei.com/cn/phones/test/',
  ].map(url => `<item><link>${url}</link><description>不可信协同搜索摘要</description></item>`).join('') + '</channel></rss>';
  const urls = await discoverOfficialSupport('当前电脑 手机配对', async url => {
    assert.match(new URL(url).searchParams.get('q'), /^site:consumer.huawei.com\/cn\/support\//);
    return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
  });
  assert.deepEqual(urls, ['https://consumer.huawei.com/cn/support/content/test/']);
});

test('independent angle review rejects keyword-only openings and preserves its reason', async () => {
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' });
  model.json = async (system, payload) => {
    assert.match(system, /孤立补词/); assert.equal(payload.angle.label, '国补助力电脑换新');
    return { approved: false, reason: '国补只是挂名，电脑推荐未承接换新动机。' };
  };
  const review = await model.reviewAngle({ tag: findPresetTag('time-national-subsidy') }, draft('国补。电脑很好。'));
  assert.equal(review.approved, false); assert.match(review.reason, /挂名/);
});
