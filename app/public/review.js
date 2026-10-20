const limits = { xiaohongshu: [3, 6], wechat: [2, 4], moments: [1, 3] };
export const contentFields = ['title', 'body', 'cta', 'tags'];
export function contentOf(draft) { return Object.fromEntries(contentFields.map(key => [key, String(draft[key] || '')])); }
export function contentChanged(draft, original) { return contentFields.some(key => draft[key] !== original[key]); }
// Keep the complete report in storage. This is only the user's review queue.
export function reviewClaims(report) {
  return (report?.claims || []).filter(claim => claim.status === 'warning');
}
// Shared by server and UI: warnings allow a draft export, conflicts and stale checks never do.
export function exportGate({ draft, platform, loaded, dirty = false, busy = false }) {
  if (!draft) return { allowed: false, reason: '请先生成或打开历史草稿。' };
  if (dirty || busy) return { allowed: false, reason: '修改正在保存或核验，完成后可导出。' };
  if (!draft.title?.trim() || !draft.body?.trim()) return { allowed: false, reason: '标题和正文不能为空。' };
  const [min, max] = limits[platform] || [1, 6];
  if (!Array.isArray(draft.images) || draft.images.length < min || draft.images.length > max) return { allowed: false, reason: `当前平台需要 ${min}–${max} 张图片，现有 ${draft.images?.length || 0} 张。` };
  if (loaded && (loaded.length !== draft.images.length || loaded.some(state => state !== 'loaded'))) return { allowed: false, reason: loaded.includes('failed') ? '有配图加载失败，请检查素材。' : '正在检查配图是否可用。' };
  const report = draft.verification;
  if (!report || report.status === 'error') return { allowed: false, reason: '事实核验尚未完成或失败，请点击重新核验。' };
  if (contentFields.some(key => report.content?.[key] !== draft[key])) return { allowed: false, reason: '内容已改变，需对当前版本重新核验。' };
  if (report.status === 'conflict' || report.claims?.some(claim => claim.status === 'conflict')) return { allowed: false, reason: '存在与资料冲突的事实，请修改后重新核验。人工确认不能绕过。' };
  if (!['verified', 'warning'].includes(report.status)) return { allowed: false, reason: '核验状态无效，请重新核验。' };
  return { allowed: true, reason: '当前版本可导出图文 PDF。' };
}
