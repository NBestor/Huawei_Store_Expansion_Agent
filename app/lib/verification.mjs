import { failure } from './config.mjs';
import { generate, platforms } from './workflow.mjs';
import { contentOf, fields } from './editor.mjs';
import { editorialReport } from './editorial.mjs';
import { publicationIssues, angleContract, collaborationPattern } from './publication.mjs';

export function sourceChunks(evidence) {
  if (evidence.documents?.length) {
    const chunks = [];
    for (const doc of evidence.documents) {
      for (let start = 0; start < doc.text.length; start += 4000) chunks.push({ id: `S${chunks.length + 1}`, path: doc.path, kind: doc.kind, productId: doc.productId, ecosystemCategory: doc.ecosystemCategory, ecosystemCategoryLabel: doc.ecosystemCategoryLabel, title: doc.title, text: doc.text.slice(start, start + 4000) });
    }
    return chunks;
  }
  const text = evidence.facts || '';
  return Array.from({ length: Math.ceil(text.length / 4000) }, (_, i) => ({ id: `S${i + 1}`, path: evidence.factPath, kind: evidence.sourceMode || 'local', text: text.slice(i * 4000, (i + 1) * 4000) }));
}

// These are editorial controls, not product claims. Models occasionally return
// them as warnings even though they cannot be verified against a product source.
const invitationPattern = /(?:欢迎|可|可以|建议|不妨|来|到店|进店|私信|留言|咨询|了解|体验|预约|联系|官网|门店|店里|亲手|扫码|点击|关注|选购|购买)/;
const factualMarker = /(?:\d+(?:\.\d+)?\s*(?:英寸|英尺|克|千克|公斤|小时|瓦时|Wh|W|Hz|GB|TB|毫米|mm|%|核|线程|万像素)|支持|搭载|配备|采用|提供|内置|接口|屏幕|续航|电池|处理器|显卡|内存|硬盘|系统|分辨率|刷新率|重量|厚度|型号|版本|售价|价格|优惠|补贴|国补|活动|限时|现货|赠品)/i;
const ctaFactPattern = /(?:售价|价格|优惠|补贴|国补|活动|限时|现货|赠品|免费|服务承诺|门店地址|发票|保修)/;
const rhetoricalPattern = /(?:很懂|更从容|值得(?:放进|加入|列入)|戳中|心动|种草|宝藏|解锁|陪你|为你|适合(?:校园|通勤|随行)|一台新电脑|新装备|心愿单|更轻松|更自在|更高效)/;

/** Return true when a model claim is clearly copy guidance rather than a fact. */
export function isNonProductClaim(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (claim.field === 'tags') return true;
  const statement = String(claim.statement || '').trim();
  if (!statement) return true;
  // A CTA may mention a screen, interface or other product object as the
  // thing customers can experience; that still is an invitation, not a claim
  // that the source must prove. Keep only explicit offer/service assertions.
  if (claim.field === 'cta' && invitationPattern.test(statement) && !ctaFactPattern.test(statement)) return true;
  if ((claim.field === 'title' || claim.field === 'body') && rhetoricalPattern.test(statement) && !factualMarker.test(statement)) return true;
  return false;
}
export function normalizeVerification(value, draft, chunks, engine, ecosystem) {
  if (!value || !Array.isArray(value.claims) || value.claims.length > 100 || typeof value.summary !== 'string') throw failure('事实核验响应格式无效，请重新核验。');
  const claims = value.claims.filter(claim => !isNonProductClaim(claim)).map((claim, index) => {
    if (!claim || !fields.includes(claim.field) || typeof claim.statement !== 'string' || !claim.statement.trim() || !draft[claim.field].includes(claim.statement) || !['verified', 'warning', 'conflict'].includes(claim.status) || typeof claim.explanation !== 'string' || !Array.isArray(claim.evidence)) throw failure('事实核验中的表述或状态无效，请重新核验。');
    const evidence = claim.evidence.slice(0, 8).flatMap(cite => {
      const chunk = chunks.find(item => item.id === cite?.sourceId);
      return chunk && typeof cite.quote === 'string' && cite.quote.trim().length >= 6 && chunk.text.includes(cite.quote) ? [{ sourceId: chunk.id, path: chunk.path || '', kind: chunk.kind || 'local', quote: cite.quote }] : [];
    });
    // If the complete statement is present in an approved source, the model's
    // warning is only an omitted citation. Recover that citation deterministically.
    let resolvedEvidence = evidence;
    let resolvedStatus = claim.status;
    if (resolvedStatus === 'warning' && !resolvedEvidence.length) {
      const exact = chunks.find(chunk => chunk.text.includes(claim.statement));
      if (exact && claim.statement.trim().length >= 6) {
        resolvedEvidence = [{ sourceId: exact.id, path: exact.path || '', kind: exact.kind || 'local', quote: claim.statement }];
        resolvedStatus = 'verified';
      }
    }
    const wrongEcosystem = ecosystem !== undefined && resolvedStatus === 'verified' && collaborationPattern.test(claim.statement) && (!ecosystem?.card || !ecosystem.card.sentence.includes(claim.statement) || !ecosystem.card.evidence.every(approved => resolvedEvidence.some(cite => cite.path === approved.path && cite.quote.includes(approved.quote)))) ;
    const missing = resolvedStatus !== 'warning' && resolvedEvidence.length === 0 || wrongEcosystem;
    return { id: `C${index + 1}`, field: claim.field, statement: claim.statement,
      status: missing ? 'warning' : resolvedStatus, evidence: resolvedEvidence,
      explanation: wrongEcosystem ? '协同表述没有引用通过当前PC配对核验的官网证据，不能视为已证实。' : missing ? '核验未提供可逐字溯源的证据，降级为待确认；不视为已证实的错误。' : resolvedStatus === 'verified' && claim.status === 'warning' ? '原文逐字支持，已补齐引用。' : claim.explanation };
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
    label: `${source.sourceMode === 'ima' ? '本地 + ima' : '本地赛事参考'}${source.documents?.some(doc => doc.kind === 'web') ? ' + 华为商城' : ''}${source.documents?.some(doc => doc.kind === 'ecosystem-web') ? ' + 华为消费者官网' : ''} · ${task.engine === 'model' ? 'DeepSeek 草稿' : '离线规则草稿'}`,
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
  if (task.engine === 'model') {
    result.ecosystem = draft.ecosystem || { status: 'unavailable', card: null, reason: '未建立当前电脑的官网配对证据。' };
    result.angleContract = angleContract(task);
    result.angleReview = draft.angleReview;
    const issues = publicationIssues(task, draft, result.ecosystem);
    if (draft.angleReview && (draft.angleReview.approved !== true || fields.some(field => draft.angleReview.content?.[field] !== draft[field]))) issues.push(draft.angleReview.reason || '当前版本尚未通过销售角度复核。');
    result.publication = { status: issues.length ? 'pending' : 'pass', issues };
    result.checks.push({ name: '销售角度与协同证据', status: issues.length ? 'pending' : 'pass', detail: issues.join('；') || '所选角度已体现，协同内容未超出批准证据。' });
    if (task.ecosystemDevices?.length) result.checks.push({ name: '生态配对资料', status: result.ecosystem.status === 'supported' ? 'pass' : 'pending', detail: result.ecosystem.reason });
    if (issues.length) { result.audit.suggestions.push(...issues); result.audit.issues.push(...issues); result.exportable = false; }
    result.editorial = editorialReport(task.platform, draft);
    result.checks.push({ name: '平台篇幅', status: result.editorial.status === 'within-target' ? 'pass' : 'pending', detail: result.editorial.summary });
    result.strategy.note += ` ${result.editorial.summary}${result.editorial.status === 'within-target' ? '' : '，未达建议范围，可继续精修；不以凑字数替代事实准确'}。`;
  }
  return result;
}
