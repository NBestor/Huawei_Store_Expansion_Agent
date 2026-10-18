import { randomUUID } from 'node:crypto';
import { problem } from './store.mjs';
export const fields = ['title', 'body', 'cta', 'tags'];
const maxLength = { title: 150, body: 12000, cta: 1000, tags: 500 };
export function contentOf(draft) { return Object.fromEntries(fields.map(field => [field, draft[field] || ''])); }
export function validateContent(value) {
  if (!value || !fields.every(field => typeof value[field] === 'string' && value[field].length <= maxLength[field]) || !value.title.trim() || !value.body.trim()) throw problem('标题、正文不能为空；标题最多150字，正文12000字，引导1000字，标签500字。');
  return contentOf(value);
}
export function selection(draft, field, start, end) {
  if (!fields.includes(field) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > draft[field].length) throw problem('请先在编辑框中选择有效片段。');
  return { field, start, end, text: draft[field].slice(start, end) };
}
export function addLock(draft, locks, field, start, end) {
  const selected = selection(draft, field, start, end);
  if (locks.some(lock => lock.field === field && start < lock.end && end > lock.start)) throw problem('这个片段与已有保留区重叠，请先解除对应保留区。');
  if (locks.length >= 40) throw problem('最多保留40个片段。');
  return [...locks, { ...selected, id: randomUUID() }];
}
// The model only returns a replacement. Everything outside the selected interval comes from the saved draft.
export function mergeReplacement(draft, locks, field, start, end, replacement) {
  selection(draft, field, start, end);
  if (typeof replacement !== 'string') throw problem('模型没有返回可用的片段。');
  if (locks.some(lock => lock.field === field && start < lock.end && end > lock.start)) throw problem('选中内容含保留区，请解除保留后再修改。');
  const next = { ...contentOf(draft), [field]: draft[field].slice(0, start) + replacement + draft[field].slice(end) };
  validateContent(next);
  const delta = replacement.length - (end - start);
  return { content: next, locks: locks.map(lock => lock.field === field && lock.start >= end ? { ...lock, start: lock.start + delta, end: lock.end + delta } : lock) };
}
export function mergeManual(draft, locks, content) {
  validateContent(content);
  let result = { content: contentOf(draft), locks: structuredClone(locks) };
  for (const field of fields) {
    const before = draft[field], after = content[field];
    if (before === after) continue;
    let start = 0, tail = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    while (tail < before.length - start && tail < after.length - start && before[before.length - tail - 1] === after[after.length - tail - 1]) tail++;
    const end = before.length - tail, replacement = after.slice(start, after.length - tail);
    if (result.locks.some(lock => lock.field === field && (start < lock.end && end > lock.start || start === end && start > lock.start && start < lock.end))) throw problem('修改涉及已锁定的保留区，尚未保存。请恢复原文或先解除该保留区。');
    const delta = replacement.length - (end - start);
    result.locks = result.locks.map(lock => lock.field === field && lock.start >= end ? { ...lock, start: lock.start + delta, end: lock.end + delta } : lock);
    result.content[field] = after;
  }
  return result;
}
