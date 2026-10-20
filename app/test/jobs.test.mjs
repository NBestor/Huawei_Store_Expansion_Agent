import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Jobs } from '../lib/jobs.mjs';
import { problem, HistoryStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';
import { products } from '../lib/local.mjs';
import { offlineVerification } from '../lib/verification.mjs';
import { request, responseError, waitForJob } from '../public/http.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
test('jobs deduplicate submissions, reject changed content, sanitize failure and expire only completed tasks', async () => {
  let now = 0, calls = 0, finish;
  const jobs = new Jobs({ now: () => now, retentionMs: 100 }), id = randomUUID();
  const work = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  assert.equal(jobs.submit(id, 'generation', { a: 1 }, work).status, 'running');
  assert.equal(jobs.submit(id, 'generation', { a: 1 }, work).jobId, id);
  assert.throws(() => jobs.submit(id, 'generation', { a: 2 }, work), /编号已用于/);
  assert.throws(() => jobs.submit(randomUUID(), 'generation', {}, work), /仍在后台/);
  await tick(); assert.equal(calls, 1); now = 1000;
  assert.equal(jobs.get(id).status, 'running', 'retention cannot cause paid work to be resubmitted');
  finish({ sessionId: 'saved-once' }); await tick();
  assert.equal(jobs.get(id).result.sessionId, 'saved-once');
  assert.equal(jobs.submit(id, 'generation', { a: 1 }, work).status, 'succeeded');
  const failed = randomUUID(); jobs.submit(failed, 'other', {}, () => { throw new Error('secret provider HTML'); }); await tick();
  assert.doesNotMatch(jobs.get(failed).error, /secret|HTML/);
  const conflict = randomUUID(); jobs.submit(conflict, 'other', {}, () => { throw problem('该会话已有新版本', 409); }); await tick();
  assert.equal(jobs.get(conflict).errorStatus, 409);
  now = 1101; assert.throws(() => jobs.get(id), /先查看历史/);
});

test('frontend suppresses proxy HTML, preserves safe input errors and retries only job reads', async () => {
  const html = '<html><h1>504 Gateway Time-out</h1><p>nginx padding</p></html>';
  const error = await responseError(new Response(html, { status: 504, headers: { 'Content-Type': 'text/html' } }));
  assert.equal(error.status, 504); assert.match(error.message, /勿重复生成/); assert.doesNotMatch(error.message, /<html>|nginx/);
  const input = await responseError(Response.json({ error: '请选择产品' }, { status: 400 }));
  assert.equal(input.message, '请选择产品');
  const bad = await responseError(Response.json({ error: html }, { status: 400 })); assert.doesNotMatch(bad.message, /<html>/);
  await assert.rejects(request('/test', {}, async () => new Response(html)), /异常内容/);
  const id = randomUUID(); let reads = 0;
  const result = await waitForJob(id, { pause: async () => {}, read: async url => {
    assert.equal(url, `/api/jobs/${id}`); reads++;
    if (reads === 1) throw Object.assign(new Error('504'), { status: 504 });
    return { jobId: id, status: reads === 2 ? 'running' : 'succeeded', result: { sessionId: 'original' } };
  } });
  assert.equal(result.sessionId, 'original'); assert.equal(reads, 3);
  let attempts = 0;
  await assert.rejects(waitForJob(id, { pause: async () => {}, read: async () => { attempts++; throw new Error('offline'); } }), error => error.pending === true);
  assert.equal(attempts, 5);
  await assert.rejects(waitForJob(id, { read: async () => ({ jobId: id, status: 'failed', error: '已有新版本', errorStatus: 409 }) }), error => error.status === 409);
});

test('async HTTP responds before generation finishes and recovers one saved session after a lost response', async () => {
  const store = new HistoryStore(':memory:'); let release, reached;
  const waiting = new Promise(resolve => { reached = resolve; });
  let calls = 0;
  const model = { inspect: async (task, source, draft) => ({ source, verification: offlineVerification(draft) }), generate: async () => {
    calls++; reached(); await new Promise(resolve => { release = resolve; });
    return { title: '任务结果', body: '电脑宣传正文', cta: '欢迎体验', tags: '', images: [], evidence: { documents: [], facts: '', path: '', sources: [], trace: [] } };
  } };
  const server = createApp({ store, model, publicOrigin: 'http://studio.example' }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, id = randomUUID();
  const task = { productId: (await products())[0].id, audience: '大学新生', platform: 'moments', engine: 'model', autoOfficialImages: false };
  const submit = (value = task, requestId = id) => fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'respond-async', 'X-Request-Id': requestId }, body: JSON.stringify(value) });
  try {
    const foreign = await fetch(`${base}/api/generate`, { method: 'POST', headers: { Origin: 'http://foreign.example' }, body: '{}' }); assert.equal(foreign.status, 403);
    const publicRequest = await fetch(`${base}/api/generate`, { method: 'POST', headers: { Origin: 'http://studio.example' }, body: '{}' }); assert.equal(publicRequest.status, 400, 'configured public origin reaches validation');
    const first = await submit(); assert.equal(first.status, 202); assert.equal(first.headers.get('Preference-Applied'), 'respond-async');
    await waiting;
    // Ignore first response body as if the gateway dropped it; the client already knows the ID.
    const pending = await (await fetch(`${base}/api/jobs/${id}`)).json(); assert.equal(pending.status, 'running');
    assert.equal((await submit()).status, 202); assert.equal(calls, 1);
    assert.equal((await submit({ ...task, audience: '职场' })).status, 409);
    assert.equal((await submit(task, randomUUID())).status, 429);
    assert.equal((await fetch(`${base}/api/history`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE_ALL_HISTORY' }) })).status, 409);
    release();
    const done = await waitForJob(id, { pause: tick, read: async url => (await fetch(base + url)).json() });
    assert.equal(done.title, '任务结果'); assert.equal(store.list().length, 1); assert.equal(calls, 1);
    assert.equal((await (await submit()).json()).result.sessionId, done.sessionId);
    const invalidId = randomUUID(); assert.equal((await submit({}, invalidId)).status, 202);
    await assert.rejects(waitForJob(invalidId, { pause: tick, read: async url => (await fetch(base + url)).json() }), error => error.status === 400);
    const revision = done.revision, editId = randomUUID();
    const editing = await fetch(`${base}/api/sessions/${done.sessionId}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'respond-async', 'X-Request-Id': editId }, body: JSON.stringify({ action: 'manual', expectedRevision: revision, content: { title: done.title, body: done.body, cta: done.cta, tags: done.tags } }) });
    assert.equal(editing.status, 202);
    const edited = await waitForJob(editId, { pause: tick, read: async url => (await fetch(base + url)).json() });
    assert.equal(edited.revision, revision, 'no-change edit retains revision');
    const checkId = randomUUID();
    const checking = await fetch(`${base}/api/sessions/${done.sessionId}/recheck`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'respond-async', 'X-Request-Id': checkId }, body: JSON.stringify({ expectedRevision: revision }) });
    assert.equal(checking.status, 202);
    const checked = await waitForJob(checkId, { pause: tick, read: async url => (await fetch(base + url)).json() });
    assert.equal(checked.revision, revision + 1);
    const staleId = randomUUID();
    await fetch(`${base}/api/sessions/${done.sessionId}/recheck`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'respond-async', 'X-Request-Id': staleId }, body: JSON.stringify({ expectedRevision: revision }) });
    await assert.rejects(waitForJob(staleId, { pause: tick, read: async url => (await fetch(base + url)).json() }), error => error.status === 409);
    assert.equal((await fetch(`${base}/api/jobs/${randomUUID()}`)).status, 404);
  } finally { release?.(); await new Promise(resolve => server.close(resolve)); store.close(); }
});
