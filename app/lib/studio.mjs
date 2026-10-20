import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { evidence, products, within, knowledgeRoot } from './local.mjs';
import { platforms, voiceProfiles, generate } from './workflow.mjs';
import { cacheOfficialProductImages, EcosystemTools, FactTools, vmallUrl } from './knowledge.mjs';
import { chooseOfficialImages } from './marketing-images.mjs';
import { problem, present } from './store.mjs';
import { fields, contentOf, selection, mergeManual, mergeReplacement, addLock } from './editor.mjs';
import { finalize, offlineVerification, failedVerification } from './verification.mjs';
import { safeError } from './config.mjs';
import { publicationIssues } from './publication.mjs';
import { exportGate } from '../public/review.js';
import { renderPlanPdf } from './pdf.mjs';
import { findPresetTag } from './tags.mjs';

export class Studio {
  constructor(store, model, ima, imageTransport = fetch) { this.store = store; this.model = model; this.ima = ima; this.imageTransport = imageTransport; this.busy = new Set(); }
  async exclusive(id, fn) {
    if (this.busy.has(id)) throw problem('这个会话正在保存或核验，请等待完成。', 429);
    this.busy.add(id); try { return await fn(); } finally { this.busy.delete(id); }
  }
  async validateTask(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem('任务格式错误。');
    const missing = ['productId', 'audience', 'platform'].filter(key => typeof value[key] !== 'string' || !value[key].trim());
    if (missing.length) throw Object.assign(problem('请补充产品、目标人群与发布平台。'), { missing });
    if (!platforms[value.platform]) throw problem('不支持的平台。');
    if (value.voice !== undefined && !Object.hasOwn(voiceProfiles, value.voice)) throw problem('不支持的表达语气。');
    if (value.mode && !['local', 'ima'].includes(value.mode) || value.engine && !['rules', 'model'].includes(value.engine)) throw problem('不支持的来源或生成方式。');
    if (value.mode === 'ima' && value.engine !== 'model') throw problem('ima 模式请使用模型生成；不会回退本地规则草稿。', 409);
    if (value.categoryId && value.categoryId !== 'computer') throw problem('当前只有电脑品类接入本地产品事实库；其他品类标签可浏览，型号推荐暂未开放。', 409);
    if (value.audience.length > 80 || value.scene !== undefined && (typeof value.scene !== 'string' || value.scene.length > 500) || value.revision !== undefined && (typeof value.revision !== 'string' || value.revision.length > 1000)) throw problem('人群最多80字，场景最多500字，补充要求最多1000字。');
    const ecosystemAllowed = new Set(['phone', 'tablet', 'wearable', 'audio']);
    if (value.ecosystemDevices !== undefined && (!Array.isArray(value.ecosystemDevices) || value.ecosystemDevices.length > 4 || value.ecosystemDevices.some(device => !ecosystemAllowed.has(device)))) throw problem('生态协同设备只支持手机、平板、手表和耳机。');
    if (value.webUrls !== undefined && (!Array.isArray(value.webUrls) || value.webUrls.length > 3 || value.webUrls.some(url => typeof url !== 'string' || url.length > 2000))) throw problem('最多提供3个华为商城链接。');
    const product = (await products()).find(item => item.id === value.productId);
    if (!product) throw problem('请选择有效产品。');
    if (value.officialImageIds !== undefined && (!Array.isArray(value.officialImageIds) || value.officialImageIds.length > platforms[value.platform].max || value.officialImageIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) || new Set(value.officialImageIds).size !== value.officialImageIds.length)) throw problem(`当前平台最多选择 ${platforms[value.platform].max} 张不同的官网图片。`);
    const officialImageIds = value.officialImageIds || [];
    if (value.autoOfficialImages !== undefined && typeof value.autoOfficialImages !== 'boolean') throw problem('官网自动配图选项格式错误。');
    for (const id of officialImageIds) if (this.store.officialImage(id).product_id !== product.id) throw problem('所选官网图片不属于当前电脑型号，请重新选择。');
    const selectedTag = typeof value.tagId === 'string' ? findPresetTag(value.tagId) : null;
    if (value.tagId && !selectedTag) throw problem('所选创作标签无效，请重新选择。');
    const categoryId = value.categoryId || 'computer';
    if (selectedTag && !selectedTag.categories.includes(categoryId) && selectedTag.type !== 'timing' && selectedTag.type !== 'hot') throw problem('所选标签不适用于当前品类。');
    const webUrls = (value.webUrls || []).map(vmallUrl);
    const topic = value.topic && typeof value.topic === 'object' && typeof value.topic.title === 'string' ? {
      title: value.topic.title.slice(0, 240), summary: typeof value.topic.summary === 'string' ? value.topic.summary.slice(0, 360) : '',
      url: typeof value.topic.url === 'string' && /^https:\/\//i.test(value.topic.url) ? value.topic.url.slice(0, 2000) : '',
      publishedAt: typeof value.topic.publishedAt === 'string' ? value.topic.publishedAt.slice(0, 40) : '',
      tag: typeof value.topic.tag === 'string' ? value.topic.tag.slice(0, 16) : '',
      angle: typeof value.topic.angle === 'string' ? value.topic.angle.slice(0, 120) : '',
    } : null;
    const scene = (value.scene || '').trim() || (selectedTag ? selectedTag.angle : topic ? `借话题“${topic.title}”的关注度，面向${value.audience.trim()}推荐本款华为电脑，突出有依据的亮点与入手理由` : `面向${value.audience.trim()}推荐本款华为电脑，以日常期待带出真实亮点与换新吸引力`);
    return { product, task: { productId: product.id, officialImageIds, autoOfficialImages: value.autoOfficialImages !== false, categoryId, audience: value.audience.trim(), scene, tag: selectedTag, topic, ecosystemDevices: [...new Set(value.ecosystemDevices || [])], platform: value.platform, voice: value.voice || 'friendly', mode: value.mode || 'local', engine: value.engine || 'rules', revision: value.revision || '', webUrls, autoWeb: value.autoWeb !== false } };
  }
  async create(value) {
    const { product, task } = await this.validateTask(value);
    return this.exclusive('generation', async () => {
      const local = await evidence(product.id), tools = new FactTools(product, task.webUrls), assets = [];
      tools.ecosystem = new EcosystemTools(task.ecosystemDevices, fetch, product);
      let official = [], imageReason = '已关闭官网自动配图';
      const hadCached = this.store.officialImages(product.id).length > 0;
      if (task.officialImageIds.length) {
        official = task.officialImageIds.map(id => this.store.officialImages(product.id).find(image => image.id === id));
        imageReason = '使用手动勾选的官网图片';
      } else if (task.autoOfficialImages) {
        try {
          official = chooseOfficialImages(await cacheOfficialProductImages(product, this.store, this.imageTransport), task);
          imageReason = official.length ? hadCached ? '自动选用已缓存的官网图片' : '从官网采集后自动选图并缓存' : '官网暂未找到可用图片，已回退已有素材';
        } catch { imageReason = '官网图片读取失败，已回退已有素材'; }
      }
      let source = local;
      if (task.mode === 'ima') {
        const remote = await this.ima.evidence(product);
        const selected = remote.images.slice(0, Math.max(0, platforms[task.platform].count - official.length)), images = [];
        for (const image of selected) {
          const media = await this.ima.image(new URL(image.url, 'http://localhost').searchParams.get('token')), id = randomUUID();
          assets.push({ id, type: media.type, buffer: media.buffer }); images.push({ ...image, url: `/api/assets/${id}` });
        }
        source = { ...remote, images, documents: [...local.documents, { kind: 'ima', path: remote.factPath, productId: product.id, text: remote.facts }] };
      }
      const images = official.map(image => ({ ...image, model: product.name, source: image.sourcePage, origin: 'official' }));
      const targetCount = Math.max(platforms[task.platform].count, images.length);
      const fallbackCount = Math.max(0, Math.min(source.images.length, targetCount - images.length));
      source = { ...source, images: [...images, ...source.images], imageSelection: { officialCount: images.length, fallbackCount, summary: `${imageReason}${images.length && fallbackCount ? `；另补充 ${fallbackCount} 张已有素材` : ''}` }, trace: [...(source.trace || []), { action: 'select_images', result: imageReason, at: new Date().toISOString() }] };
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
    try {
      const tools = new FactTools(source.product, task.webUrls);
      tools.ecosystem = new EcosystemTools(task.ecosystemDevices, fetch, source.product);
      const checked = await this.model.inspect(task, source, draft, tools);
      if ((task.tag || task.topic) && this.model.reviewAngle) checked.angleReview = { ...await this.model.reviewAngle(task, draft), content: contentOf(draft) };
      return checked;
    }
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
      const next = { ...draft, ...merged.content };
      const publicationProblems = publicationIssues(session.task, next, draft.ecosystem);
      if (input.action === 'ai' && publicationProblems.length) throw problem(`局部改写未保留销售角度或协同依据，原稿未改动：${publicationProblems.join('；')}`);
      const checked = await this.check(session.task, source, next, input.action === 'ai');
      next.angleReview = checked.angleReview;
      if (input.action === 'ai' && checked.angleReview?.approved === false) throw problem(`局部改写未保留销售切入，原稿未改动：${checked.angleReview.reason}`);
      const saved = finalize(session.task, checked.source, next, checked.verification, points);
      return present(this.store.append(id, session.revision, { source: checked.source, draft: saved, points, locks: merged.locks }, input.action === 'ai' ? `AI局部修改：${input.instruction.slice(0, 60)}` : '手动编辑并自动核验'));
    });
  }
  async recheck(id, input) {
    return this.exclusive(id, async () => {
      const session = this.store.assertCurrent(id, input.expectedRevision), snapshot = session.snapshot;
      const checked = await this.check(session.task, snapshot.source, snapshot.draft, true);
      const draft = finalize(session.task, checked.source, { ...snapshot.draft, angleReview: checked.angleReview }, checked.verification, snapshot.points);
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
    return this.exclusive(id, async () => {
      const session = this.store.assertCurrent(id, input.expectedRevision), draft = session.snapshot.draft;
      const gate = exportGate({ draft, platform: session.task.platform });
      if (!gate.allowed) throw problem(gate.reason, 409);
      const images = [];
      for (const image of draft.images) {
        let buffer;
        if (image.url.startsWith('/api/assets/')) buffer = this.store.asset(image.url.split('/').pop()).data;
        else if (image.url.startsWith('/api/official-image/') && /^[a-f0-9]{32}$/.test(image.url.split('/').pop())) {
          const cached = this.store.officialImage(image.url.split('/').pop());
          if (cached.product_id !== session.task.productId) throw problem('配图与当前电脑型号不匹配。', 409);
          buffer = Buffer.from(cached.data);
        }
        else if (image.url.startsWith('/api/image?')) buffer = await readFile(await within(knowledgeRoot, new URL(image.url, 'http://localhost').searchParams.get('path')));
        else throw problem('图片尚未持久化，不能导出。', 409);
        images.push({ ...image, buffer });
      }
      const exportedAt = new Date().toISOString(), content = await renderPlanPdf(session, images, exportedAt);
      this.store.markExport(id, input.expectedRevision);
      return { filename: `营销图文方案-V${session.version}.pdf`, content, exportedAt };
    });
  }
}
