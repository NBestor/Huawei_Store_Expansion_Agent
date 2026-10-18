import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryStore, present } from '../lib/store.mjs';
import { addLock, mergeManual, mergeReplacement } from '../lib/editor.mjs';
import { normalizeVerification } from '../lib/verification.mjs';
import { FactTools, vmallUrl } from '../lib/knowledge.mjs';
import { products } from '../lib/local.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const task = { productId: 'p', audience: '学生', scene: '学习', platform: 'moments', mode: 'local', engine: 'rules', webUrls: [] };
const draft = { title: '标题', body: '这是必须保留的事实。后面可以修改。', cta: '了解更多', tags: '', product: { name: '型号' }, verification: { status: 'warning' } };
test('SQLite sessions append versions, restore complete snapshots and reject stale writes', () => {
  const store = new HistoryStore(':memory:');
  try {
    let session = store.create(task, { draft, source: { facts: '依据原文' }, points: [{ statement: '事实' }], locks: [] }, [], '00000000-0000-4000-8000-000000000001');
    session = store.append(session.id, session.revision, { ...session.snapshot, draft: { ...draft, title: '第二版' } }, '手动修改');
    assert.equal(session.version, 2); assert.equal(session.versions.length, 2); assert.equal(store.list()[0].title, '第二版');
    assert.throws(() => store.append(session.id, 1, session.snapshot, '过期写入'), /已有新版本/);
    const restored = store.checkout(session.id, session.revision, 1);
    assert.equal(present(restored).title, '标题'); assert.equal(restored.snapshot.source.facts, '依据原文'); assert.equal(restored.versions.length, 2);
    store.delete(session.id); assert.equal(store.list().length, 0);
  } finally { store.close(); }
});
test('SQLite survives reopening and deletes dependent versions and image bytes together', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'huawei-history-test-'));
  const filename = path.join(directory, 'history.sqlite');
  let store;
  try {
    store = new HistoryStore(filename);
    const snapshot = { draft, source: { facts: '完整原文', documents: [{ path: '产品事实.md', text: '完整原文' }] }, points: [{ statement: '事实', quote: '完整原文' }], locks: addLock(draft, [], 'body', 2, 8) };
    const session = store.create(task, snapshot, [{ id: 'image-1', type: 'image/png', buffer: Buffer.from('saved-image') }]);
    store.append(session.id, session.revision, { ...snapshot, draft: { ...draft, title: '重启后恢复的标题' } }, '修改');
    store.close(); store = new HistoryStore(filename);
    const recovered = store.get(session.id);
    assert.equal(recovered.snapshot.draft.title, '重启后恢复的标题');
    assert.deepEqual(recovered.snapshot.source, snapshot.source);
    assert.deepEqual(recovered.snapshot.points, snapshot.points);
    assert.deepEqual(recovered.snapshot.locks, snapshot.locks);
    assert.deepEqual(recovered.task, task);
    assert.equal(Buffer.from(store.asset('image-1').data).toString(), 'saved-image');
    store.delete(session.id);
    assert.throws(() => store.asset('image-1'), /不存在/);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM versions').get().n, 0);
    store.create(task, snapshot, [{ id: 'image-2', type: 'image/png', buffer: Buffer.from('other') }]);
    store.clear();
    assert.equal(store.list().length, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM assets').get().n, 0);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('locked spans survive edits and fragment merge changes only selected bytes', () => {
  const locks = addLock(draft, [], 'body', 2, 8);
  assert.throws(() => mergeManual(draft, locks, { ...draft, body: '这里被用户覆盖。后面可以修改。' }), /锁定/);
  const start = draft.body.indexOf('后面'), end = draft.body.length;
  const merged = mergeReplacement(draft, locks, 'body', start, end, '结尾已经精简。');
  assert.equal(merged.content.body.slice(0, start), draft.body.slice(0, start));
  assert.equal(merged.content.body, '这是必须保留的事实。结尾已经精简。');
});
test('verification requires exact evidence and distinguishes warning from conflict', () => {
  const chunks = [{ id: 'S1', path: '产品事实.md', kind: 'local', text: '产品支持触控操作，仅限指定版本。' }];
  const current = { title: '标题', body: '产品支持触控操作，仅限指定版本。', cta: '', tags: '' };
  const report = normalizeVerification({ summary: '完成', claims: [
    { field: 'body', statement: current.body, status: 'verified', explanation: '一致', evidence: [{ sourceId: 'S1', quote: current.body }] },
    { field: 'title', statement: '标题', status: 'conflict', explanation: '声称冲突但没有依据', evidence: [] },
  ] }, current, chunks, 'test');
  assert.equal(report.claims[0].status, 'verified'); assert.equal(report.claims[1].status, 'warning'); assert.equal(report.status, 'warning');
});
test('P1 tool index is product scoped and vmall whitelist is exact', async () => {
  const product = (await products())[0], tools = new FactTools(product);
  const index = await tools.index(); assert.ok(index.length >= 1); assert.ok(index.every(item => item.productId === product.id && /产品事实|卖点与限制/.test(item.path)));
  assert.match((await tools.read(index[0].path)).text, /./);
  assert.equal(vmallUrl('https://www.vmall.com/test#part'), 'https://www.vmall.com/test');
  assert.throws(() => vmallUrl('https://evil.example/?next=https://www.vmall.com/'));
  assert.throws(() => vmallUrl('https://item.vmall.com/test'));
});
