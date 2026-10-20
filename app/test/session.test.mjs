import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryStore, present } from '../lib/store.mjs';
import { addLock, mergeManual, mergeReplacement } from '../lib/editor.mjs';
import { normalizeVerification } from '../lib/verification.mjs';
import { discoverVmall, EcosystemTools, FactTools, fetchVmall, huaweiConsumerUrl, vmallUrl } from '../lib/knowledge.mjs';
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
  assert.equal(vmallUrl('https://item.vmall.com/test'), 'https://item.vmall.com/test');
  assert.throws(() => vmallUrl('https://vmall.com/test'));
  assert.throws(() => vmallUrl('https://www.vmall.com.evil.example/test'));
  assert.throws(() => vmallUrl('http://www.vmall.com/test'));
});
test('ecosystem discovery reads only allowlisted official category and product pages', async () => {
  assert.equal(huaweiConsumerUrl('https://consumer.huawei.com/cn/phones/?x=1#top'), 'https://consumer.huawei.com/cn/phones/?x=1');
  for (const url of ['http://consumer.huawei.com/cn/phones/', 'https://consumer.huawei.com.evil.example/cn/phones/', 'https://consumer.huawei.com/global/phones/', 'https://evil.example/cn/phones/']) assert.throws(() => huaweiConsumerUrl(url));
  const requested = [];
  const transport = async value => {
    const url = new URL(value); requested.push(url.href);
    const body = url.pathname === '/cn/phones/'
      ? '<html><title>华为手机</title><body>华为手机产品列表与官方产品说明，了解各系列产品详情。页面提供多款手机的功能特点、产品设计与适用场景介绍，请前往型号页查看完整信息。</body><a href="/cn/phones/mate-x6/">Mate X6</a><a href="https://evil.example/cn/phones/other/">坏链接</a></html>'
      : '<html><title>HUAWEI Mate X6</title><body>HUAWEI Mate X6 支持与部分华为笔记本多屏协同。具体支持范围以产品说明为准。使用前请确认设备系统版本、账号与连接条件符合官方说明。</body></html>';
    return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  const result = await new EcosystemTools(['phone'], transport).discover();
  assert.deepEqual(requested, ['https://consumer.huawei.com/cn/phones/', 'https://consumer.huawei.com/cn/phones/mate-x6/']);
  assert.equal(result.documents.length, 1); assert.equal(result.documents[0].kind, 'ecosystem-web');
  assert.match(result.documents[0].text, /多屏协同/); assert.equal(result.documents[0].ecosystemCategory, 'phone');
});
test('automatic discovery uses exact product rows and reads only matching vmall product pages', async () => {
  const product = (await products()).find(item => item.name === 'HUAWEI MateBook 14（鸿蒙版）');
  const [url] = await discoverVmall(product);
  assert.match(url, /^https:\/\/item\.vmall\.com\/product\/comdetail\//);
  assert.match(url, /prdId=10086097339191/);
  const html = '<html><title>HUAWEI MateBook 14 鸿蒙版</title><body>HUAWEI MateBook 14 鸿蒙版，适用于移动学习与日常办公。查看商品详细介绍。</body></html>';
  const page = await fetchVmall(url, async () => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }), product);
  assert.equal(page.kind, 'web'); assert.match(page.text, /MateBook 14/);
  await assert.rejects(fetchVmall(url, async () => new Response('<title>MateBook D 16</title><body>MateBook D 16 是另一款产品。商品页面信息完整可读。</body>', { headers: { 'Content-Type': 'text/html' } }), product), /不匹配/);
  await assert.rejects(fetchVmall(url, async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }), product), /仅允许/);
});

test('vmall page matching preserves OS, edition, and D-series model identity', async () => {
  const all = await products(), url = 'https://item.vmall.com/product/test';
  const response = text => async () => new Response(`<title>${text}</title><body>${text} 商品详细介绍与产品功能说明。</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  for (const product of all) {
    assert.ok((await discoverVmall(product)).length, `${product.name} has an exact official catalog URL`);
    assert.equal((await fetchVmall(url, response(product.name), product)).kind, 'web', `${product.name} matches itself`);
  }
  const harmony = all.find(item => item.name === 'HUAWEI MateBook 14（鸿蒙版）');
  assert.equal((await fetchVmall(url, response('HUAWEI MateBook 14 HarmonyOS'), harmony)).kind, 'web');
  await assert.rejects(fetchVmall(url, response('HUAWEI MateBook 14 酷睿 Ultra'), harmony), /不匹配/);

  const d14 = all.find(item => item.name === 'HUAWEI MateBook D 14 2024');
  assert.equal((await fetchVmall(url, response('HUAWEI MateBook D 14 2024'), d14)).kind, 'web');
  await assert.rejects(fetchVmall(url, response('HUAWEI MateBook 14'), d14), /不匹配/);

  const fold = all.find(item => item.name === 'HUAWEI MateBook Fold 非凡大师');
  assert.equal((await fetchVmall(url, response('HUAWEI MateBook Fold Ultimate Design'), fold)).kind, 'web');
  await assert.rejects(fetchVmall(url, response('HUAWEI MateBook Fold'), fold), /不匹配/);
});
