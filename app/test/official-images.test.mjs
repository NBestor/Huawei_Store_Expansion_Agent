import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractOfficialImageUrls, cacheOfficialProductImages, officialProductPages, distinctOfficialImages } from '../lib/knowledge.mjs';
import { HistoryStore } from '../lib/store.mjs';
import { products } from '../lib/local.mjs';
import { dependency } from '../lib/dependencies.mjs';
import { createApp } from '../server.mjs';
import { chooseOfficialImages } from '../lib/marketing-images.mjs';
import reviewedPhotoIndex from '../../官网产品照片集/照片索引.json' with { type: 'json' };

test('official image extraction rejects foreign hosts and merges responsive variants', () => {
  const page = 'https://consumer.huawei.com/cn/laptops/test/';
  const urls = extractOfficialImageUrls(`<meta property="og:image" content="/test/hero-xs.webp"><img src="/test/hero-2x.jpg"><img data-src="/test/hero.webp"><source srcset="/test/scene.jpg 1x, /test/scene-2x.jpg 2x"><img src="https://consumer.huawei.com.evil.test/a.jpg"><img src="http://consumer.huawei.com/test/a.jpg"><img src="https://user:pass@consumer.huawei.com/test/b.jpg"><img src="https://consumer.huawei.com:8443/test/c.jpg"><img src="/logo.png"><img src="data:image/png;base64,bad"><img src="https://res.vmallres.com/test/product.png">`, page);
  assert.deepEqual(urls, ['https://consumer.huawei.com/test/hero.webp', 'https://consumer.huawei.com/test/scene.jpg', 'https://res.vmallres.com/test/product.png']);
});

async function fixture(product) {
  const [page] = await officialProductPages(product);
  const slug = new URL(page).pathname.split('/').filter(Boolean).at(-1);
  const base = `https://consumer.huawei.com/content/dam/huawei-cbg-site/cn/mkt/pdp/${new URL(page).pathname.slice(4)}`;
  const bytes = await dependency('sharp')({ create: { width: 640, height: 400, channels: 3, background: '#91a26d' } }).png().toBuffer();
  const tiny = await dependency('sharp')({ create: { width: 60, height: 40, channels: 3, background: '#eee' } }).png().toBuffer();
  let calls = 0;
  const transport = async url => {
    calls++;
    if (url === page) return new Response(`<main><img src="${base}hero.png"><img src="${base}duplicate.png"><img src="${base}broken.png"><img src="${base}small.png"><img src="https://consumer.huawei.com/content/dam/another-model/wrong.png"></main>`, { headers: { 'Content-Type': 'text/html' } });
    if (url === `${base}hero.png` || url === `${base}duplicate.png`) return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    if (url === `${base}broken.png`) return new Response(Buffer.alloc(300), { headers: { 'Content-Type': 'image/png' } });
    if (url === `${base}small.png`) return new Response(tiny, { headers: { 'Content-Type': 'image/png' } });
    if (url.endsWith('/wrong.png')) throw new Error('other model must never be fetched');
    return new Response('unavailable', { status: 503 });
  };
  return { page, bytes, transport, calls: () => calls };
}

test('official image cache persists across restarts and history deletion without fetching again', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'huawei-official-images-'));
  const filename = path.join(directory, 'cache.sqlite'), product = (await products())[0], data = await fixture(product);
  let store = new HistoryStore(filename);
  try {
    const [images, concurrent] = await Promise.all([cacheOfficialProductImages(product, store, data.transport), cacheOfficialProductImages(product, store, data.transport)]);
    assert.equal(images.length, 1); assert.deepEqual(images, concurrent);
    assert.equal(images[0].sourcePage, data.page); assert.match(images[0].id, /^[a-f0-9]{32}$/);
    assert.deepEqual(Buffer.from(store.officialImage(images[0].id).data), data.bytes);
    const count = data.calls();
    store.close(); store = new HistoryStore(filename); store.clear();
    assert.deepEqual(await cacheOfficialProductImages(product, store, data.transport), images);
    assert.equal(data.calls(), count);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP official gallery supports cached selection, model isolation, editing and PDF export', async () => {
  const store = new HistoryStore(':memory:'), all = await products(), product = all[0], data = await fixture(product);
  const server = createApp({ store, imageTransport: data.transport });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post('/api/official-images', {})).status, 400);
    const first = await (await post('/api/official-images', { productId: product.id })).json();
    assert.equal(first.cached, false); assert.equal(first.images.length, 1);
    const second = await (await post('/api/official-images', { productId: product.id })).json(); assert.equal(second.cached, true);
    const showcase = await (await fetch(`${base}/api/showcase?productId=${encodeURIComponent(product.id)}`)).json();
    assert.equal(showcase.officialImages[0].id, first.images[0].id);
    const image = await fetch(base + first.images[0].url); assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), data.bytes);
    assert.equal((await fetch(base + '/api/official-image/' + '0'.repeat(32))).status, 404);
    const task = { productId: product.id, audience: '大学新生', platform: 'moments', engine: 'rules', officialImageIds: [first.images[0].id] };
    assert.equal((await post('/api/generate', { ...task, productId: all[1].id })).status, 400);
    assert.equal((await post('/api/generate', { ...task, officialImageIds: [...task.officialImageIds, ...task.officialImageIds] })).status, 400);
    assert.equal((await post('/api/generate', { ...task, officialImageIds: ['../bad'] })).status, 400);
    const response = await post('/api/generate', task); assert.equal(response.status, 200);
    const draft = await response.json(); assert.equal(draft.images[0].url, first.images[0].url); assert.equal(draft.images[0].source, data.page);
    const route = `/api/sessions/${draft.sessionId}`;
    const edited = await (await post(route + '/edit', { action: 'manual', expectedRevision: draft.revision, content: { title: draft.title + ' 新版', body: draft.body, cta: draft.cta, tags: draft.tags } })).json();
    assert.equal(edited.images[0].url, first.images[0].url);
    const exported = await post(route + '/export', { expectedRevision: edited.revision }); assert.equal(exported.status, 200);
    const pdf = await dependency('pdf-lib').PDFDocument.load(await exported.arrayBuffer());
    assert.ok(pdf.getPageCount() >= 4);
    await fetch(base + route, { method: 'DELETE' });
    assert.equal((await fetch(base + first.images[0].url)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('unavailable official pages return no images and leave local generation usable', async () => {
  const store = new HistoryStore(':memory:'), product = (await products())[0];
  try { assert.deepEqual(await cacheOfficialProductImages(product, store, async () => { throw new Error('offline'); }), []); }
  finally { store.close(); }
});

test('generation automatically collects official images without manual selection and reports fallback', async () => {
  const store = new HistoryStore(':memory:'), product = (await products())[0], data = await fixture(product);
  const server = createApp({ store, imageTransport: data.transport });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = body => fetch(base + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const task = { productId: product.id, audience: '大学新生', platform: 'xiaohongshu', engine: 'rules' };
    const generated = await (await post(task)).json();
    assert.equal(generated.task.autoOfficialImages, true);
    assert.equal(generated.task.officialImageIds.length, 0);
    assert.match(generated.images[0].url, /^[/]api[/]official-image[/]/);
    assert.equal(generated.imageSelection.officialCount, 1);
    assert.equal(generated.imageSelection.fallbackCount, 2);
    assert.match(generated.imageSelection.summary, /从官网采集/);
    assert.equal(generated.images.length, 3);
    const reused = await (await post({ ...task, platform: 'moments' })).json();
    assert.match(reused.imageSelection.summary, /已缓存/);
    assert.equal(reused.imageSelection.fallbackCount, 0);
    const disabled = await (await post({ ...task, autoOfficialImages: false })).json();
    assert.equal(disabled.imageSelection.officialCount, 0);
    assert.match(disabled.imageSelection.summary, /关闭/);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('automatic image selection starts with a hero and varies subjects by audience', () => {
  const images = ['color-green', 'color-grey', 'eyecare-screen', 'keyboard-design', 'thin-design', 'kv'].map(name => ({ id: name, sourceUrl: `https://consumer.huawei.com/test/product-${name}.webp`, description: name }));
  const selected = chooseOfficialImages(images, { platform: 'xiaohongshu', audience: '大学新生', scene: '学习' });
  assert.equal(selected[0].id, 'kv');
  assert.equal(new Set(selected.map(image => image.id)).size, 3);
  assert.ok(selected.some(image => image.id === 'eyecare-screen'));
  assert.ok(selected.filter(image => /color/.test(image.id)).length <= 1);
});

test('reviewed official photo labels exclude unsuitable assets and describe selected images', () => {
  const productId = reviewedPhotoIndex[0].productId;
  const productImages = reviewedPhotoIndex.filter(item => item.productId === productId);
  const images = productImages.map((item, index) => ({
    productId, sourceUrl: item.sourceUrl, description: '旧缓存中的通用描述', id: String(index), url: `/api/official-image/${index}`
  }));
  const selected = chooseOfficialImages(images, { productId, platform: 'xiaohongshu', audience: '大学新生', scene: '学习' });
  assert.ok(selected.length > 0);
  assert.ok(selected.every(image => image.autoEligible !== false));
  assert.ok(selected.every(image => image.description.startsWith('画面已核对：')));
  const excludedUrls = productImages.filter(image => !image.autoEligible).map(image => image.sourceUrl);
  assert.ok(excludedUrls.length > 0);
  assert.ok(!selected.some(image => excludedUrls.includes(image.sourceUrl)));
});

test('old galleries exclude placeholder and badge images and merge mobile variants', () => {
  const names = ['awards1', 'logo', 'screen-blur', 'oled-vague', 'top-feactures6', 'hero-mob', 'hero', 'keyboard'];
  const images = names.map(name => ({ id: name, sourceUrl: `https://consumer.huawei.com/product/${name}.webp` }));
  assert.deepEqual(distinctOfficialImages(images).map(image => image.id), ['hero', 'keyboard']);
});
