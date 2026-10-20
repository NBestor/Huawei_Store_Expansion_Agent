import { contentFields, exportGate, reviewClaims } from './review.js';
import { showView, scrollBehavior } from './views.js';
import { request, responseError, waitForJob } from './http.js';
const el = id => document.getElementById(id);
let result, loaded = [], busy = false, dirty = false, autoSaveTimer, selected, selectionVersion = 0;
const cache = new Map();
const officialGallery = document.createElement('fieldset');
officialGallery.className = 'choice-field official-gallery';
officialGallery.innerHTML = '<legend>官网产品配图</legend><label class="check-control"><input id="auto-official-images" type="checkbox" checked><span><strong>生成时自动优先使用官网图片</strong><small>按电脑型号采集、缓存并挑选配图；也可以手动勾选。</small></span></label><button id="load-official-images" type="button" class="outline-button">浏览官网图片</button><p id="official-image-status" class="hint" role="status"></p><div id="official-image-options" class="official-image-options"></div>';
document.querySelector('#task .settings').before(officialGallery);
const officialSelections = new Map(), officialLoading = new Set();
let platformLimits = {};
function renderOfficialImages(productId, images = []) {
  const chosen = officialSelections.get(productId) || new Set();
  const max = platformLimits[el('platform').value]?.max || 6;
  el('official-image-options').replaceChildren(...images.map(image => {
    const card = document.createElement('div'); card.className = 'official-image-card';
    const label = document.createElement('label'), checkbox = document.createElement('input'), img = document.createElement('img');
    checkbox.type = 'checkbox'; checkbox.checked = chosen.has(image.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && chosen.size >= max) { checkbox.checked = false; el('official-image-status').textContent = `当前平台最多选择 ${max} 张图片。`; return; }
      if (checkbox.checked) chosen.add(image.id); else chosen.delete(image.id);
      officialSelections.set(productId, chosen);
      el('official-image-status').textContent = `已选 ${chosen.size} 张官网图片；不足平台数量时补充本地素材。`;
    });
    img.src = image.url; img.alt = image.description; img.loading = 'lazy';
    img.addEventListener('error', () => { checkbox.disabled = true; checkbox.checked = false; chosen.delete(image.id); officialSelections.set(productId, chosen); label.append(text('small', '图片不可用')); });
    label.append(checkbox, img, text('span', image.description));
    const link = document.createElement('a'); link.href = image.sourcePage; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '官网来源 ↗';
    card.append(label, link); return card;
  }));
  el('load-official-images').disabled = !productId || officialLoading.has(productId);
  el('load-official-images').textContent = officialLoading.has(productId) ? '正在采集…' : images.length ? '读取已缓存图片' : '加载官网图片';
  el('official-image-status').textContent = images.length ? `${images.length} 张官网图片已缓存，手动选中 ${chosen.size} 张；不勾选时将在生成时自动选图。` : '生成时自动从官网采集并缓存；可先浏览手动选择。官网不可用时会注明回退素材。';
}
el('load-official-images').addEventListener('click', async () => {
  const productId = el('product').value; if (!productId || officialLoading.has(productId)) return;
  officialLoading.add(productId); el('load-official-images').disabled = true; el('load-official-images').textContent = '正在采集…';
  el('official-image-status').textContent = '正在读取当前型号的官网图片，首次加载可能需要几十秒…';
  try {
    const data = await post('/api/official-images', { productId });
    const existing = await showcase(productId); existing.officialImages = data.images;
    if (el('product').value === productId) {
      renderOfficialImages(productId, data.images);
      if (!data.images.length) el('official-image-status').textContent = '官网暂未找到可用图片，可以继续使用已有本地素材，或稍后重试。';
    }
  } catch (error) { if (el('product').value === productId) el('official-image-status').textContent = error.message; }
  finally {
    officialLoading.delete(productId);
    if (el('product').value === productId) { el('load-official-images').disabled = false; el('load-official-images').textContent = '加载官网图片'; }
  }
});
el('platform').addEventListener('change', async () => {
  const id = el('product').value, max = platformLimits[el('platform').value]?.max || 6;
  officialSelections.set(id, new Set([...(officialSelections.get(id) || [])].slice(0, max)));
  try { const data = await showcase(id); if (el('product').value === id) renderOfficialImages(id, data.officialImages); } catch {}
});
const integrationPanel = document.querySelector('.integration-panel');
if (integrationPanel) {
  const introduction = integrationPanel.querySelector(':scope > p');
  introduction.textContent = '此工作台已接入 ima 官方 OpenAPI，Agent 可查找赛事共享知识库、浏览目录、检索产品资料并读取原文和图片。';
  const quota = document.createElement('p');
  quota.className = 'ima-quota';
  quota.textContent = 'ima 每日访问次数有限。日常开发与回归测试推荐使用本地赛事数据；选择 ima 才会真实访问共享库，额度用尽会明确报错，不会静默切换来源。';
  introduction.after(quota);
}
const statusLabel = { verified: '已核验', warning: '待确认', conflict: '资料冲突', error: '核验失败' };
const statusIcon = { verified: '✓', warning: '!', conflict: '×', error: '○' };
const platformLabel = { xiaohongshu: '小红书', wechat: '公众号', moments: '门店朋友圈' };
const pendingKey = 'pc-studio-pending-job';
let pendingJob;
try { const saved = JSON.parse(sessionStorage.getItem(pendingKey)); if (saved && /^[\da-f-]{36}$/i.test(saved.id) && typeof saved.url === 'string') pendingJob = saved; } catch {}
const jobNotice = document.createElement('div'), jobMessage = text('span', ''), resumeJob = text('button', '继续查询'), leaveJob = text('button', '查看历史后关闭提示');
jobNotice.className = 'job-notice'; jobNotice.setAttribute('role', 'status'); resumeJob.type = leaveJob.type = 'button';
jobNotice.append(jobMessage, resumeJob, leaveJob); el('main-content').prepend(jobNotice);
function showPending(message = '有一项任务尚待确认，可继续查询结果。') {
  jobNotice.hidden = !pendingJob; jobMessage.textContent = message; resumeJob.disabled = leaveJob.disabled = busy;
}
function keepJob(value) {
  pendingJob = value;
  try { if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value)); else sessionStorage.removeItem(pendingKey); } catch {}
  showPending(); updateGenerateButton();
}
async function finishJob() {
  try { const data = await waitForJob(pendingJob.id, { onProgress: showPending }); keepJob(undefined); return data; }
  catch (error) { if (!error.pending) keepJob(undefined); else showPending(error.message); throw error; }
}
async function post(url, value, method = 'POST') {
  const options = { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
  if (method !== 'POST' || !(url === '/api/generate' || /\/sessions\/[\da-f-]+\/(edit|recheck)$/.test(url))) return request(url, options);
  if (pendingJob) throw new Error('前一项任务尚待确认，请先点击“继续查询”或查看历史作品。');
  // getRandomValues also works on a deployment accessed over HTTP by IP.
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; keepJob({ id, url });
  options.headers.Prefer = 'respond-async'; options.headers['X-Request-Id'] = id;
  try {
    const accepted = await request(url, options);
    // Compatibility with an older server: never submit the same generation twice.
    if (!accepted.jobId) { keepJob(undefined); return accepted; }
  } catch (error) {
    if (error.status && error.status < 500) { keepJob(undefined); throw error; }
    // An interrupted response may still have accepted the work. Only query, never resubmit.
  }
  return finishJob();
}
resumeJob.addEventListener('click', async () => {
  if (busy || !pendingJob) return;
  const url = pendingJob.url; setBusy(true, '正在查询后台任务…');
  try { const data = await finishJob(); if (url === '/api/generate') putTask(data.task); render(data, { openWorks: true }); el('error').textContent = ''; el('edit-error').textContent = ''; }
  catch (error) { el('error').textContent = error.message; jobMessage.textContent = error.message; }
  finally { setBusy(false); }
});
leaveJob.addEventListener('click', () => {
  if (busy) return;
  showView('history', { reset: true }); refreshHistory().catch(error => { el('history-error').textContent = error.message; });
  if (confirm('请先确认历史中是否已有结果。关闭提示不会停止后台任务；再次生成可能产生额外费用。确认关闭？')) keepJob(undefined);
});
showPending();
function text(tag, value, className) { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; }
function showStatus(status) {
  if (status.platforms) platformLimits = status.platforms;
  const imaText = !status.ima.configured ? '未配置' : status.ima.verified ? '已配置并验证' : `已配置 · ${status.ima.message || '尚未验证'}`;
  el('ima-status').textContent = imaText; el('ima-status').dataset.state = status.ima.verified ? 'verified' : status.ima.configured ? 'configured' : 'missing';
  el('ima-home-status').textContent = `ima ${imaText}`;
  el('connection').textContent = `ima：${imaText} · DeepSeek ${status.model.model || ''}：${status.model.configured ? status.model.message : '未配置'} · ${status.storage}`;
}
async function showcase(id) { if (!cache.has(id)) cache.set(id, request(`/api/showcase?productId=${encodeURIComponent(id)}`)); return cache.get(id); }
function cover(data) { return data.officialImages?.find(image => /(?:key-vision|[-_]kv[0-9]*[.])/.test(image.sourceUrl)) || data.officialImages?.[0] || data.images.find(image => image.name.includes('高质感主视觉')) || data.images[0]; }
async function selectProduct(id) {
  el('product').value = id; const version = ++selectionVersion;
  for (const card of el('product-cards').children) card.setAttribute('aria-pressed', String(card.dataset.product === id));
  el('selected-image').hidden = true; el('asset-count').textContent = '正在读取本地素材…';
  renderOfficialImages(id);
  try {
    const data = await showcase(id); if (version !== selectionVersion) return;
    el('selected-name').textContent = data.product.name; el('asset-count').textContent = data.officialImages?.length ? `${data.officialImages.length} 张官网缓存图片` : '生成时自动获取官网图片';
    renderOfficialImages(id, data.officialImages);
    const image = cover(data); if (image) { el('selected-image').src = image.url; el('selected-image').alt = image.description; el('selected-image').hidden = false; }
  } catch (error) { if (version === selectionVersion) { el('asset-count').textContent = '素材暂不可用'; el('error').textContent = error.message; } }
}
el('selected-image').addEventListener('error', () => { el('selected-image').hidden = true; el('asset-count').textContent = '预览图片不可用，请检查素材'; });
function chooseProduct(id) {
  selectProduct(id);
  resetTopics();
}
el('product').addEventListener('change', () => chooseProduct(el('product').value));
let topicRequest = 0, topicLoading = false, tagLibrary, tagRequest = 0;
function updateGenerateButton() {
  el('generate').disabled = busy || !!pendingJob || topicLoading || !el('product').value || !el('audience').value;
  if (el('find-topics')) el('find-topics').disabled = topicLoading || !el('product').value || !el('audience').value;
}
function resetTopics(message = '热点可选：选好产品和人群后，点击“为我推荐”开始搜索。不限时间，新内容优先。') {
  topicRequest++;
  topicLoading = false;
  el('selected-topic').value = 'skip';
  el('topic-options').replaceChildren();
  el('topic-status').textContent = message;
  el('find-topics').disabled = false;
  updateGenerateButton();
}
function selectAudience(value) {
  el('audience').value = value;
  for (const button of el('audience-options').querySelectorAll('[data-audience]')) button.setAttribute('aria-pressed', String(button.dataset.audience === value));
  clearPresetTag();
  resetTopics();
  loadRecommendedTags();
}
function renderTagGroup(containerId, tags) {
  const container = el(containerId);
  container.replaceChildren(...tags.map(tag => {
    const button = text('button', '', 'preset-tag'); button.type = 'button'; button.dataset.tagId = tag.id; button.setAttribute('aria-pressed', String(el('selected-tag').value === tag.id));
    button.append(text('strong', tag.label), text('span', tag.angle));
    button.addEventListener('click', () => selectPresetTag(tag));
    return button;
  }));
}
function selectPresetTag(tag) {
  el('selected-tag').value = tag.id; el('selected-topic').value = 'skip';
  for (const button of document.querySelectorAll('[data-tag-id]')) button.setAttribute('aria-pressed', String(button.dataset.tagId === tag.id));
  el('topic-options').replaceChildren(); el('topic-status').textContent = '已选择预制创作方向；如需实时热点，请单独点击“为我推荐”。';
  if (el('scene')) el('scene').value = '';
  updateGenerateButton();
}
function clearPresetTag() {
  el('selected-tag').value = '';
  for (const button of document.querySelectorAll('[data-tag-id]')) button.setAttribute('aria-pressed', 'false');
  updateGenerateButton();
}
function initTagLibrary(data) {
  tagLibrary = data;
  loadRecommendedTags();
  el('skip-tag').addEventListener('click', clearPresetTag);
}
async function loadRecommendedTags() {
  if (!tagLibrary) return;
  const requestId = ++tagRequest;
  for (const id of ['category-tag-options', 'timing-tag-options']) el(id).replaceChildren(text('span', '正在匹配…', 'tag-loading'));
  try {
    const data = await request(`/api/tags/recommend?audience=${encodeURIComponent(el('audience').value)}`);
    if (requestId !== tagRequest) return;
    renderTagGroup('category-tag-options', data.scenes);
    renderTagGroup('timing-tag-options', data.timing);
  } catch (error) {
    if (requestId === tagRequest) for (const id of ['category-tag-options', 'timing-tag-options']) el(id).replaceChildren(text('span', `推荐暂不可用：${error.message}`, 'tag-loading'));
  }
}
async function loadTopics() {
  const requestId = ++topicRequest, productId = el('product').value, audience = el('audience').value;
  if (!productId || !audience) { el('topic-status').textContent = '请先选择产品和人群，再点击“为我推荐”。'; el('find-topics').disabled = false; return; }
  topicLoading = true; el('selected-topic').value = 'skip'; el('generate').disabled = true;
  el('topic-options').replaceChildren(); el('find-topics').disabled = true;
  el('topic-status').textContent = '正在按人群和场景标签搜索热点，不限时间，新内容优先…';
  try {
    const data = await post('/api/topics', { productId, audience });
    if (requestId !== topicRequest) return;
    el('topic-status').textContent = data.topics.length
      ? `AI筛选出 ${data.topics.length} 条可用素材 · 搜索于 ${new Date(data.searchedAt).toLocaleString()}`
      : '未筛选到适合当前产品和人群的素材（搜索不限时间）。可重试，也可直接生成文案。';
    el('topic-options').replaceChildren(...data.topics.map(topic => {
      const item = text('article', '', 'topic-item'), choose = text('button', '', 'topic-choice'); choose.type = 'button';
      choose.append(text('span', topic.tag, 'topic-tag'), text('strong', topic.title), text('span', topic.summary), text('span', `创作角度：${topic.angle}`, 'topic-angle'), text('span', `发布时间：${topic.publishedAt ? new Date(topic.publishedAt).toLocaleString() : '未注明'}`, 'topic-date'));
      choose.addEventListener('click', () => {
        clearPresetTag();
        el('selected-topic').value = JSON.stringify(topic); el('scene').value = '';
        for (const button of el('topic-options').querySelectorAll('.topic-choice')) button.setAttribute('aria-pressed', String(button === choose));
        el('topic-status').textContent = `已选择热点 · ${new Date(topic.publishedAt).toLocaleDateString()}`; updateGenerateButton();
      });
      const source = text('a', new URL(topic.url).hostname); source.href = topic.url; source.target = '_blank'; source.rel = 'noopener noreferrer';
      item.append(choose, source); return item;
    }));
  } catch (error) {
    if (requestId === topicRequest) el('topic-status').textContent = `${error.message} 可重试，或选择“不结合热点”。`;
  } finally { if (requestId === topicRequest) { topicLoading = false; el('find-topics').disabled = false; updateGenerateButton(); } }
}
document.querySelectorAll('[data-audience]').forEach(button => button.addEventListener('click', () => selectAudience(button.dataset.audience)));
el('find-topics').addEventListener('click', loadTopics);
el('skip-topic').addEventListener('click', () => resetTopics('本次不结合热点，可直接生成文案。'));
function sourceSettings() {
  if (el('source').value === 'ima') { el('engine').value = 'model'; el('engine').querySelector('[value="rules"]').disabled = true; } else el('engine').querySelector('[value="rules"]').disabled = false;
  el('source-label').textContent = `${el('source').value === 'local' ? '本地参考' : '本地 + ima'} / ${el('engine').value === 'model' ? 'DeepSeek' : '规则草稿'}`;
}
el('source').addEventListener('change', sourceSettings); el('engine').addEventListener('change', sourceSettings);
el('verify').addEventListener('click', async () => { el('verify').disabled = true; el('connection').textContent = '正在验证连接…'; try { showStatus(await post('/api/verify', {})); } catch (error) { el('connection').textContent = error.message; } finally { el('verify').disabled = false; } });

async function init() {
  try {
    initVoiceControl();
    const [status, products, tags] = await Promise.all([request('/api/status'), request('/api/products'), request('/api/tags')]); showStatus(status); initTagLibrary(tags);
    el('product').replaceChildren(...products.map(product => new Option(product.name, product.id)));
    const featured = ['HUAWEI MateBook Fold 非凡大师', 'HUAWEI MateBook Pro', 'HUAWEI MateBook 14（鸿蒙版）'].map(name => products.find(product => product.name === name)).filter(Boolean);
    const cards = await Promise.all(featured.map(async (product, index) => {
      const data = await showcase(product.id), card = document.createElement('button'); card.type = 'button'; card.className = 'product-card'; card.dataset.product = product.id; card.setAttribute('aria-label', `选择 ${product.name}`); card.setAttribute('aria-pressed', 'false');
      const image = cover(data), img = document.createElement('img'); if (image) img.src = image.url; img.alt = image?.description || product.name; img.loading = 'lazy';
      const copy = text('span', '', 'card-copy'); copy.append(text('small', ['HUAWEI PC / 折叠旗舰', 'HUAWEI PC / 灵感办公', 'HUAWEI PC / 多彩日常'][index]), text('strong', product.name.replace('HUAWEI ', '')));
      const bottom = text('span', '', 'card-bottom'); bottom.append(text('span', ['展开新的表达', '让灵感自由发生', '让日常多一点色彩'][index]), text('span', '↗', 'card-arrow')); copy.append(bottom); card.append(img, copy);
      card.addEventListener('click', () => { chooseProduct(product.id); showView('create', { reset: true }); }); return { card, index };
    }));
    el('product-cards').replaceChildren(...cards.sort((a, b) => a.index - b.index).map(item => item.card));
    const first = featured[0] || products[0]; if (first) { const data = await showcase(first.id); if (cover(data)) el('hero-image').src = cover(data).url; await selectProduct(first.id); }
    resetTopics(); await refreshHistory();
  } catch (error) { el('error').textContent = `初始化失败：${error.message}`; }
}

function initVoiceControl() {
  const platform = el('platform');
  if (!platform || el('voice')) return;
  const label = text('label', '07　表达语气');
  const select = document.createElement('select'); select.id = 'voice';
  for (const [value, name] of [['friendly', '明快亲切'], ['warm', '温暖陪伴'], ['professional', '简洁专业']]) select.add(new Option(name, value));
  label.append(select, text('small', '语气会影响正文和结尾引导，不改变产品事实。', 'field-hint'));
  platform.closest('.field-row').after(label);
}
function taskFromForm() {
  let topic = null; try { if (el('selected-topic').value && el('selected-topic').value !== 'skip') topic = JSON.parse(el('selected-topic').value); } catch {}
  return { productId: el('product').value, officialImageIds: [...(officialSelections.get(el('product').value) || [])], autoOfficialImages: el('auto-official-images').checked, tagId: el('selected-tag').value || '', audience: el('audience').value, scene: el('scene').value, platform: el('platform').value,
    ecosystemDevices: [...document.querySelectorAll('input[name="ecosystem"]:checked')].map(input => input.value),
    mode: el('source').value, engine: el('engine').value, revision: el('revision').value, voice: el('voice')?.value || 'friendly',
    topic, webUrls: el('web-url').value.trim() ? [el('web-url').value.trim()] : [], autoWeb: el('auto-web').checked };
}
function putTask(task) {
  officialSelections.set(task.productId, new Set(task.officialImageIds || []));
  el('auto-official-images').checked = task.autoOfficialImages !== false;
  for (const [id, value] of [['product', task.productId], ['audience', task.audience], ['scene', task.scene], ['platform', task.platform], ['voice', task.voice || 'friendly'], ['source', task.mode], ['engine', task.engine], ['revision', task.revision || ''], ['web-url', task.webUrls?.[0] || '']]) if (el(id)) el(id).value = value;
  for (const button of el('audience-options').querySelectorAll('[data-audience]')) button.setAttribute('aria-pressed', String(button.dataset.audience === task.audience));
  for (const input of document.querySelectorAll('input[name="ecosystem"]')) input.checked = (task.ecosystemDevices || []).includes(input.value);
  if (tagLibrary) {
    el('selected-tag').value = task.tag?.id || '';
    loadRecommendedTags();
  }
  resetTopics();
  el('selected-topic').value = task.topic?.title ? JSON.stringify(task.topic) : 'skip';
  if (task.topic?.title) el('topic-status').textContent = `已恢复热点：${task.topic.title}`;
  el('auto-web').checked = task.autoWeb !== false;
  sourceSettings(); selectProduct(task.productId);
}
function currentContent() { return Object.fromEntries(contentFields.map(field => [field, el(`edit-${field}`).value])); }
function gate() { return exportGate({ draft: result, platform: result?.task?.platform, loaded, dirty, busy: busy || !!pendingJob }); }
function setBusy(value, message = '') {
  busy = value; document.body.classList.toggle('is-busy', value);
  resumeJob.disabled = leaveJob.disabled = value;
  for (const id of ['save-edit', 'ai-edit', 'lock-selection', 'recheck', 'review-recheck', 'export', 'clear-history']) if (el(id)) el(id).disabled = value || !!pendingJob;
  for (const field of contentFields) el(`edit-${field}`).disabled = value || !!pendingJob;
  for (const button of document.querySelectorAll('#history button, #versions button, #locks button')) button.disabled = value;
  updateGenerateButton();
  if (result) renderVersions();
  if (message) el('edit-state').textContent = message;
  updateState();
}
function updateState() {
  const state = gate(); el('export').disabled = !state.allowed; el('edit-state').textContent = busy ? el('edit-state').textContent : dirty ? '有未保存修改，停止输入后将自动保存并核验。' : state.reason;
  el('review-recheck').disabled = !result || busy || dirty || !!pendingJob;
  el('review-state').textContent = busy ? el('edit-state').textContent : dirty ? '正文有未保存修改，保存并核验后更新这里的审核结果。' : state.reason;
  if (result) {
    const queue = reviewClaims(result.verification), reviewState = result.verification.status === 'error' ? '核验流程失败' : queue.length ? `${queue.length} 项需人工关注` : '无待人工关注项';
    el('result-status').textContent = `V${result.version} · ${reviewState} · ${state.allowed ? '可导出 PDF' : '暂不可导出'}`;
  }
}
function renderVerification(report) {
  const queue = reviewClaims(report), conflicts = report.claims?.filter(claim => claim.status === 'conflict').length || 0;
  el('verification-summary').textContent = report.status === 'error' ? '核验流程未完成，当前版本不可导出；请在编辑区重新核验。' : conflicts ? `仍有 ${conflicts} 项事实与依据冲突，自动修订未能解决，当前阻断导出。` : queue.length ? '仅以下缺少明确依据的表述需要你确认；仅显示相关原文摘录，没有参考时会明确标注。' : '所有可核验事实均已找到依据并核对通过。';
  el('verification-counts').textContent = `${queue.length} 项待人工确认 · ${conflicts} 项未解决冲突`;
  el('claims').replaceChildren(...queue.map(claim => {
    const item = text('article', '', `claim ${claim.status}`), heading = text('button', `${statusIcon[claim.status]} ${claim.statement}`); heading.type = 'button';
    heading.addEventListener('click', () => { const input = el(`edit-${claim.field}`), start = input.value.indexOf(claim.statement); if (start >= 0) { showView('works'); el('workspace').open = true; input.focus({ preventScroll: true }); input.setSelectionRange(start, start + claim.statement.length); captureSelection(input); input.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); } });
    item.append(heading, text('p', claim.explanation));
    if (!claim.evidence?.length) item.append(text('p', '没有找到可引用的相关依据。', 'hint'));
    for (const cite of claim.evidence || []) {
      const detail = document.createElement('details'), summary = text('summary', cite.path || cite.sourceId), quote = text('p', `原文：${cite.quote}`); detail.append(summary, quote);
      if (cite.kind === 'web' && /^https:\/\/(www|item|m)\.vmall\.com\//.test(cite.path || '')) { const link = text('a', '打开华为商城原页 ↗'); link.href = cite.path; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link); }
      if (cite.kind === 'ecosystem-web' && /^https:\/\/consumer\.huawei\.com\/cn\//.test(cite.path || '')) { const link = text('a', '打开华为消费者业务原页 ↗'); link.href = cite.path; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link); }
      item.append(detail);
    }
    return item;
  }));
}
function renderLocks() {
  el('locks').replaceChildren(...result.locks.map(lock => {
    const item = text('div', '', 'lock-item'); item.append(text('span', `${lock.field} · “${lock.text.slice(0, 36)}${lock.text.length > 36 ? '…' : ''}”`));
    const remove = text('button', '解除'); remove.type = 'button'; remove.addEventListener('click', () => updateLock({ operation: 'remove', lockId: lock.id })); item.append(remove); return item;
  }));
  if (!result.locks.length) el('locks').append(text('p', '还没有锁定片段。锁定后，手动或 AI 修改都不能覆盖它。', 'hint'));
}
function renderVersions() {
  el('versions').replaceChildren(...result.versions.map(version => {
    const button = text('button', `V${version.version}　${version.reason}\n${new Date(version.createdAt).toLocaleString()}`, version.version === result.version ? 'active' : ''); button.type = 'button'; button.disabled = version.version === result.version || busy;
    button.addEventListener('click', () => checkout(version.version)); return button;
  }));
}
function render(data, { openWorks = false } = {}) {
  cache.delete(data.task.productId);
  clearTimeout(autoSaveTimer); result = data; dirty = false; selected = undefined; loaded = data.images.map(() => 'loading');
  el('selection-text').textContent = '先在任一编辑框中划选文字';
  for (const field of contentFields) { el(`edit-${field}`).value = data[field] || ''; el(field).textContent = data[field] || ''; }
  el('session-id').textContent = `会话 ${data.sessionId.slice(0, 8)} · 当前 V${data.version}`; el('mode').textContent = data.label;
  el('strategy').textContent = [data.strategy.angle, data.strategy.tone, data.strategy.voice ? `表达语气：${data.strategy.voice}` : '', data.strategy.note].filter(Boolean).join('。');
  const imageStatus = el('image-selection-status') || text('p', '', 'hint');
  imageStatus.id = 'image-selection-status';
  imageStatus.textContent = data.imageSelection ? `配图：官网 ${data.imageSelection.officialCount} 张，已有素材 ${data.imageSelection.fallbackCount} 张。${data.imageSelection.summary}` : '此历史版本沿用原有配图；新生成任务默认优先使用官网图片。';
  el('images').before(imageStatus);
  el('empty').hidden = true; el('article').hidden = false; el('details').hidden = false; el('workspace').hidden = false;
  el('review-empty').hidden = true; el('review-context').hidden = false;
  el('review-title').textContent = data.title;
  el('review-error').textContent = '';
  if (openWorks) el('workspace').open = false;
  el('images').replaceChildren(...data.images.map((item, index) => {
    const figure = document.createElement('figure'), img = document.createElement('img'); img.alt = item.description || item.name;
    const mark = state => { if (result !== data) return; loaded[index] = state; updateState(); }; img.addEventListener('load', () => mark('loaded')); img.addEventListener('error', () => mark('failed')); img.src = item.url;
    const caption = document.createElement('figcaption'); caption.append(text('span', `${item.position} · ${item.description}`)); const detail = document.createElement('details'); detail.append(text('summary', '图片来源与文件'), text('p', `${item.name}\n来源：${item.source}`)); caption.append(detail); figure.append(img, caption); return figure;
  }));
  renderVerification(data.verification); renderLocks(); renderVersions(); updateState();
  if (openWorks) showView('works', { reset: true });
  refreshHistory().catch(error => { el('history-error').textContent = error.message; });
}
function captureSelection(input) {
  if (!result || input.selectionEnd <= input.selectionStart) return;
  selected = { field: input.dataset.field, start: input.selectionStart, end: input.selectionEnd, text: input.value.slice(input.selectionStart, input.selectionEnd) };
  el('selection-text').textContent = `已选择 ${selected.field}：${selected.text.slice(0, 80)}${selected.text.length > 80 ? '…' : ''}`;
}
for (const field of contentFields) {
  const input = el(`edit-${field}`); input.dataset.field = field;
  for (const event of ['select', 'mouseup', 'keyup']) input.addEventListener(event, () => captureSelection(input));
  input.addEventListener('input', () => {
    if (!result) return; result[field] = input.value; el(field).textContent = input.value; dirty = true; selected = undefined; el('selection-text').textContent = '先在任一编辑框中划选文字';
    clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => saveManual(true), 1800); updateState();
  });
}
async function saveManual(automatic = false) {
  clearTimeout(autoSaveTimer); if (!result || !dirty || busy) return;
  setBusy(true, automatic ? '已停止输入，正在自动保存并核验…' : '正在保存并核验…');
  try { render(await post(`/api/sessions/${result.sessionId}/edit`, { action: 'manual', expectedRevision: result.revision, content: currentContent() })); el('edit-error').textContent = ''; }
  catch (error) {
    const message = error.message;
    if (error.status === 400 && message.includes('锁定')) {
      try { render(await request(`/api/sessions/${result.sessionId}`)); el('edit-error').textContent = `${message} 已恢复数据库中的当前版本。`; }
      catch { el('edit-error').textContent = `${message} 输入已保留，请恢复锁定原文后重新保存。`; }
    } else el('edit-error').textContent = `${message} 当前输入已保留，请查询任务或核对历史存档。`;
  }
  finally { setBusy(false); }
}
el('save-edit').addEventListener('click', () => saveManual(false));
el('ai-edit').addEventListener('click', async () => {
  if (!result || dirty) return el('edit-error').textContent = '请先等待当前手动修改自动保存并核验。';
  if (!selected) return el('edit-error').textContent = '请先在任一编辑框中划选要修改的片段。';
  const instruction = el('edit-instruction').value.trim(); if (!instruction) return el('edit-error').textContent = '请说明选中片段要怎么改。';
  setBusy(true, 'AI 正在只修改选中片段，完成后自动核验…');
  try { render(await post(`/api/sessions/${result.sessionId}/edit`, { action: 'ai', expectedRevision: result.revision, ...selected, instruction })); el('edit-instruction').value = ''; el('edit-error').textContent = ''; }
  catch (error) { el('edit-error').textContent = error.message; }
  finally { setBusy(false); }
});
async function updateLock(operation) {
  if (!result || dirty) return el('edit-error').textContent = '请先保存当前文字修改。';
  if (operation.operation === 'add' && !selected) return el('edit-error').textContent = '请先划选要保留的片段。';
  setBusy(true, '正在保存保留区…');
  try { render(await post(`/api/sessions/${result.sessionId}/locks`, { expectedRevision: result.revision, ...operation, ...(operation.operation === 'add' ? selected : {}) })); el('edit-error').textContent = ''; }
  catch (error) { el('edit-error').textContent = error.message; }
  finally { setBusy(false); }
}
el('lock-selection').addEventListener('click', () => updateLock({ operation: 'add' }));
async function recheck() {
  if (!result || dirty) return el('edit-error').textContent = '请先保存当前文字修改。';
  setBusy(true, '正在重新读取事实并核验当前版本…');
  try { render(await post(`/api/sessions/${result.sessionId}/recheck`, { expectedRevision: result.revision })); el('edit-error').textContent = ''; }
  catch (error) { el('edit-error').textContent = error.message; el('review-error').textContent = error.message; }
  finally { setBusy(false); }
}
el('recheck').addEventListener('click', recheck);
el('review-recheck').addEventListener('click', recheck);
async function checkout(version) {
  if (!result || dirty || busy) return el('edit-error').textContent = '请先完成当前修改的保存和核验，再切换版本。';
  if (!confirm(`切换到 V${version}？当前版本仍会保留在历史中。`)) return;
  setBusy(true, `正在恢复 V${version}…`);
  try { render(await post(`/api/sessions/${result.sessionId}/checkout`, { expectedRevision: result.revision, version })); el('edit-error').textContent = ''; }
  catch (error) { el('edit-error').textContent = error.message; }
  finally { setBusy(false); }
}

async function refreshHistory() {
  const history = await request('/api/history'); el('history-count').textContent = `${history.length} 个会话`;
  el('history-list').replaceChildren(...history.map(item => {
    const row = text('article', '', 'history-item'), copy = text('button', '', 'history-open'); copy.type = 'button';
    copy.append(text('strong', item.title || '未命名草稿'), text('span', `${item.product} · ${item.scene}`), text('small', `${platformLabel[item.platform] || item.platform} · V${item.version}/${item.versionCount} · ${statusLabel[item.status] || item.status} · ${item.exportedAt ? '当前版本已导出' : '当前版本未导出'} · ${new Date(item.updatedAt).toLocaleString()}`));
    copy.disabled = busy;
    copy.addEventListener('click', async () => { if (dirty || busy) return el('history-error').textContent = '当前修改正在等待保存或核验，请稍后再打开其他会话。'; setBusy(true, '正在恢复历史会话…'); try { const data = await request(`/api/sessions/${item.id}`); putTask(data.task); render(data, { openWorks: true }); el('history-error').textContent = ''; } catch (error) { el('history-error').textContent = error.message; } finally { setBusy(false); } });
    const remove = text('button', '删除', 'history-delete'); remove.type = 'button'; remove.addEventListener('click', async () => { if (dirty || busy) return el('history-error').textContent = '请先完成当前修改的保存和核验。'; if (!confirm(`删除“${item.title}”及其全部版本？此操作不可恢复。`)) return; setBusy(true, '正在删除会话…'); try { const opened = item.id === result?.sessionId ? result : await request(`/api/sessions/${item.id}`); await post(`/api/sessions/${item.id}`, { expectedRevision: opened.revision }, 'DELETE'); if (item.id === result?.sessionId) resetResult(); await refreshHistory(); } catch (error) { el('history-error').textContent = error.message; } finally { setBusy(false); } });
    remove.disabled = busy; row.append(copy, remove); return row;
  }));
  if (!history.length) el('history-list').append(text('p', '还没有历史存档。首次生成后会自动保存在本地数据库。', 'history-empty'));
}
function resetResult() { clearTimeout(autoSaveTimer); result = undefined; dirty = false; selected = undefined; loaded = []; el('review-empty').hidden = false; el('review-context').hidden = true; el('review-error').textContent = ''; el('workspace').open = false; el('article').hidden = true; el('details').hidden = true; el('workspace').hidden = true; el('empty').hidden = false; el('empty-create').hidden = false; el('empty-title').textContent = '你的下一篇电脑营销文案，从这里开始。'; el('empty-description').textContent = '选好华为电脑、人群与角度，准备适合发布的宣传图文。'; updateState(); }
el('clear-history').addEventListener('click', async () => { if (dirty || busy) return el('history-error').textContent = '请先完成当前修改的保存和核验。'; if (!confirm('清空全部会话、版本及持久化图片？此操作不可恢复。')) return; setBusy(true, '正在清空历史…'); try { await post('/api/history', { confirm: 'DELETE_ALL_HISTORY' }, 'DELETE'); resetResult(); await refreshHistory(); } catch (error) { el('history-error').textContent = error.message; } finally { setBusy(false); } });

window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });

el('task').addEventListener('submit', async event => {
  if (busy || dirty || pendingJob) { event.preventDefault(); el('error').textContent = '请先完成当前会话的保存和核验，或查询尚待确认的任务。'; return; }
  event.preventDefault(); el('error').textContent = ''; resetResult(); el('loading').hidden = false; el('empty-create').hidden = true; el('empty-description').textContent = '系统会建立会话、读取事实、生成、核验并写入数据库。'; el('generate').disabled = true; el('generate').textContent = '正在创作、核验与存档…'; showView('works', { reset: true });
  setBusy(true);
  const start = Date.now(); el('elapsed').textContent = '0 秒'; const timer = setInterval(() => el('elapsed').textContent = `${Math.floor((Date.now() - start) / 1000)} 秒`, 1000);
  try { render(await post('/api/generate', taskFromForm()), { openWorks: true }); }
  catch (error) { el('error').textContent = error.message; el('empty-title').textContent = '暂未取得创作结果。'; el('empty-description').textContent = error.message; el('empty-create').hidden = false; showView('works', { reset: true }); }
  finally { clearInterval(timer); el('loading').hidden = true; setBusy(false); el('generate').replaceChildren(text('span', '生成营销图文'), text('span', '↗')); }
});
el('export').addEventListener('click', async () => {
  if (!result || !gate().allowed) return;
  setBusy(true, '正在排版文字与实际配图，生成 PDF…');
  try {
    const response = await fetch(`/api/sessions/${result.sessionId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: result.revision }) });
    if (!response.ok) throw await responseError(response);
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = `营销图文方案-V${result.version}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); await refreshHistory();
  } catch (error) { el('edit-error').textContent = error.message; } finally { setBusy(false); }
});
init();
