import './config.mjs';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { failure, projectRoot } from './config.mjs';
const require = createRequire(import.meta.url);
const normalize = value => value.toLowerCase().replace(/huawei|华为|[\s（）()_\-]/g, '');

export class ImaAdapter {
  constructor(env = process.env, invoke) { this.env = env; this.invoke = invoke; this.verified = false; this.reachable = false; this.message = '尚未验证连接'; this.media = new Map(); }
  async status() {
    let scriptExists = false;
    if (this.env.IMA_SKILL_SCRIPT) { try { await access(this.env.IMA_SKILL_SCRIPT); scriptExists = true; } catch {} }
    return { configured: Boolean(scriptExists && this.env.IMA_OPENAPI_CLIENTID && this.env.IMA_OPENAPI_APIKEY), scriptExists,
      knowledgeBaseName: this.env.IMA_KB_NAME || '任德耀新建华为PC知识库', verified: this.verified, reachable: this.reachable, message: this.message };
  }
  async call(endpoint, payload) {
    if (!this.invoke && !(await this.status()).configured) throw failure('ima 未配置完整，请检查官方 Skill 路径及凭证。');
    let timer;
    try {
      // Official exported entry point preserves the script's daily update check.
      const invoke = this.invoke || require(path.resolve(projectRoot, this.env.IMA_SKILL_SCRIPT)).imaApi;
      const raw = await Promise.race([
        invoke(endpoint, payload, { clientId: this.env.IMA_OPENAPI_CLIENTID, apiKey: this.env.IMA_OPENAPI_APIKEY,
          baseUrl: 'https://ima.qq.com', lastCheckFile: path.join(projectRoot, 'app/.runtime/ima-last-update-check') }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(failure('ima 请求超时，请重试。')), 30000); }),
      ]);
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (data.code === 220021) throw failure('ima 今日资料获取次数已达上限，请明天再试。现在可手动选择“本地赛事参考”继续验证模型；不会自动切换来源。');
      if (data.code !== 0) throw failure(`ima 接口返回业务错误（${Number(data.code) || '未知'}），请检查账号权限与接口配置。`);
      this.reachable = true;
      return data.data || {};
    } catch (error) {
      if (error.code === -200) throw failure('ima 官方 Skill 有新版本，请更新 Skill 后重试。');
      throw error.publicMessage ? error : failure('ima 调用失败，请检查网络、凭证与官方 Skill。');
    } finally { clearTimeout(timer); }
  }
  async pages(endpoint, payload, field) {
    const values = []; let cursor = ''; const seen = new Set();
    for (let page = 0; page < 20; page++) {
      const data = await this.call(`openapi/wiki/v1/${endpoint}`, { ...payload, cursor });
      values.push(...(data[field] || []));
      if (data.is_end || !data.next_cursor) return values;
      if (seen.has(data.next_cursor)) throw failure('ima 返回重复分页游标，已停止检索。');
      seen.add(data.next_cursor); cursor = data.next_cursor;
    }
    throw failure('ima 检索超过分页上限，请缩小知识库范围。');
  }
  async findKnowledgeBase() {
    const name = (await this.status()).knowledgeBaseName;
    let libraries = await this.pages('search_knowledge_base', { query: name, limit: 20 }, 'info_list');
    if (!libraries.length) libraries = await this.pages('search_knowledge_base', { query: '', limit: 20 }, 'info_list');
    const match = libraries.find(x => (x.kb_name || x.name) === name);
    if (!match) throw failure('ima 凭证可用，但当前账号未找到赛事共享知识库。请用凭证对应账号扫码加入共享库，再验证连接。');
    return match.kb_id || match.id;
  }
  async verify() {
    this.verified = false;
    try { await this.findKnowledgeBase(); this.verified = true; this.message = '目标共享知识库已找到，资料链路需通过生成任务验证'; }
    catch (error) { this.message = error.publicMessage || 'ima 验证失败'; }
    return this.status();
  }
  async browse(knowledgeBaseId) {
    const queue = [undefined], visited = new Set(), entries = [];
    while (queue.length && visited.size < 40) {
      const folderId = queue.shift(); if (visited.has(folderId)) continue; visited.add(folderId);
      const items = await this.pages('get_knowledge_list', { knowledge_base_id: knowledgeBaseId, ...(folderId ? { folder_id: folderId } : {}), limit: 50 }, 'knowledge_list');
      for (const item of items) {
        if (item.media_type === 99 || (item.folder_id && !item.media_id)) {
          if (!/^(P[2-578]|90-|99-)|价格|机密|历史归档|待审核/.test(item.title || item.name || '')) queue.push(item.folder_id || item.media_id);
        }
        else if (item.media_id) entries.push(item);
      }
    }
    if (queue.length) throw failure('ima 目录超过浏览上限，请缩小知识库范围。');
    return entries;
  }
  async productFolder(kb, product) {
    const list = folder => this.pages('get_knowledge_list', { knowledge_base_id: kb, ...(folder ? { folder_id: folder } : {}), limit: 50 }, 'knowledge_list');
    let entries = await list();
    // Shared libraries may wrap the imported tree in a single folder (type 99).
    if (entries.length === 1 && entries[0].media_type === 99) entries = await list(entries[0].media_id);
    for (const part of product.id.split('/')) {
      const folder = entries.find(x => x.media_type === 99 && x.title === part);
      if (!folder) return [];
      entries = await list(folder.media_id);
    }
    const files = entries.filter(x => x.media_type !== 99 && ['产品事实.md', '卖点与限制.md'].includes(x.title));
    const folder = entries.find(x => x.media_type === 99 && x.title === 'images');
    if (folder) files.push(...(await list(folder.media_id)).filter(x => x.media_type === 9));
    return files;
  }
  async download(info, image = false) {
    let url; try { url = new URL(info.url); } catch { throw failure('ima 未返回可访问的媒体链接。'); }
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !['qq.com', 'myqcloud.com', 'tencent.com', 'qpic.cn'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw failure('ima 媒体域名暂不支持，请在客户端查看原文。');
    }
    const headers = Object.fromEntries(Object.entries(info.headers || {}).filter(([key]) => !/^(host|cookie|ima-openapi-|proxy-)/i.test(key)));
    const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || (image && !/^image\/(png|jpeg|webp)(;|$)/i.test(type))) throw failure('ima 媒体暂不可访问或格式不受支持。');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > (image ? 12e6 : 1e6)) throw failure('ima 媒体超过读取大小上限。'); chunks.push(chunk); }
    return { buffer: Buffer.concat(chunks), type };
  }
  async evidence(product) {
    const kb = await this.findKnowledgeBase();
    let items = await this.pages('search_knowledge', { knowledge_base_id: kb, query: product.name }, 'info_list');
    const scoped = await this.productFolder(kb, product);
    if (!items.length && !scoped.length) items = await this.browse(kb);
    const name = normalize(product.name);
    items = scoped.length ? scoped : items.filter(x => normalize(x.title || '').includes(name) && !/价格|机密|^MC-|×/.test(x.title || ''));
    if (!items.length) throw failure('ima 搜索及目录回退未找到该具体型号的资料；请检查库内文件命名，不会自动使用本地资料。');
    const facts = [], images = [], sources = [];
    for (const item of items.slice(0, 12)) {
      const media = await this.call('openapi/wiki/v1/get_media_info', { media_id: item.media_id });
      if (media.media_type === 9 && media.url_info) {
        for (const [key, value] of this.media) if (value.expires < Date.now()) this.media.delete(key);
        if (this.media.size >= 100) this.media.delete(this.media.keys().next().value);
        const token = randomUUID(); this.media.set(token, { info: media.url_info, expires: Date.now() + 30 * 60e3 });
        images.push({ name: item.title, model: product.name, source: 'ima 共享知识库', description: item.title, url: `/api/ima-image?token=${token}` });
      } else if ([7, 13].includes(media.media_type) && media.url_info) {
        const doc = await this.download(media.url_info); facts.push(`【${item.title}】\n${doc.buffer.toString('utf8')}`); sources.push(item.title);
      } else if (media.media_type === 11 && media.notebook_ext_info?.notebook_id) {
        const doc = await this.call('openapi/note/v1/get_doc_content', { note_id: media.notebook_ext_info.notebook_id, target_content_format: 0 });
        if (typeof doc.content === 'string') { facts.push(`【${item.title}】\n${doc.content}`); sources.push(item.title); }
      }
    }
    if (!facts.length) throw failure('ima 未取得该型号可读原文。目前支持 Markdown、TXT、可访问笔记；PDF/网页等请先在库中提供可读原文。');
    return { product, facts: facts.join('\n\n').slice(0, 60000), factPath: 'ima 共享知识库 / ' + sources.join('、'), images, sources, sourceMode: 'ima' };
  }
  async image(token) {
    const item = this.media.get(token);
    if (!item || item.expires < Date.now()) throw failure('ima 图片链接已过期，请重新生成。');
    return this.download(item.info, true);
  }
}
