import { failure } from './config.mjs';
import { generate, platforms } from './workflow.mjs';
import { contentOf, fields } from './editor.mjs';

export function sourceChunks(evidence) {
  if (evidence.documents?.length) {
    const chunks = [];
    for (const doc of evidence.documents) {
      for (let start = 0; start < doc.text.length; start += 4000) chunks.push({ id: `S${chunks.length + 1}`, path: doc.path, kind: doc.kind, productId: doc.productId, text: doc.text.slice(start, start + 4000) });
    }
    return chunks;
  }
  const text = evidence.facts || '';
  return Array.from({ length: Math.ceil(text.length / 4000) }, (_, i) => ({ id: `S${i + 1}`, path: evidence.factPath, kind: evidence.sourceMode || 'local', text: text.slice(i * 4000, (i + 1) * 4000) }));
}
export function normalizeVerification(value, draft, chunks, engine) {
  if (!value || !Array.isArray(value.claims) || value.claims.length > 100 || typeof value.summary !== 'string') throw failure('事实核验响应格式无效，请重新核验。');
  const claims = value.claims.map((claim, index) => {
    if (!claim || !fields.includes(claim.field) || typeof claim.statement !== 'string' || !claim.statement.trim() || !draft[claim.field].includes(claim.statement) || !['verified', 'warning', 'conflict'].includes(claim.status) || typeof claim.explanation !== 'string' || !Array.isArray(claim.evidence)) throw failure('事实核验中的表述或状态无效，请重新核验。');
    const evidence = claim.evidence.slice(0, 8).flatMap(cite => {
      const chunk = chunks.find(item => item.id === cite?.sourceId);
      return chunk && typeof cite.quote === 'string' && cite.quote.trim().length >= 6 && chunk.text.includes(cite.quote) ? [{ sourceId: chunk.id, path: chunk.path || '', kind: chunk.kind || 'local', quote: cite.quote }] : [];
    });
    const missing = claim.status !== 'warning' && evidence.length === 0;
    return { id: `C${index + 1}`, field: claim.field, statement: claim.statement,
      status: missing ? 'warning' : claim.status, evidence,
      explanation: missing ? '核验未提供可逐字溯源的证据，降级为待确认；不视为已证实的错误。' : claim.explanation };
  });
  if (!claims.length) claims.push({ id: 'C1', field: 'body', statement: draft.body.slice(0, 160), status: 'warning', explanation: '核验没有返回可评估的产品主张，请自行核对。', evidence: [] });
  const counts = { verified: 0, warning: 0, conflict: 0 }; claims.forEach(claim => counts[claim.status]++);
  return { status: counts.conflict ? 'conflict' : counts.warning ? 'warning' : 'verified', claims, counts,
    summary: value.summary, engine, checkedAt: new Date().toISOString(), content: contentOf(draft) };
}
export function offlineVerification(draft) {
  const claims = fields.flatMap(field => draft[field].trim() ? [{ field, statement: draft[field], status: 'warning', explanation: '离线规则模式：已保存资料，尚未调用大模型做语义核验。你可自行检查或点击“用 AI 重新核验”。', evidence: [] }] : []);
  return normalizeVerification({ claims, summary: '离线草稿，内容未经 AI 语义核验；警告不阻断导出。' }, draft, [], 'rules');
}
export function failedVerification(draft, message) {
  return { status: 'error', claims: [], counts: { verified: 0, warning: 0, conflict: 0 }, summary: message,
    engine: 'model', checkedAt: new Date().toISOString(), content: contentOf(draft) };
}
export function finalize(task, source, draft, verification, points = [], revisionCount = 0) {
  const result = generate(task, source), platform = platforms[task.platform];
  Object.assign(result, contentOf(draft), { product: source.product, citations: (draft.citations || points).filter(cite => fields.some(field => draft[field]?.includes(cite.statement))), verification,
    mode: `${source.sourceMode}-${task.engine === 'model' ? 'model' : 'rule'}-draft`,
    label: `${source.sourceMode === 'ima' ? '本地 + ima' : '本地赛事参考'}${source.documents?.some(doc => doc.kind === 'web') ? ' + 华为商城' : ''} · ${task.engine === 'model' ? 'DeepSeek 草稿' : '离线规则草稿'}`,
    evidence: { facts: source.facts, path: source.factPath, sources: source.sources, documents: source.documents || [], chunks: sourceChunks(source), trace: source.trace || [] } });
  result.strategy.angle = typeof draft.angle === 'string' ? draft.angle : draft.strategy?.angle || result.strategy.angle;
  result.strategy.note = '事实核验只评估产品主张；无依据标警告，事实冲突阻断导出。配图尚未进行视觉核验。';
  const conflicts = verification.claims.filter(claim => claim.status === 'conflict').map(claim => `${claim.statement}：${claim.explanation}`);
  const warnings = verification.claims.filter(claim => claim.status === 'warning').map(claim => `${claim.statement}：${claim.explanation}`);
  result.audit = { approved: !['error', 'conflict'].includes(verification.status), blocking: conflicts, suggestions: warnings, issues: [...conflicts, ...warnings], summary: verification.summary, revisionCount, model: verification.engine };
  result.checks = [
    { name: '资料来源', status: 'pass', detail: source.sourceMode === 'ima' ? '本地P1资料始终保留，ima资料作为补充。' : '本地赛事P1事实与限制；不以是否接入ima决定草稿放行。' },
    { name: '产品事实', status: verification.status === 'verified' ? 'pass' : verification.status, detail: verification.summary },
    { name: '图片型号与数量', status: result.images.length >= platform.min && result.images.length <= platform.max ? 'pass' : 'conflict', detail: `选用 ${result.images.length} 张，平台要求 ${platform.min}–${platform.max} 张；按型号目录/索引匹配，未实施视觉核验。` },
  ];
  result.exportable = result.audit.approved && result.checks[2].status === 'pass';
  return result;
}
