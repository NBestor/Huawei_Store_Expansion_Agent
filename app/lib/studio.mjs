import { randomUUID } from 'node:crypto';
import { evidence, products, within, knowledgeRoot } from './local.mjs';
import { platforms, generate } from './workflow.mjs';
import { FactTools, vmallUrl } from './knowledge.mjs';
import { problem, present } from './store.mjs';
import { fields, contentOf, selection, mergeManual, mergeReplacement, addLock } from './editor.mjs';
import { finalize, offlineVerification, failedVerification } from './verification.mjs';
import { safeError } from './config.mjs';
import { exportGate } from '../public/review.js';

export class Studio {
  constructor(store, model, ima) { this.store = store; this.model = model; this.ima = ima; this.busy = new Set(); }
  async exclusive(id, fn) {
    if (this.busy.has(id)) throw problem('这个会话正在保存或核验，请等待完成。', 429);
    this.busy.add(id); try { return await fn(); } finally { this.busy.delete(id); }
  }
  async validateTask(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem('任务格式错误。');
    const missing = ['productId', 'audience', 'scene', 'platform'].filter(key => typeof value[key] !== 'string' || !value[key].trim());
    if (missing.length) throw Object.assign(problem('请补充产品、目标人群、使用场景与平台。'), { missing });
    if (!platforms[value.platform]) throw problem('不支持的平台。');
    if (value.mode && !['local', 'ima'].includes(value.mode) || value.engine && !['rules', 'model'].includes(value.engine)) throw problem('不支持的来源或生成方式。');
    if (value.mode === 'ima' && value.engine !== 'model') throw problem('ima 模式请使用模型生成；不会回退本地规则草稿。', 409);
    if ([value.audience, value.scene].some(text => text.length > 500) || value.revision !== undefined && (typeof value.revision !== 'string' || value.revision.length > 1000)) throw problem('人群、场景最多500字，补充要求最多1000字。');
    if (value.webUrls !== undefined && (!Array.isArray(value.webUrls) || value.webUrls.length > 3 || value.webUrls.some(url => typeof url !== 'string' || url.length > 2000))) throw problem('最多提供3个华为商城链接。');
    const product = (await products()).find(item => item.id === value.productId);
    if (!product) throw problem('请选择有效产品。');
    const webUrls = (value.webUrls || []).map(vmallUrl);
    return { product, task: { productId: product.id, audience: value.audience.trim(), scene: value.scene.trim(), platform: value.platform, mode: value.mode || 'local', engine: value.engine || 'rules', revision: value.revision || '', webUrls } };
  }
  async create(value) {
    const { product, task } = await this.validateTask(value);
    return this.exclusive('generation', async () => {
      const local = await evidence(product.id), tools = new FactTools(product, task.webUrls), assets = [];
      let source = local;
      if (task.mode === 'ima') {
        const remote = await this.ima.evidence(product);
        const selected = remote.images.slice(0, platforms[task.platform].count), images = [];
        for (const image of selected) {
          const media = await this.ima.image(new URL(image.url, 'http://localhost').searchParams.get('token')), id = randomUUID();
          assets.push({ id, type: media.type, buffer: media.buffer }); images.push({ ...image, url: `/api/assets/${id}` });
        }
        source = { ...remote, images, documents: [...local.documents, { kind: 'ima', path: remote.factPath, productId: product.id, text: remote.facts }] };
      }
      let draft;
      if (task.engine === 'model') {
        draft = await this.model.generate(task, source, tools);
        source = { ...source, documents: draft.evidence.documents, facts: draft.evidence.facts, factPath: draft.evidence.path, sources: draft.evidence.sources, trace: draft.evidence.trace };
      } else {
        const text = generate(task, source); draft = finalize(task, source, text, offlineVerification(text));
      }
      const snapshot = { source, draft, points: draft.points || [], locks: [] };
      return present(this.store.create(task, snapshot, assets));
    });
  }
  async check(task, source, draft, force = false) {
    if (task.engine !== 'model' && !force) return { source, verification: offlineVerification(draft) };
    try { return await this.model.inspect(task, source, draft, new FactTools(source.product, task.webUrls)); }
    catch (error) { return { source, verification: failedVerification(draft, safeError(error)) }; }
  }
  async edit(id, input) {
    return this.exclusive(id, async () => {
      const session = this.store.assertCurrent(id, input.expectedRevision), { draft, source, locks = [], points = [] } = session.snapshot;
      let merged;
      if (input.action === 'ai') {
        if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 1000) throw problem('请填写1000字以内的片段修改要求。');
        const selected = selection(draft, input.field, input.start, input.end);
        // Reject overlaps before any paid request.
        mergeReplacement(draft, locks, selected.field, selected.start, selected.end, selected.text);
        const replacement = await this.model.editFragment(session.task, source, draft, selected, input.instruction.trim(), locks);
        merged = mergeReplacement(draft, locks, selected.field, selected.start, selected.end, replacement);
      } else if (input.action === 'manual') merged = mergeManual(draft, locks, input.content);
      else throw problem('不支持的编辑操作。');
      if (fields.every(field => draft[field] === merged.content[field])) return present(session);
      const next = { ...draft, ...merged.content }, checked = await this.check(session.task, source, next, input.action === 'ai');
      const saved = finalize(session.task, checked.source, next, checked.verification, points);
      return present(this.store.append(id, session.revision, { source: checked.source, draft: saved, points, locks: merged.locks }, input.action === 'ai' ? `AI局部修改：${input.instruction.slice(0, 60)}` : '手动编辑并自动核验'));
    });
  }
  async recheck(id, input) {
    return this.exclusive(id, async () => {
      const session = this.store.assertCurrent(id, input.expectedRevision), snapshot = session.snapshot;
      const checked = await this.check(session.task, snapshot.source, snapshot.draft, true);
      const draft = finalize(session.task, checked.source, snapshot.draft, checked.verification, snapshot.points);
      return present(this.store.append(id, session.revision, { ...snapshot, source: checked.source, draft }, 'AI重新核验'));
    });
  }
  locks(id, input) {
    if (this.busy.has(id)) throw problem('会话正在核验，请稍候。', 429);
    const session = this.store.assertCurrent(id, input.expectedRevision), snapshot = session.snapshot;
    let locks;
    if (input.operation === 'add') locks = addLock(snapshot.draft, snapshot.locks, input.field, input.start, input.end);
    else if (input.operation === 'remove' && snapshot.locks.some(lock => lock.id === input.lockId)) locks = snapshot.locks.filter(lock => lock.id !== input.lockId);
    else throw problem('无效的保留区操作。');
    return present(this.store.append(id, session.revision, { ...snapshot, locks }, input.operation === 'add' ? '锁定保留片段' : '解除保留片段'));
  }
  checkout(id, input) {
    if (this.busy.has(id)) throw problem('会话正在核验，请稍候。', 429);
    return present(this.store.checkout(id, input.expectedRevision, input.version));
  }
  async export(id, input) {
    const session = this.store.assertCurrent(id, input.expectedRevision), draft = session.snapshot.draft;
    const gate = exportGate({ draft, platform: session.task.platform });
    if (!gate.allowed) throw problem(gate.reason, 409);
    for (const image of draft.images) {
      if (image.url.startsWith('/api/assets/')) this.store.asset(image.url.split('/').pop());
      else if (image.url.startsWith('/api/image?')) await within(knowledgeRoot, new URL(image.url, 'http://localhost').searchParams.get('path'));
      else throw problem('图片尚未持久化，不能导出。', 409);
    }
    const exportedAt = this.store.markExport(id, input.expectedRevision);
    const content = [draft.label, `会话：${id} / 版本 V${session.version}\n导出时间：${exportedAt}`, draft.title, draft.body, draft.cta, draft.tags,
      '事实核验报告（警告不代表已核验，模型核验不替代人工判断）', draft.verification.summary,
      ...draft.verification.claims.map(claim => `${{ verified: '✅ 已核验', warning: '⚠ 待确认', conflict: '❌ 冲突' }[claim.status]} ${claim.statement}\n${claim.explanation}\n${claim.evidence.map(cite => `${cite.path}\n原文：${cite.quote}`).join('\n')}`),
      '配图方案', ...draft.images.map(image => `${image.name}\n${image.position}\n${image.description}\n来源：${image.source}`),
      '任务设置', JSON.stringify(session.task, null, 2), '选中卖点', JSON.stringify(session.snapshot.points, null, 2),
      '来源依据快照', draft.evidence.facts].join('\n\n');
    return { filename: `营销图文方案-V${session.version}.txt`, content, exportedAt };
  }
}
