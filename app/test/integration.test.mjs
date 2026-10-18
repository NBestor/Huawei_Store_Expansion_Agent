import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekAdapter, validateDraft } from '../lib/model.mjs';
import { ImaAdapter } from '../lib/ima.mjs';

const env = { DEEPSEEK_API_KEY: 'test', DEEPSEEK_MODEL: 'test' };
const source = { product: { name: '测试型号' }, facts: '测试型号具有可触控屏幕，但仅限指定版本。', factPath: '测试资料', images: [{ name: '图', url: '/test', description: '', source: '测试' }], sources: [], sourceMode: 'local' };
const draft = { title: '学习前先体验', body: '测试型号具有可触控屏幕，但仅限指定版本。', cta: '带常用文件到店体验。', tags: '', citations: [{ statement: source.facts, sourceId: 'S1', quote: source.facts }] };
const task = { audience: '学生', scene: '学习', platform: 'moments', engine: 'model' };
test('JSON requests disable default reasoning and normalize tags without changing model', async () => {
  let sent;
  const adapter = new DeepSeekAdapter(env, async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"tags":["学习","体验"]}' } }] }) };
  });
  assert.deepEqual(await adapter.json('输出JSON', {}), { tags: '学习 体验' });
  assert.equal(sent.model, env.DEEPSEEK_MODEL);
  assert.deepEqual(sent.thinking, { type: 'disabled' });
  assert.equal(sent.max_tokens, 16384);
});
test('reasoning-only truncated output and content filter cannot become a completed draft', async () => {
  for (const [reason, message] of [['length', /输出上限/], ['content_filter', /拦截/], [null, /未返回完整结果/]]) {
    const adapter = new DeepSeekAdapter(env, async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: reason, message: { content: '{}', reasoning_content: '内部推理' } }] }) }));
    await assert.rejects(adapter.json('JSON', {}), message);
  }
});
test('fabricated quotes are detected before a generated draft is accepted', () => {
  assert.equal(validateDraft(draft, [{ id: 'S1', text: source.facts }]).length, 0);
  assert.equal(validateDraft({ ...draft, body: draft.body + '仅需999元', citations: [{ ...draft.citations[0], quote: '不存在的原文引用' }] }, [{ id: 'S1', text: source.facts }]).length, 1);
});
test('fact conflict triggers one repair and still blocks export if unresolved', async () => {
  const adapter = new DeepSeekAdapter(env); let draftCalls = 0, reviewCalls = 0;
  adapter.json = async (system) => {
    if (system.includes('资料分析员')) return { points: [{ statement: source.facts, sourceId: 'S1', quote: source.facts }] };
    if (system.includes('独立事实核验员')) { reviewCalls++; return { summary: '发现明确冲突', claims: [{ field: 'body', statement: source.facts, status: 'conflict', explanation: '与依据冲突', evidence: [{ sourceId: 'S1', quote: source.facts }] }] }; }
    draftCalls++; return structuredClone(draft);
  };
  const result = await adapter.generate(task, source);
  assert.equal(draftCalls, 2); assert.equal(reviewCalls, 2); assert.equal(result.audit.revisionCount, 1); assert.equal(result.exportable, false);
});
test('valid fact report enables export, malformed report fails closed and provider errors hide bodies', async () => {
  const adapter = new DeepSeekAdapter(env);
  adapter.json = async (system) => {
    if (system.includes('资料分析员')) return { points: [{ statement: source.facts, sourceId: 'S1', quote: source.facts }] };
    if (system.includes('独立事实核验员')) return { summary: '资料一致', claims: [{ field: 'body', statement: source.facts, status: 'verified', explanation: '原文支持', evidence: [{ sourceId: 'S1', quote: source.facts }] }] };
    return structuredClone(draft);
  };
  const result = await adapter.generate(task, source); assert.equal(result.exportable, true); assert.equal(result.evidence.chunks.length, 1);
  adapter.json = async (system) => {
    if (system.includes('资料分析员')) return { points: [{ statement: source.facts, sourceId: 'S1', quote: source.facts }] };
    if (system.includes('独立事实核验员')) return { approved: 'true' };
    return structuredClone(draft);
  };
  const malformed = await adapter.generate(task, source); assert.equal(malformed.verification.status, 'error'); assert.equal(malformed.exportable, false);
  const bad = new DeepSeekAdapter(env, async () => ({ ok: false, status: 401 }));
  await assert.rejects(bad.request('models'), /凭证无效/);
});

test('missing evidence becomes a warning and remains exportable', async () => {
  const adapter = new DeepSeekAdapter(env);
  adapter.json = async (system) => {
    if (system.includes('资料分析员')) return { points: [{ statement: source.facts, sourceId: 'S1', quote: source.facts }] };
    if (system.includes('独立事实核验员')) return { summary: '部分内容无明确依据', claims: [{ field: 'title', statement: draft.title, status: 'warning', explanation: '未找到明确依据', evidence: [] }] };
    return structuredClone(draft);
  };
  const result = await adapter.generate(task, source);
  assert.equal(result.audit.approved, true);
  assert.equal(result.exportable, true);
  assert.equal(result.verification.status, 'warning');
});
test('ima pagination, real kb field names, browse fallback and notebook evidence', async () => {
  const calls = [];
  const adapter = new ImaAdapter({ IMA_KB_NAME: '赛事库' }, async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    let data;
    if (endpoint.endsWith('search_knowledge_base')) data = payload.cursor ? { info_list: [{ kb_id: 'kb', kb_name: '赛事库' }], is_end: true } : { info_list: [], next_cursor: 'second' };
    else if (endpoint.endsWith('search_knowledge')) data = { info_list: [], is_end: true };
    else if (endpoint.endsWith('get_knowledge_list')) data = { knowledge_list: [{ title: '测试型号.md', media_id: 'doc', media_type: 11 }], is_end: true };
    else if (endpoint.endsWith('get_media_info')) data = { media_type: 11, notebook_ext_info: { notebook_id: 'note' } };
    else data = { content: source.facts };
    return { code: 0, data };
  });
  const result = await adapter.evidence({ id: 'P1-产品参数库/分类/型号', name: '测试型号' });
  assert.equal(result.sourceMode, 'ima'); assert.match(result.facts, /可触控/);
  assert.ok(calls.some(x => x.endpoint.endsWith('get_knowledge_list')));
  assert.ok(calls.some(x => x.payload.cursor === 'second'));
});
test('ima business errors and non-official media destinations stop dependent work', async () => {
  const adapter = new ImaAdapter({}, async () => ({ code: 222000, msg: 'secret internal message' }));
  await assert.rejects(adapter.call('test', {}), error => error.publicMessage.includes('222000') && !error.publicMessage.includes('secret'));
  await assert.rejects(adapter.download({ url: 'http://127.0.0.1/private' }), /域名暂不支持/);
  const limited = new ImaAdapter({}, async () => ({ code: 220021, msg: '资料获取次数已达上限，请明天再尝试' }));
  await assert.rejects(limited.call('test', {}), /今日资料获取次数已达上限/);
});
test('ima real imported product directory supplies facts and images without unrelated price cards', async () => {
  const adapter = new ImaAdapter({ IMA_KB_NAME: '赛事库' }, async (endpoint, payload) => {
    let data;
    if (endpoint.endsWith('search_knowledge_base')) data = { info_list: [{ kb_id: 'kb', kb_name: '赛事库' }], is_end: true };
    else if (endpoint.endsWith('search_knowledge')) data = { info_list: [{ media_id: 'price', title: '测试型号-价格卡.md' }], is_end: true };
    else if (endpoint.endsWith('get_knowledge_list')) {
      const tree = {
        root: [{ media_type: 99, media_id: 'wrapper', title: '赛事库' }],
        wrapper: [{ media_type: 99, media_id: 'p1', title: 'P1-产品参数库' }],
        p1: [{ media_type: 99, media_id: 'category', title: '分类' }],
        category: [{ media_type: 99, media_id: 'product', title: '型号' }],
        product: [{ media_type: 7, media_id: 'facts', title: '产品事实.md' }, { media_type: 99, media_id: 'images', title: 'images' }],
        images: [{ media_type: 9, media_id: 'image', title: '01.png' }],
      };
      data = { knowledge_list: tree[payload.folder_id || 'root'], is_end: true };
    } else if (endpoint.endsWith('get_media_info')) {
      assert.notEqual(payload.media_id, 'price');
      data = { media_type: payload.media_id === 'image' ? 9 : 7, url_info: { url: 'https://skb.ima.myqcloud.com/test' } };
    }
    return { code: 0, data };
  });
  adapter.download = async () => ({ buffer: Buffer.from(source.facts), type: 'text/plain' });
  const result = await adapter.evidence({ id: 'P1-产品参数库/分类/型号', name: '测试型号' });
  assert.equal(result.images.length, 1); assert.match(result.images[0].url, /^\/api\/ima-image\?token=/);
  assert.deepEqual(result.sources, ['产品事实.md']);
});
