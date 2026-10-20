import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { products, evidence, within, knowledgeRoot } from './lib/local.mjs';
import { platforms } from './lib/workflow.mjs';
import { ImaAdapter } from './lib/ima.mjs';
import { DeepSeekAdapter } from './lib/model.mjs';
import { safeError } from './lib/config.mjs';
import { HistoryStore, present, problem } from './lib/store.mjs';
import { Studio } from './lib/studio.mjs';
import { cacheOfficialProductImages, factIndex, distinctOfficialImages } from './lib/knowledge.mjs';
import { searchTopics } from './lib/topics.mjs';
import { getTagLibrary, recommendPresetTags } from './lib/tags.mjs';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function bodyOf(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 80000) throw problem('输入过长。', 413); parts.push(chunk); }
  let value; try { value = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { throw problem('无效 JSON。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem('请求格式错误。');
  return value;
}
export function createApp({ store, model = new DeepSeekAdapter(), ima = new ImaAdapter(), topicSearch = searchTopics, imageTransport = fetch } = {}) {
  let studio, verifying = false;
  const service = () => studio ||= new Studio(store ||= new HistoryStore(), model, ima, imageTransport);
  const app = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) throw problem('仅允许本机访问。', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw problem('不允许跨站请求。', 403);
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ima: await ima.status(), model: model.status(), mode: 'local', version: '0.3.0', storage: 'SQLite', platforms });
      if (req.method === 'GET' && url.pathname === '/api/products') return json(res, 200, await products());
      if (req.method === 'GET' && url.pathname === '/api/tags') return json(res, 200, getTagLibrary());
      if (req.method === 'GET' && url.pathname === '/api/tags/recommend') {
        const audience = url.searchParams.get('audience') || '';
        if (audience.length > 80) throw problem('目标人群最多80字。');
        const monthParam = url.searchParams.get('month');
        try { return json(res, 200, recommendPresetTags({ audience, month: monthParam === null ? new Date().getMonth() + 1 : Number(monthParam) })); }
        catch { throw problem('月份必须为1到12。'); }
      }
      if (req.method === 'POST' && url.pathname === '/api/topics') {
        const input = await bodyOf(req), product = (await products()).find(item => item.id === input.productId);
        if (!product || typeof input.audience !== 'string' || !input.audience.trim() || input.audience.length > 80) throw problem('请选择产品和目标人群后搜索热点。');
        return json(res, 200, await topicSearch({ audience: input.audience.trim(), product: product.name,
          classify: topics => model.classifyTopics(topics, { product: product.name, audience: input.audience.trim() }) }));
      }
      if (req.method === 'GET' && url.pathname === '/api/showcase') {
        const source = await evidence(url.searchParams.get('productId'));
        return json(res, 200, { product: source.product, images: source.images, officialImages: distinctOfficialImages(service().store.officialImages(source.product.id)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/official-images') {
        const input = await bodyOf(req), product = (await products()).find(item => item.id === input.productId);
        if (!product) throw problem('请选择有效产品型号。');
        const cached = service().store.officialImages(product.id).length > 0;
        const images = await cacheOfficialProductImages(product, service().store, imageTransport);
        return json(res, 200, { images, cached });
      }
      if (req.method === 'POST' && url.pathname === '/api/verify') {
        if (verifying) throw problem('连接验证正在进行。', 429);
        verifying = true;
        try { const [imaStatus, modelStatus] = await Promise.all([ima.verify(), model.verify()]); return json(res, 200, { ima: imaStatus, model: modelStatus, version: '0.3.0', storage: 'SQLite' }); }
        finally { verifying = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/generate') return json(res, 200, await service().create(await bodyOf(req)));
      if (url.pathname === '/api/history') {
        if (req.method === 'GET') return json(res, 200, service().store.list());
        if (req.method === 'DELETE') {
          const input = await bodyOf(req);
          if (input.confirm !== 'DELETE_ALL_HISTORY') throw problem('清空历史需要明确确认。');
          if (service().busy.size) throw problem('有任务正在执行，请完成后再清空历史。', 409);
          service().store.clear(); return json(res, 200, { deleted: true });
        }
      }
      const sessionRoute = url.pathname.match(/^\/api\/sessions\/([\da-f-]{36})(?:\/(edit|locks|checkout|recheck|export))?$/i);
      if (sessionRoute) {
        const [, id, action] = sessionRoute, agent = service();
        if (req.method === 'GET' && !action) return json(res, 200, present(agent.store.get(id)));
        if (req.method === 'DELETE' && !action) {
          if (agent.busy.has(id)) throw problem('会话正在核验，请完成后再删除。', 409);
          const input = await bodyOf(req); agent.store.assertCurrent(id, input.expectedRevision); agent.store.delete(id); return json(res, 200, { deleted: true });
        }
        if (req.method === 'POST' && action) {
          const input = await bodyOf(req);
          if (action === 'export' && agent.busy.has(id)) throw problem('会话正在核验，暂不可导出。', 409);
          if (action === 'export') {
            const file = await agent.export(id, input), ascii = `marketing-plan-V${agent.store.get(id).version}.pdf`;
            res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`, 'Content-Length': file.content.length, 'Cache-Control': 'no-store', 'X-Exported-At': file.exportedAt });
            return res.end(file.content);
          }
          return json(res, 200, await agent[action](id, input));
        }
      }
      const assetRoute = url.pathname.match(/^\/api\/assets\/([\da-f-]{36})$/i);
      if (req.method === 'GET' && assetRoute) {
        const asset = service().store.asset(assetRoute[1]); res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store' }); return res.end(asset.data);
      }
      const officialImageRoute = url.pathname.match(/^\/api\/official-image\/([\da-f]{32})$/i);
      if (req.method === 'GET' && officialImageRoute) {
        const asset = service().store.officialImage(officialImageRoute[1]);
        res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'public, max-age=31536000, immutable' }); return res.end(asset.data);
      }
      if (req.method !== 'GET') throw problem('不支持的请求方法。', 405);
      let filename;
      if (url.pathname === '/api/ima-image') {
        const image = await ima.image(url.searchParams.get('token')); res.writeHead(200, { 'Content-Type': image.type, 'Cache-Control': 'no-store' }); return res.end(image.buffer);
      }
      if (url.pathname === '/api/image') {
        filename = await within(knowledgeRoot, url.searchParams.get('path') || '');
        if (!['.jpg', '.png', '.webp'].includes(path.extname(filename).toLowerCase())) throw problem('仅允许图片。', 403);
      } else if (url.pathname.startsWith('/api/')) throw problem('接口不存在。', 404);
      else filename = await within(publicRoot, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
      const data = await readFile(filename);
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
    } catch (error) { json(res, error.status || (error.publicMessage ? 502 : 400), { error: error.publicMessage || '请求处理失败，请检查输入或本地资料。', ...(error.missing ? { missing: error.missing } : {}) }); }
  });
  return app;
}
export const server = createApp();
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  await factIndex();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`营销工作台：http://127.0.0.1:${port} · SQLite历史存储`));
}
