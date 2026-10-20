import { dependency } from './dependencies.mjs';
import { reviewClaims } from '../public/review.js';
import { failure } from './config.mjs';

const width = 595.28, height = 841.89, margin = 44, bottom = 786;
const xml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const platformNames = { moments: '门店朋友圈', xiaohongshu: '小红书', wechat: '公众号' };

// Text is composed at 2.5x resolution so Chinese typography is portable without a font download.
// Photos remain separate embedded image objects at their original aspect ratio.
export async function renderPlanPdf(session, images, exportedAt) {
  const { PDFDocument } = dependency('pdf-lib'), sharp = dependency('sharp');
  const pdf = await PDFDocument.create(), draft = session.snapshot.draft, task = session.task;
  pdf.setTitle(draft.title); pdf.setAuthor('PC STUDIO'); pdf.setSubject('华为 PC 图文方案');
  pdf.setCreationDate(new Date(exportedAt));
  const pages = []; let sheet, y;
  function page(label) {
    sheet = { svg: [], photos: [], links: [] }; pages.push(sheet); y = 91;
    sheet.svg.push('<rect width="596" height="842" fill="#ffffff"/>',
      '<rect x="0" y="0" width="596" height="57" fill="#111214"/>',
      '<text x="44" y="35" fill="#c9f66f" font-size="15" font-weight="700">PC STUDIO</text>',
      `<text x="551" y="34" fill="#ced0d2" font-size="9" text-anchor="end">${xml(label)}</text>`);
  }
  function ensure(space) { if (y + space > bottom) page('图文创作方案'); }
  function lines(value, size, maxWidth = width - 2 * margin) {
    const result = [];
    for (const paragraph of String(value || '').replace(/\r/g, '').split('\n')) {
      let current = '', units = 0;
      for (const char of paragraph) {
        const unit = /[\x20-\x7e]/.test(char) ? (/[ilI.,:;'|!]/.test(char) ? .32 : /[MW@#%]/.test(char) ? .9 : .62) : 1.04;
        if (current && (units + unit) * size > maxWidth) { result.push(current); current = ''; units = 0; }
        current += char; units += unit;
      }
      result.push(current);
    }
    return result;
  }
  function paragraph(value, size = 11, color = '#303438', options = {}) {
    const leading = size * (options.leading || 1.8);
    for (const line of lines(value, size, options.width)) {
      ensure(leading);
      sheet.svg.push(`<text x="${options.x || margin}" y="${y + size}" fill="${color}" font-size="${size}"${options.bold ? ' font-weight="700"' : ''}>${xml(line)}</text>`);
      y += leading;
    }
    y += options.after ?? 8;
  }
  function heading(value) { ensure(70); y += 12; paragraph(value, 18, '#111214', { bold: true, after: 16 }); }
  async function photo(item, maxHeight = 260) {
    ensure(100);
    let png;
    try { png = await sharp(item.buffer, { limitInputPixels: 60000000 }).rotate().resize({ width: 1500, height: 1100, fit: 'inside', withoutEnlargement: true }).png().toBuffer(); }
    catch { throw failure('有配图无法排入PDF，请检查图片文件后重试。'); }
    const embedded = await pdf.embedPng(png), scale = Math.min((width - 2 * margin) / embedded.width, maxHeight / embedded.height);
    const w = embedded.width * scale, h = embedded.height * scale;
    if (y + h + 72 > bottom) page('产品影像 / VISUAL STORY');
    sheet.svg.push(`<rect x="44" y="${y}" width="${width - 88}" height="${h}" rx="8" fill="#f3f4f1"/>`);
    sheet.photos.push({ embedded, x: (width - w) / 2, y: height - y - h, width: w, height: h }); y += h + 12;
  }
  function link(value) {
    let url; try { url = new URL(value); } catch { paragraph(value, 9, '#70766d'); return; }
    if (!['https:', 'http:'].includes(url.protocol)) return;
    for (const line of lines(url.href, 8)) {
      ensure(16); sheet.links.push({ url: url.href, y }); paragraph(line, 8, '#5e7250', { after: 0 });
    }
    y += 8;
  }
  page('营销图文方案 / CREATIVE PLAN');
  paragraph(`${platformNames[task.platform] || task.platform}  /  V${session.version}`, 10, '#66804e', { bold: true });
  paragraph(draft.title, 25, '#111214', { bold: true, leading: 1.45, after: 19 });
  paragraph(draft.label, 10, '#70766d');
  if (images[0]) await photo(images[0], 270);
  paragraph(draft.product?.name || session.snapshot.source.product.name, 15, '#111214', { bold: true });
  paragraph(`目标人群：${task.audience}\n创作场景：${task.scene}`, 11);
  paragraph(`导出时间：${new Date(exportedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）`, 9, '#70766d');
  page('发布文案 / COPY');
  heading(draft.title); paragraph(draft.body, 12, '#303438', { leading: 1.95, after: 18 });
  if (draft.cta) paragraph(draft.cta, 11, '#4d6340', { bold: true });
  if (draft.tags) paragraph(draft.tags, 10, '#6a8056');
  for (let i = 0; i < images.length; i++) {
    page(`配图 ${i + 1} / ${images.length}`);
    heading(images[i].position || `配图 ${i + 1}`); await photo(images[i], 405);
    paragraph(images[i].description || images[i].name, 12, '#303438');
    paragraph(`文件：${images[i].name}`, 9, '#70766d');
    paragraph('图片来源', 10, '#111214', { bold: true }); link(images[i].source);
  }
  page('创作策略与来源 / SOURCES');
  heading('这一次表达的方向');
  paragraph([draft.strategy?.angle, draft.strategy?.tone].filter(Boolean).join('\n'));
  heading('资料与接入方式');
  paragraph(task.mode === 'ima' ? '本地赛事 P1 文档 + ima 共享知识库；ima 原文和图片通过官方 OpenAPI 获取。' : '本次使用本地赛事参考资料，未调用 ima。工作台另提供 ima OpenAPI 接入；因访问次数有限，日常测试推荐本地模式。');
  if (draft.imageSelection) paragraph(`配图来源：${draft.imageSelection.summary}；官网 ${draft.imageSelection.officialCount} 张，已有素材 ${draft.imageSelection.fallbackCount} 张。`);
  const docs = draft.evidence?.documents || [];
  for (const doc of docs) {
    ensure(65); paragraph(({ local: '本地文档', ima: 'ima 知识库', web: '华为商城网页' }[doc.kind] || '资料') + (doc.fetchedAt ? ` · ${doc.fetchedAt}` : ''), 9, '#70766d');
    link(doc.path);
  }
  const queue = reviewClaims(draft.verification);
  if (queue.length) {
    heading('待人工确认的表述');
    for (const claim of queue) {
      ensure(70); paragraph(claim.statement, 11, '#303438', { bold: true }); paragraph(claim.explanation, 10);
      if (!claim.evidence?.length) paragraph('没有找到可引用的相关依据。', 9, '#70766d');
      for (const cite of claim.evidence || []) { paragraph(`相关原文：${cite.quote}`, 9, '#70766d'); link(cite.path); }
    }
  }
  paragraph('核验与引用的完整快照保存在工作台历史会话中。图片按型号目录匹配，未进行视觉语义核验。', 9, '#70766d');
  paragraph(`会话 ${session.id} / V${session.version}`, 8, '#8d9389');

  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    item.svg.push('<path d="M44 798H551" stroke="#e0e3dc"/>', `<text x="44" y="817" font-size="8" fill="#8d9389">PC STUDIO · 华为 PC 图文方案</text><text x="551" y="817" font-size="8" fill="#8d9389" text-anchor="end">${i + 1} / ${pages.length}</text>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Noto Sans SC, Microsoft YaHei, PingFang SC, Noto Sans CJK SC, WenQuanYi Micro Hei, sans-serif">${item.svg.join('')}</svg>`;
    const png = await sharp(Buffer.from(svg), { density: 180 }).png().toBuffer();
    const background = await pdf.embedPng(png), output = pdf.addPage([width, height]);
    output.drawImage(background, { x: 0, y: 0, width, height });
    for (const { embedded, ...placement } of item.photos) output.drawImage(embedded, placement);
    for (const cite of item.links) {
      const annotation = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [margin, height - cite.y - 16, width - margin, height - cite.y], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: requirePdfString(cite.url) } }));
      output.node.addAnnot(annotation);
    }
  }
  return Buffer.from(await pdf.save());
}
function requirePdfString(value) { return dependency('pdf-lib').PDFString.of(value); }
