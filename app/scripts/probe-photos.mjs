import { products } from '../lib/local.mjs';
import { officialProductPages, extractOfficialImageUrls } from '../lib/knowledge.mjs';
import { writeFile } from 'node:fs/promises';
const product=(await products())[0];const [page]=await officialProductPages(product);const r=await fetch(page,{signal:AbortSignal.timeout(20000)});const html=await r.text();await writeFile('官网产品照片集/sample-page.html',html);console.log(JSON.stringify({page,status:r.status,bytes:html.length,images:extractOfficialImageUrls(html,page)},null,2));
