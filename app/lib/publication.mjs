// Marketing intent and ecosystem permissions are separate from product facts.
import { selectedAngleIssues } from './workflow.mjs';

export const collaborationPattern = /多屏协同|碰一碰|一碰即传|跨设备|超级终端|设备互联|跨屏|互传|(?:手机|平板|电脑|设备|生态|耳机|手表)(?:的|间|之间|与电脑)?协同|(?:手机|平板|设备).{0,6}(?:与|和).{0,6}(?:电脑|设备).{0,6}协同|音频流转|音频共享/;
export function angleContract(task) {
  const tag = task.tag || (task.topic ? { label: task.topic.tag || task.topic.title, angle: task.topic.angle, aliases: [task.topic.title] } : null);
  return tag ? { label: tag.label, angle: tag.angle, vocabulary: [...new Set([tag.label, ...(tag.aliases || []), ...(tag.needs || [])])],
    requirement: '首段就自然出现该话题/场景词，引出电脑的购买动机，正文亮点围绕该动机展开，不能仅在标题、文末或话题标签补词。标签不充当事实；没有优惠证据时仍可提国补换新话题，但不暗示本机享受优惠。',
    currentDate: new Date().toISOString().slice(0, 10), dateGuidance: '日期仅用于措辞。标签不是时效来源，不能宣称近期热议、活动正在进行；无时效证据用条件式顾客动机。开学、毕业、假期是否将至须符合当前月份，否则写常态场景。',
    ...(/subsidy/.test(tag.id || '') || /国补/.test(tag.label) ? { safeOpeningExample: '因为国补话题动了换电脑的心思？不妨认识一下这款……（接有据的电脑亮点）。这只是顾客动机，不宣称活动正在进行或本机便宜。' } : {}) } : null;
}
export function ecosystemCard(candidate, task, chunks) {
  if (!candidate || !task.ecosystemDevices?.includes(candidate.category) || typeof candidate.model !== 'string' || candidate.model.trim().length < 5 || typeof candidate.sentence !== 'string' || !collaborationPattern.test(candidate.sentence) || !candidate.sentence.includes(candidate.model) || !Array.isArray(candidate.evidence)) return null;
  const evidence = candidate.evidence.flatMap(cite => {
    const source = chunks.find(chunk => chunk.id === cite?.sourceId);
    let allowed = false;
    try { const url = new URL(source?.path); allowed = source.kind === 'ecosystem-web' && url.protocol === 'https:' && url.hostname === 'consumer.huawei.com' && url.pathname.startsWith('/cn/') && !url.port && !url.username && !url.password; } catch {}
    return allowed && typeof cite.quote === 'string' && cite.quote.trim().length >= 6 && cite.quote.length <= 900 && source.text.includes(cite.quote) ? [{ sourceId: source.id, path: source.path, category: source.ecosystemCategory, quote: cite.quote }] : [];
  });
  // A local PC feature or an unrelated category cannot license a named companion.
  const selectedQuotes = evidence.filter(cite => cite.category === candidate.category);
  if (!selectedQuotes.some(cite => cite.quote.includes(candidate.model))) return null;
  const productName = String(task.productName || '').replace(/^HUAWEI\s+/i, '');
  const modelKey = text => text.toLowerCase().replace(/[\s（()）-]+/g, '');
  if (!productName || !evidence.some(cite => modelKey(cite.quote).includes(modelKey(productName)))) return null;
  if (!evidence.some(cite => collaborationPattern.test(cite.quote) && /电脑|笔记本|MateBook|MateStation/.test(cite.quote))) return null;
  if (candidate.sentence.trim().split(/(?<=[。！？!?])/).filter(text => text.trim()).length !== 1 || /\n/.test(candidate.sentence.trim())) return null;
  return { category: candidate.category, model: candidate.model.trim(), sentence: candidate.sentence.trim(), conditions: String(candidate.conditions || ''), evidence };
}
export function publicationIssues(task, draft, ecosystem) {
  const issues = selectedAngleIssues(task, draft);
  const sentences = ['title', 'body', 'cta', 'tags'].flatMap(field => String(draft[field] || '').split(/(?<=[。！？!?\n])/).filter(text => collaborationPattern.test(text)));
  if (sentences.length && !ecosystem?.card) issues.push('没有通过当前电脑配对核验的生态证据，删除所有协同、碰一碰、跨设备互联表述，不用泛协同代替具体型号。');
  if (ecosystem?.card && sentences.length > 1) issues.push('生态配角最多一个自然句，删除协同小标题和额外协同段落，把篇幅留给电脑。');
  if (ecosystem?.card && sentences.some(text => text.trim() !== ecosystem.card.sentence.trim())) issues.push(`协同仅可原样采用ecosystem.card.sentence中的批准句，避免改写丢失型号、功能或条件；也可完全省略。`);
  return issues;
}

export function writerSources(chunks, ecosystem) {
  const sources = chunks.filter(chunk => chunk.kind !== 'ecosystem-web').map(chunk => ({ ...chunk }));
  // The writer receives only approved, short official extracts; the auditor keeps full sources.
  for (const cite of ecosystem?.card?.evidence || []) {
    const existing = sources.find(source => source.id === cite.sourceId);
    if (existing) existing.text += '\n' + cite.quote;
    else sources.push({ ...chunks.find(chunk => chunk.id === cite.sourceId), text: cite.quote });
  }
  return sources;
}
