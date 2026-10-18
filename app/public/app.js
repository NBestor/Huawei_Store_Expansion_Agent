import { contentFields, exportGate, reviewClaims } from './review.js';
import { showView, scrollBehavior } from './views.js';
const el = id => document.getElementById(id);
let result, loaded = [], busy = false, dirty = false, autoSaveTimer, selected, selectionVersion = 0;
const cache = new Map();
const integrationPanel = document.querySelector('.integration-panel');
if (integrationPanel) {
  const form = el('task'), introduction = integrationPanel.querySelector(':scope > p');
  form.insertBefore(integrationPanel, form.querySelector('label'));
  introduction.textContent = '此工作台已接入 ima 官方 OpenAPI，Agent 可查找赛事共享知识库、浏览目录、检索产品资料并读取原文和图片。';
  const quota = document.createElement('p');
  quota.className = 'ima-quota';
  quota.textContent = 'ima 每日访问次数有限。日常开发与回归测试推荐使用本地赛事数据；选择 ima 才会真实访问共享库，额度用尽会明确报错，不会静默切换来源。';
  introduction.after(quota);
}
const statusLabel = { verified: '已核验', warning: '待确认', conflict: '资料冲突', error: '核验失败' };
const statusIcon = { verified: '✓', warning: '!', conflict: '×', error: '○' };
const platformLabel = { xiaohongshu: '小红书', wechat: '公众号', moments: '门店朋友圈' };
async function request(url, options = {}) {
  const res = await fetch(url, options), type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data.error || data || '请求失败'), { status: res.status }); return data;
}
function post(url, value, method = 'POST') { return request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
function text(tag, value, className) { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; }
function showStatus(status) {
  const imaText = !status.ima.configured ? '未配置' : status.ima.verified ? '已配置并验证' : `已配置 · ${status.ima.message || '尚未验证'}`;
  el('ima-status').textContent = imaText; el('ima-status').dataset.state = status.ima.verified ? 'verified' : status.ima.configured ? 'configured' : 'missing';
  el('ima-home-status').textContent = `ima ${imaText}`;
  el('connection').textContent = `ima：${imaText} · DeepSeek ${status.model.model || ''}：${status.model.configured ? status.model.message : '未配置'} · ${status.storage}`;
}
async function showcase(id) { if (!cache.has(id)) cache.set(id, request(`/api/showcase?productId=${encodeURIComponent(id)}`)); return cache.get(id); }
function cover(data) { return data.images.find(image => image.name.includes('高质感主视觉')) || data.images[0]; }
async function selectProduct(id) {
  el('product').value = id; const version = ++selectionVersion;
  for (const card of el('product-cards').children) card.setAttribute('aria-pressed', String(card.dataset.product === id));
  el('selected-image').hidden = true; el('asset-count').textContent = '正在读取本地素材…';
  try {
    const data = await showcase(id); if (version !== selectionVersion) return;
    el('selected-name').textContent = data.product.name; el('asset-count').textContent = `${data.images.length} 张本地参考图片`;
    const image = cover(data); if (image) { el('selected-image').src = image.url; el('selected-image').alt = image.description; el('selected-image').hidden = false; }
  } catch (error) { if (version === selectionVersion) { el('asset-count').textContent = '素材暂不可用'; el('error').textContent = error.message; } }
}
el('selected-image').addEventListener('error', () => { el('selected-image').hidden = true; el('asset-count').textContent = '预览图片不可用，请检查素材'; });
el('product').addEventListener('change', () => selectProduct(el('product').value));
const presets = { campus: ['大学新生', '开学购机，日常学习与携带'], work: ['经常出差的职场人士', '通勤、出差与移动办公'], creative: ['内容创作者', '记录灵感，进行日常图文创作'] };
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => { [el('audience').value, el('scene').value] = presets[button.dataset.preset]; }));
function sourceSettings() {
  if (el('source').value === 'ima') { el('engine').value = 'model'; el('engine').querySelector('[value="rules"]').disabled = true; } else el('engine').querySelector('[value="rules"]').disabled = false;
  el('source-label').textContent = `${el('source').value === 'local' ? '本地参考' : '本地 + ima'} / ${el('engine').value === 'model' ? 'DeepSeek' : '规则草稿'}`;
}
el('source').addEventListener('change', sourceSettings); el('engine').addEventListener('change', sourceSettings);
el('verify').addEventListener('click', async () => { el('verify').disabled = true; el('connection').textContent = '正在验证连接…'; try { showStatus(await post('/api/verify', {})); } catch (error) { el('connection').textContent = error.message; } finally { el('verify').disabled = false; } });

async function init() {
  try {
    const [status, products] = await Promise.all([request('/api/status'), request('/api/products')]); showStatus(status);
    el('product').replaceChildren(...products.map(product => new Option(product.name, product.id)));
    const featured = ['HUAWEI MateBook Fold 非凡大师', 'HUAWEI MateBook Pro', 'HUAWEI MateBook 14（鸿蒙版）'].map(name => products.find(product => product.name === name)).filter(Boolean);
    const cards = await Promise.all(featured.map(async (product, index) => {
      const data = await showcase(product.id), card = document.createElement('button'); card.type = 'button'; card.className = 'product-card'; card.dataset.product = product.id; card.setAttribute('aria-label', `选择 ${product.name}`); card.setAttribute('aria-pressed', 'false');
      const image = cover(data), img = document.createElement('img'); if (image) img.src = image.url; img.alt = image?.description || product.name; img.loading = 'lazy';
      const copy = text('span', '', 'card-copy'); copy.append(text('small', ['UNFOLD YOUR VISION', 'MAKE ROOM FOR IDEAS', 'COLOUR YOUR EVERYDAY'][index]), text('strong', product.name.replace('HUAWEI ', '')));
      const bottom = text('span', '', 'card-bottom'); bottom.append(text('span', ['展开新的表达', '让灵感自由发生', '让日常多一点色彩'][index]), text('span', '↗', 'card-arrow')); copy.append(bottom); card.append(img, copy);
      card.addEventListener('click', () => { selectProduct(product.id); showView('create', { reset: true }); }); return { card, index };
    }));
    el('product-cards').replaceChildren(...cards.sort((a, b) => a.index - b.index).map(item => item.card));
    const first = featured[0] || products[0]; if (first) { const data = await showcase(first.id); if (cover(data)) el('hero-image').src = cover(data).url; await selectProduct(first.id); }
    el('generate').disabled = !products.length; await refreshHistory();
  } catch (error) { el('error').textContent = `初始化失败：${error.message}`; }
}

function taskFromForm() {
  return { productId: el('product').value, audience: el('audience').value, scene: el('scene').value, platform: el('platform').value,
    mode: el('source').value, engine: el('engine').value, revision: el('revision').value,
    webUrls: el('web-url').value.trim() ? [el('web-url').value.trim()] : [], autoWeb: el('auto-web').checked };
}
function putTask(task) {
  for (const [id, value] of [['product', task.productId], ['audience', task.audience], ['scene', task.scene], ['platform', task.platform], ['source', task.mode], ['engine', task.engine], ['revision', task.revision || ''], ['web-url', task.webUrls?.[0] || '']]) if (el(id)) el(id).value = value;
  el('auto-web').checked = task.autoWeb !== false;
  sourceSettings(); selectProduct(task.productId);
}
function currentContent() { return Object.fromEntries(contentFields.map(field => [field, el(`edit-${field}`).value])); }
function gate() { return exportGate({ draft: result, platform: result?.task?.platform, loaded, dirty, busy }); }
function setBusy(value, message = '') {
  busy = value; document.body.classList.toggle('is-busy', value);
  for (const id of ['save-edit', 'ai-edit', 'lock-selection', 'recheck', 'export', 'clear-history']) if (el(id)) el(id).disabled = value;
  for (const field of contentFields) el(`edit-${field}`).disabled = value;
  for (const button of document.querySelectorAll('#history button, #versions button, #locks button')) button.disabled = value;
  el('generate').disabled = value;
  if (result) renderVersions();
  if (message) el('edit-state').textContent = message;
  updateState();
}
function updateState() {
  const state = gate(); el('export').disabled = !state.allowed; el('edit-state').textContent = busy ? el('edit-state').textContent : dirty ? '有未保存修改，停止输入后将自动保存并核验。' : state.reason;
  if (result) {
    const queue = reviewClaims(result.verification), reviewState = result.verification.status === 'error' ? '核验流程失败' : queue.length ? `${queue.length} 项需人工关注` : '无待人工关注项';
    el('result-status').textContent = `V${result.version} · ${reviewState} · ${state.allowed ? '可导出 PDF' : '暂不可导出'}`;
  }
}
function renderVerification(report) {
  const queue = reviewClaims(report), conflicts = queue.filter(claim => claim.status === 'conflict').length, webOnly = queue.length - conflicts;
  el('verification-summary').textContent = report.status === 'error' ? '核验流程未完成，当前版本不可导出；请在编辑区重新核验。' : queue.length ? '以下内容需要人工判断：明确冲突，或仅由商城网页支持、尚未得到文档或 ima 支持的表述。' : '暂无需要人工关注的事实。文档或 ima 已支持、以及无明确依据的条目不在这里展示。';
  el('verification-counts').textContent = `${conflicts} 项冲突 · ${webOnly} 项仅网页支持`;
  el('claims').replaceChildren(...queue.map(claim => {
    const webClaim = claim.status === 'verified', item = text('article', '', `claim ${webClaim ? 'web-only' : claim.status}`), heading = text('button', `${webClaim ? '↗' : statusIcon[claim.status]} ${claim.statement}`); heading.type = 'button';
    heading.addEventListener('click', () => { const input = el(`edit-${claim.field}`), start = input.value.indexOf(claim.statement); if (start >= 0) { input.focus({ preventScroll: true }); input.setSelectionRange(start, start + claim.statement.length); captureSelection(input); input.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); } });
    item.append(heading, text('p', claim.explanation));
    for (const cite of claim.evidence || []) {
      const detail = document.createElement('details'), summary = text('summary', cite.path || cite.sourceId), quote = text('p', `原文：${cite.quote}`); detail.append(summary, quote);
      if (cite.kind === 'web' && /^https:\/\/(www|item|m)\.vmall\.com\//.test(cite.path || '')) { const link = text('a', '打开华为商城原页 ↗'); link.href = cite.path; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link); }
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
  clearTimeout(autoSaveTimer); result = data; dirty = false; selected = undefined; loaded = data.images.map(() => 'loading');
  el('selection-text').textContent = '先在任一编辑框中划选文字';
  for (const field of contentFields) { el(`edit-${field}`).value = data[field] || ''; el(field).textContent = data[field] || ''; }
  el('session-id').textContent = `会话 ${data.sessionId.slice(0, 8)} · 当前 V${data.version}`; el('mode').textContent = data.label;
  el('strategy').textContent = [data.strategy.angle, data.strategy.tone, data.strategy.note].filter(Boolean).join('。'); el('facts').textContent = data.evidence.facts; el('source-path').textContent = data.evidence.path;
  el('empty').hidden = true; el('article').hidden = false; el('details').hidden = false; el('workspace').hidden = false;
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
    } else el('edit-error').textContent = `${message} 当前输入已保留，尚未写入存档。`;
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
el('recheck').addEventListener('click', async () => {
  if (!result || dirty) return el('edit-error').textContent = '请先保存当前文字修改。';
  setBusy(true, '正在重新读取事实并核验当前版本…');
  try { render(await post(`/api/sessions/${result.sessionId}/recheck`, { expectedRevision: result.revision })); el('edit-error').textContent = ''; }
  catch (error) { el('edit-error').textContent = error.message; }
  finally { setBusy(false); }
});
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
function resetResult() { clearTimeout(autoSaveTimer); result = undefined; dirty = false; selected = undefined; loaded = []; el('article').hidden = true; el('details').hidden = true; el('workspace').hidden = true; el('empty').hidden = false; el('empty-create').hidden = false; el('empty-title').textContent = '你的下一个作品，从这里诞生。'; el('empty-description').textContent = '选好产品，写下场景。文字、配图与事实依据，将在这里汇合。'; updateState(); }
el('clear-history').addEventListener('click', async () => { if (dirty || busy) return el('history-error').textContent = '请先完成当前修改的保存和核验。'; if (!confirm('清空全部会话、版本及持久化图片？此操作不可恢复。')) return; setBusy(true, '正在清空历史…'); try { await post('/api/history', { confirm: 'DELETE_ALL_HISTORY' }, 'DELETE'); resetResult(); await refreshHistory(); } catch (error) { el('history-error').textContent = error.message; } finally { setBusy(false); } });

window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });

el('task').addEventListener('submit', async event => {
  if (busy || dirty) { event.preventDefault(); el('error').textContent = '请先完成当前会话的保存和核验。'; return; }
  event.preventDefault(); el('error').textContent = ''; resetResult(); el('loading').hidden = false; el('empty-create').hidden = true; el('empty-description').textContent = '系统会建立会话、读取事实、生成、核验并写入数据库。'; el('generate').disabled = true; el('generate').textContent = '正在创作、核验与存档…'; showView('works', { reset: true });
  setBusy(true);
  const start = Date.now(); el('elapsed').textContent = '0 秒'; const timer = setInterval(() => el('elapsed').textContent = `${Math.floor((Date.now() - start) / 1000)} 秒`, 1000);
  try { render(await post('/api/generate', taskFromForm()), { openWorks: true }); }
  catch (error) { el('error').textContent = error.message; el('empty-title').textContent = '这一次创作未能完成。'; el('empty-description').textContent = error.message; el('empty-create').hidden = false; showView('works', { reset: true }); }
  finally { clearInterval(timer); el('loading').hidden = true; setBusy(false); el('generate').replaceChildren(text('span', '生成并建立会话'), text('span', '↗')); }
});
el('export').addEventListener('click', async () => {
  if (!result || !gate().allowed) return;
  setBusy(true, '正在排版文字与实际配图，生成 PDF…');
  try {
    const response = await fetch(`/api/sessions/${result.sessionId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: result.revision }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw Object.assign(new Error(data.error || 'PDF 生成失败'), { status: response.status }); }
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = `营销图文方案-V${result.version}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); await refreshHistory();
  } catch (error) { el('edit-error').textContent = error.message; } finally { setBusy(false); }
});
init();
