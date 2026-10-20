import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekAdapter } from '../lib/model.mjs';
import { bodyCharacters, editorialReport } from '../lib/editorial.mjs';
import { finalize, normalizeVerification } from '../lib/verification.mjs';

const fact = '本款电脑支持十点触控，具体以指定版本为准。';
const source = { product: { name: '测试电脑' }, facts: fact, factPath: '产品事实', sourceMode: 'local', sources: [], images: Array.from({ length: 3 }, () => ({ name: '配图', url: '/test' })) };
const task = { platform: 'wechat', audience: '职场人士', scene: '移动办公', engine: 'model' };
const makeDraft = body => ({ title: '让新的工作日常，多一个心动理由', body, cta: '欢迎咨询，预约到店体验。', tags: '' });
const scene = '下午的工作告一段落，不妨给自己的下一段日常多一点期待。从桌边整理想法，到与同伴交流灵感，值得认真投入的时刻，总会让人想起一台合心意的电脑。';
const longBody = fact + '\n\n' + scene.repeat(23);
const point = { statement: fact, sourceId: 'S1', quote: fact };
const review = status => ({ summary: '测试核验', claims: [{ field: 'body', statement: fact, status, explanation: '原文支持', evidence: [{ sourceId: 'S1', quote: fact }] }] });

test('editorial counts exclude whitespace, title, CTA and tags and use platform-specific ranges', () => {
  assert.equal(bodyCharacters('中 文\nA😀。'), 5);
  assert.equal(editorialReport('moments', makeDraft('文'.repeat(180))).status, 'within-target');
  assert.equal(editorialReport('xiaohongshu', makeDraft('文'.repeat(649))).status, 'below-target');
  assert.equal(editorialReport('wechat', makeDraft('文'.repeat(2001))).status, 'above-target');
});

test('short articles expand before review and factual rewrites are measured and expanded again', async () => {
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' });
  let writes = 0, reviews = 0, expansions = 0;
  model.json = async (system, payload) => {
    if (system.includes('资料分析员')) { assert.match(system, /至多6个/); return { points: [point] }; }
    if (system.includes('独立事实核验员')) {
      reviews++; assert.equal(payload.draft.body, longBody);
      return review(reviews === 1 ? 'conflict' : 'verified');
    }
    writes++; assert.match(payload.lengthGuidance.bodyTarget, /1400–2000/);
    if (payload.requiredEditorialCorrections) {
      expansions++; assert.equal(payload.requiredEditorialCorrections.status, 'below-target');
      assert.match(payload.requiredEditorialCorrections.instruction, /不要新增未经支持/);
      return makeDraft(longBody);
    }
    if (payload.requiredCorrections) assert.match(payload.correctionGuidance, /完整篇幅/);
    return makeDraft(fact);
  };
  const result = await model.generate(task, source);
  assert.equal(writes, 4); assert.equal(expansions, 2); assert.equal(reviews, 2);
  assert.equal(result.editorial.status, 'within-target');
  assert.equal(result.verification.content.body, result.body);
  assert.equal(result.audit.revisionCount, 3);
});

test('unmet targets remain explicit while factual conflicts still block export', async () => {
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' }); let writes = 0;
  model.json = async system => {
    if (system.includes('资料分析员')) return { points: [point] };
    if (system.includes('独立事实核验员')) return review('conflict');
    writes++; return makeDraft(fact);
  };
  const result = await model.generate(task, source);
  assert.equal(writes, 6); assert.equal(result.editorial.status, 'below-target');
  assert.equal(result.exportable, false);
  assert.equal(result.checks.find(x => x.name === '平台篇幅').status, 'pending');
});

test('edited and rechecked publications recompute length from current content', () => {
  const draft = makeDraft(longBody), chunks = [{ id: 'S1', text: fact }];
  const initial = finalize(task, source, draft, normalizeVerification(review('verified'), draft, chunks, 'test'));
  assert.equal(initial.editorial.status, 'within-target');
  const edited = makeDraft(fact);
  const next = finalize(task, source, { ...initial, ...edited }, normalizeVerification(review('verified'), edited, chunks, 'test'));
  assert.equal(next.editorial.status, 'below-target');
  assert.equal(next.editorial.bodyCharacters, bodyCharacters(fact));
  assert.match(next.strategy.note, /未达建议范围/);
});
