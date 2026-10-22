import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, knowledgeRoot } from '../lib/local.mjs';
import { visualReview, reviewFor } from './photo-visual-review.mjs';

const root = path.resolve('官网产品照片集');
const manifestPath = path.join(root, '照片索引.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const officialRows = new Map();
for (const productId of new Set(manifest.map(item => item.productId))) {
  try {
    const rows = parseCsv(await readFile(path.join(knowledgeRoot, productId, '图片索引.csv'), 'utf8'));
    for (const row of rows) if (row['原始图片URL']) officialRows.set(row['原始图片URL'], row);
  } catch {}
}

for (const image of manifest) {
  const review = reviewFor(image.product, path.basename(image.filename));
  if (!review) throw new Error(`缺少目视核对记录：${image.product} / ${image.filename}`);
  const source = officialRows.get(image.sourceUrl);
  Object.assign(image, review, {
    officialCaption: source?.['官网图片说明'] || '',
    officialSuggestedUse: source?.['建议用途'] || '',
    sourcePageTitle: image.pageEvidence?.title || image.product,
    evidenceNote: '视觉描述来自人工查看本地原图；官网标注来自对应型号图片索引。界面细字未做 OCR，任何参数、功能与兼容性声明仍须回到官网正文核验。'
  });
}

if (manifest.some(image => !reviewFor(image.product, path.basename(image.filename)))) {
  throw new Error('照片索引包含没有目视核对记录的图片');
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const columns = ['产品型号', '本地文件', '画面类型', '人工画面识别', '官网图片标注', '官网图片alt', '官网所在章节', '适合配文', '不适合表达', '自动配图', '官网建议用途', '官网页面', '原始图片URL', '尺寸', 'SHA-256', '核对状态'];
const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const rows = manifest.map(image => [image.product, image.filename, image.kind, image.visualDescription, image.officialCaption, image.pageEvidence?.imageAlt || '', image.pageEvidence?.precedingHeading || '', image.suitableFor, image.avoidFor, image.autoEligible ? '可参与' : '排除', image.officialSuggestedUse, image.sourcePage, image.sourceUrl, `${image.width}x${image.height}`, image.sha256, image.reviewStatus]);
await writeFile(path.join(root, '照片索引.csv'), `\uFEFF${[columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n')}\r\n`);

const htmlData = JSON.stringify(manifest).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>华为 PC 官方产品照片集</title>
<style>
:root{font-family:system-ui,"Microsoft YaHei",sans-serif;color:#202124;background:#f5f6f7;font-synthesis:none}*{box-sizing:border-box}body{margin:0}header{background:#fff;border-bottom:1px solid #ddd;padding:22px max(20px,calc((100vw - 1440px)/2)) 16px}h1{font-size:24px;margin:0 0 8px;color:#c7000b}header p{margin:0;color:#60646c;font-size:14px}.toolbar{position:sticky;top:0;z-index:2;display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px max(20px,calc((100vw - 1440px)/2));background:#fffffff2;border-bottom:1px solid #ddd}.toolbar select,.toolbar input{height:38px;border:1px solid #c8cbd0;border-radius:4px;padding:0 10px;background:white;font:inherit}.toolbar input{flex:1;min-width:220px}.toolbar label{font-size:13px;display:flex;gap:6px;align-items:center}.count{font-size:13px;color:#555;white-space:nowrap}main{max-width:1440px;margin:auto;padding:18px 20px 50px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:14px}.item{background:white;border:1px solid #e0e1e4;border-radius:5px;overflow:hidden;min-width:0}.item img{width:100%;height:190px;object-fit:contain;background:#f1f2f3;display:block}.info{padding:12px}.line{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.product{font-size:12px;color:#666}.index{font-size:12px;color:#777;white-space:nowrap}.kind{display:inline-block;margin:8px 0 5px;padding:2px 6px;border-radius:3px;background:#fff0f0;color:#a50008;font-size:12px}.desc{font-size:15px;line-height:1.5;font-weight:600;margin:0 0 8px}.caption{font-size:12px;color:#555;line-height:1.5;margin:5px 0}.caption b{color:#34363a}.notes{font-size:12px;color:#565b62;line-height:1.55;border-top:1px solid #eee;padding-top:8px;margin-top:8px}.warning{color:#a34100}.links{display:flex;gap:12px;margin-top:10px;font-size:12px}.links a{color:#b40009;text-decoration:none}.links a:hover{text-decoration:underline}.excluded{opacity:.72}.empty{padding:40px;text-align:center;color:#666;grid-column:1/-1}@media(max-width:560px){header{padding:18px}.toolbar{padding:10px 12px}.toolbar select{flex:1;min-width:130px}main{padding:12px}.grid{grid-template-columns:1fr}.item img{height:220px}}
</style></head><body>
<header><h1>华为 PC 官方产品照片集</h1><p>逐张核对画面，结合型号官网图片索引标注；画面演示用于选图参考，不替代产品事实核验。</p></header>
<section class="toolbar"><select id="product"><option value="">全部型号</option></select><select id="kind"><option value="">全部类型</option></select><input id="search" type="search" placeholder="搜索型号、画面内容或官网标注"><label><input id="eligible" type="checkbox">只看适合自动配图</label><span class="count" id="count"></span></section>
<main><div id="grid" class="grid"></div></main>
<script>
const images=${htmlData};const product=document.querySelector('#product'),kind=document.querySelector('#kind'),search=document.querySelector('#search'),eligible=document.querySelector('#eligible'),grid=document.querySelector('#grid'),count=document.querySelector('#count');
for(const value of [...new Set(images.map(x=>x.product))].sort())product.add(new Option(value,value));
const kinds=[...new Set(images.map(x=>x.kind))].sort();const labels={hero:'主视觉',design:'外观',scene:'使用场景',screen:'屏幕/界面',keyboard:'键盘',ecosystem:'生态协同',color:'配色',feature:'产品展示',component:'部件/结构',accessory:'配件',certificate:'证书',background:'背景/动画素材'};for(const value of kinds)kind.add(new Option(labels[value]||value,value));
const escape=value=>String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function render(){const q=search.value.trim().toLowerCase();const rows=images.filter(x=>(!product.value||x.product===product.value)&&(!kind.value||x.kind===kind.value)&&(!eligible.checked||x.autoEligible)&&(!q||[x.product,x.visualDescription,x.officialCaption,x.officialSuggestedUse,x.pageEvidence?.imageAlt,x.pageEvidence?.precedingHeading,x.filename].join(' ').toLowerCase().includes(q)));count.textContent='显示 '+rows.length+' / '+images.length+' 张';grid.innerHTML=rows.length?rows.map(x=>'<article class="item '+(x.autoEligible?'':'excluded')+'"><a href="'+escape(x.filename)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+escape(x.filename)+'" alt="'+escape(x.visualDescription)+'"></a><div class="info"><div class="line"><span class="product">'+escape(x.product)+'</span><span class="index">'+escape(x.width+' × '+x.height)+'</span></div><span class="kind">'+escape(labels[x.kind]||x.kind)+(x.autoEligible?' · 可用于配图':' · 已排除自动配图')+'</span><p class="desc">'+escape(x.visualDescription)+'</p><p class="caption"><b>官网标注：</b>'+escape(x.officialCaption||'官网图片索引无单图说明')+'</p><p class="caption"><b>官网页面：</b>'+escape(x.pageEvidence?.title||x.product)+(x.pageEvidence?.imageAlt?' · alt：'+escape(x.pageEvidence.imageAlt):'')+(x.pageEvidence?.precedingHeading?' · 所在章节：'+escape(x.pageEvidence.precedingHeading):'')+'</p><div class="notes"><div><b>适用：</b>'+escape(x.suitableFor)+'</div><div class="warning"><b>避免：</b>'+escape(x.avoidFor)+'</div></div><div class="links"><a href="'+escape(x.sourcePage)+'" target="_blank" rel="noopener">官网产品页 ↗</a><a href="'+escape(x.sourceUrl)+'" target="_blank" rel="noopener">原始图片 ↗</a></div></div></article>').join(''):'<div class="empty">没有符合筛选条件的照片</div>'}for(const control of [product,kind,search,eligible])control.addEventListener('input',render);render();
</script></body></html>`;
await writeFile(path.join(root, 'index.html'), page);
await writeFile(path.join(root, 'README.md'), `# 华为 PC 官方产品照片集\n\n共 ${manifest.length} 张图片，覆盖 ${new Set(manifest.map(image => image.product)).size} 个型号。打开 index.html 可离线浏览，并按型号、画面类型、关键词筛选。\n\n- 照片索引.csv：适用于 Excel 的可筛选索引。\n- 照片索引.json：结构化索引，可供工具读取。\n- 型号子目录：华为消费者业务官网原图。\n- 每条记录分列保存人工目视描述和官网图片索引标注。\n- 浅色遮罩、空白屏幕、纯壁纸和其他背景动画素材已从照片集移除；结构拆件、证书和配件图保留作核对记录，但不会参与自动配图。屏幕、协同演示只可作画面说明，不能单独证明参数、功能范围、兼容性或随机配件；事实需回到官网正文核验。\n- 细小界面文字未做 OCR 确认；人工画面描述仅覆盖整体场景。\n- 来源为华为消费者业务官网的精确型号产品页及该型号图片索引。图片仅供内部选图核对，发布和授权请遵守官网与品牌素材规范。\n`);
console.log(`目视核对完成：${manifest.length} 张，${new Set(manifest.map(image => image.product)).size} 个型号；可自动配图 ${manifest.filter(image => image.autoEligible).length} 张，排除 ${manifest.filter(image => !image.autoEligible).length} 张。`);
