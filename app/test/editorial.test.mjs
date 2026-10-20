import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekAdapter } from '../lib/model.mjs';
import { bodyCharacters, editorialReport } from '../lib/editorial.mjs';
import { finalize, normalizeVerification } from '../lib/verification.mjs';
import { findPresetTag } from '../lib/tags.mjs';
import { marketingCopyIssues, salesAngleGuidance } from '../lib/workflow.mjs';

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

test('selected sales angle and evidence boundaries survive planning, expansion, factual repair and fragment editing', async () => {
  const tag = findPresetTag('time-national-subsidy');
  const selectedTask = { ...task, tag, scene: tag.angle };
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' });
  let writes = 0, reviews = 0, plans = 0, edits = 0;
  model.json = async (system, payload) => {
    if (system.includes('独立销售角度')) return { approved: true };
    if (system.includes('独立事实核验员')) {
      assert.ok(!system.includes(salesAngleGuidance), 'sales instructions must not influence factual audit');
      return review(++reviews === 1 ? 'conflict' : 'verified');
    }
    assert.equal(payload.salesAngleGuidance, salesAngleGuidance);
    assert.match(payload.salesAngleGuidance, /没有适用依据时.*不能暗示本机可享补贴/);
    assert.match(payload.salesAngleGuidance, /有当前官方原文.*购机实惠写成购买理由/);
    assert.deepEqual(payload.sources, [{ id: 'S1', path: '产品事实', kind: 'local', text: fact }]);
    if (system.includes('局部文案编辑')) {
      edits++; assert.equal(payload.task.tag.angle, tag.angle);
      assert.match(system, /只在修改cta时/);
      return { replacement: '让下一段工作日常，多一个心动理由。' };
    }
    assert.equal(payload.task.creativeTag.angle, tag.angle);
    assert.equal(payload.task.scene, tag.angle);
    if (system.includes('资料分析员')) {
      plans++; assert.match(system, /附完整适用条件的购机权益事实/);
      return { points: [point] };
    }
    assert.ok(system.includes(salesAngleGuidance));
    assert.ok(!system.includes('且至多一句自然的购买引导'));
    writes++;
    return makeDraft(writes === 1 ? fact : '聊到国补换新，不妨认识这款电脑。' + longBody);
  };
  const result = await model.generate(selectedTask, source);
  assert.equal(result.verification.status, 'verified');
  assert.equal(writes, 3); assert.equal(reviews, 2); assert.equal(plans, 1);
  const replacement = await model.editFragment(selectedTask, source, result, { field: 'body', start: 0, end: fact.length, text: fact }, '更有吸引力', []);
  assert.equal(replacement, '让下一段工作日常，多一个心动理由。'); assert.equal(edits, 1);
});

test('sales copy repairs customer policy homework without rejecting concise offer conditions', () => {
  assert.ok(marketingCopyIssues(makeDraft('欢迎了解这款电脑。建议自行核对当地政策，看看是否符合条件。')).length > 0);
  assert.deepEqual(marketingCopyIssues(makeDraft('这款电脑，给新学期更多期待。活动限指定地区、指定型号，适用条件以活动说明为准。')), []);
});

test('unsupported body effects are repaired again when the first factual rewrite still lacks evidence', async () => {
  const model = new DeepSeekAdapter({ DEEPSEEK_MODEL: 'test' });
  let writes = 0, reviews = 0;
  model.json = async (system, payload) => {
    if (system.includes('资料分析员')) return { points: [point] };
    if (system.includes('独立事实核验员')) return review(++reviews < 3 ? 'warning' : 'verified');
    writes++;
    assert.match(payload.currentDate, /^\d{4}-\d{2}-\d{2}$/);
    if (writes > 1) {
      assert.equal(payload.requiredCorrections[0].status, 'warning');
      assert.match(payload.correctionGuidance, /不允许只换同义词/);
    }
    return makeDraft(longBody);
  };
  const result = await model.generate(task, source);
  assert.equal(writes, 3); assert.equal(reviews, 3);
  assert.equal(result.verification.status, 'verified');
});
