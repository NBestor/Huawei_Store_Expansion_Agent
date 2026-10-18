import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const knowledgeRoot = fileURLToPath(new URL('../../华为PC知识库/华为PC全板块深度知识库_v7/', import.meta.url));
// Explicit mappings checked against the supplied per-product image indexes.
const modelNames = {
  '01-鸿蒙电脑/HUAWEI MateBook 14': 'HUAWEI MateBook 14（鸿蒙版）',
  '02-MateBook-Windows/MateBook 14 酷睿 Ultra': 'HUAWEI MateBook 14 酷睿 Ultra',
  '02-MateBook-Windows/MateBook D 14': 'HUAWEI MateBook D 14 2024',
  '02-MateBook-Windows/MateBook D 16': 'HUAWEI MateBook D 16 2024',
  '02-MateBook-Windows/MateBook D 16 SE 版': 'HUAWEI MateBook D 16 SE 版 2024',
  '02-MateBook-Windows/MateBook GT 系列': 'HUAWEI MateBook GT 14',
  '02-MateBook-Windows/MateBook X系列': 'HUAWEI MateBook X Pro 酷睿 Ultra 微绒典藏版',
};
export async function within(root, relative) {
  const base = await realpath(root);
  const target = await realpath(path.resolve(base, relative));
  const relation = path.relative(base, target);
  if (relation.startsWith('..') || path.isAbsolute(relation)) throw new Error('禁止访问目录外文件');
  return target;
}
export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = (rows.shift() || []).map(x => x.replace(/^\uFEFF/, ''));
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(header.map((key, i) => [key, r[i] || ''])));
}
export async function products() {
  const root = path.join(knowledgeRoot, 'P1-产品参数库');
  const result = [];
  for (const category of ['01-鸿蒙电脑', '02-MateBook-Windows']) {
    for (const entry of await readdir(path.join(root, category), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relative = path.join('P1-产品参数库', category, entry.name);
      try { await readFile(path.join(knowledgeRoot, relative, '产品事实.md')); result.push({ id: relative.replaceAll('\\', '/'), name: modelNames[`${category}/${entry.name}`] || entry.name }); } catch {}
    }
  }
  return result;
}
export async function evidence(productId) {
  const product = (await products()).find(p => p.id === productId);
  if (!product) throw new Error('请选择列表中的具体产品型号');
  const factPath = `${product.id}/产品事实.md`;
  let facts = await readFile(await within(knowledgeRoot, factPath), 'utf8');
  const documents = [{ path: factPath, text: facts, kind: 'local', productId: product.id }];
  // 补充卖点与限制，供模型生成更有依据、更克制的正文。
  let extraPath = '';
  try {
    const selling = await readFile(await within(knowledgeRoot, `${product.id}/卖点与限制.md`), 'utf8');
    if (selling.trim()) { facts += '\n\n【卖点与限制】\n' + selling; extraPath = '、卖点与限制.md'; documents.push({ path: `${product.id}/卖点与限制.md`, text: selling, kind: 'local', productId: product.id }); }
  } catch {}
  let images = [];
  try {
    const csv = await readFile(await within(knowledgeRoot, `${product.id}/图片索引.csv`), 'utf8');
    for (const row of parseCsv(csv)) {
      if (row['产品型号'] !== product.name) continue;
      const relative = `${product.id}/images/${row['文件名']}`;
      try { await within(knowledgeRoot, relative); images.push({ name: row['文件名'], model: row['产品型号'], source: row['来源页面'], description: row['官网图片说明'], url: `/api/image?path=${encodeURIComponent(relative)}` }); } catch {}
    }
  } catch {}
  return { product, facts, factPath: factPath + extraPath, documents, images, sourceMode: 'local', sources: [...new Set(facts.match(/https?:\/\/[^\s)]+/g) || [])] };
}
