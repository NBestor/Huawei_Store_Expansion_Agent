import test from 'node:test';
import assert from 'node:assert/strict';
import { products, evidence, within, knowledgeRoot, parseCsv } from '../lib/local.mjs';
import { generate } from '../lib/workflow.mjs';
import { createApp } from '../server.mjs';
import { HistoryStore } from '../lib/store.mjs';
import { normalizeVerification, sourceChunks } from '../lib/verification.mjs';

test('CSV preserves quoted commas and escaped quotes', () => { assert.deepEqual(parseCsv('a,b\n"one,two","say ""yes"""\n'), [{ a: 'one,two', b: 'say "yes"' }]); });
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
test('HTTP validates incomplete tasks, blocks ima rule fallback, and serves actual images', async () => {
  const store = new HistoryStore(':memory:');
  const server = createApp({ store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = body => fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({})).status, 400);
    assert.equal((await post(null)).status, 400);
    const list = await (await fetch(`${base}/api/products`)).json();
    const task = { productId: list[0].id, audience: '<script>alert(1)</script>', scene: '移动办公', platform: 'moments' };
    assert.equal((await post({ ...task, mode: 'ima' })).status, 409);
    const response = await post(task); assert.equal(response.status, 200); const draft = await response.json();
    assert.match(draft.sessionId, /^[\da-f-]{36}$/); assert.equal(draft.version, 1); assert.equal(draft.verification.status, 'warning');
    const history = await (await fetch(`${base}/api/history`)).json(); assert.equal(history.length, 1); assert.equal(history[0].versionCount, 1);
    const editedResponse = await fetch(`${base}/api/sessions/${draft.sessionId}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'manual', expectedRevision: draft.revision, content: { title: `${draft.title} 新版`, body: draft.body, cta: draft.cta, tags: draft.tags } }) });
    assert.equal(editedResponse.status, 200); const edited = await editedResponse.json(); assert.equal(edited.version, 2); assert.equal(edited.title, `${draft.title} 新版`);
    const stale = await fetch(`${base}/api/sessions/${draft.sessionId}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: draft.revision, version: 1 }) }); assert.equal(stale.status, 409);
    const restored = await (await fetch(`${base}/api/sessions/${draft.sessionId}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: edited.revision, version: 1 }) })).json(); assert.equal(restored.title, draft.title); assert.equal(restored.versions.length, 2);
    const exported = await fetch(`${base}/api/sessions/${draft.sessionId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: restored.revision }) }); assert.equal(exported.status, 200); assert.match((await exported.json()).content, /事实核验报告/);
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
  const server = createApp({ store, model });
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
