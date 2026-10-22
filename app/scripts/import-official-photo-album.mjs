import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { within } from '../lib/local.mjs';
import { HistoryStore } from '../lib/store.mjs';

const root = fileURLToPath(new URL('../../官网产品照片集/', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../../官网产品照片集/照片索引.json', import.meta.url), 'utf8'));
const store = new HistoryStore();
let imported = 0;
try {
  for (const image of manifest.filter(image => image.autoEligible && image.reviewStatus === '已逐张目视核对')) {
    const source = new URL(image.sourceUrl), page = new URL(image.sourcePage);
    if ([source, page].some(url => url.protocol !== 'https:' || url.hostname !== 'consumer.huawei.com' || url.port || url.username || url.password)) throw new Error('索引包含非官网来源');
    const data = await readFile(await within(root, image.filename));
    const hash = createHash('sha256').update(data).digest('hex');
    if (hash !== image.sha256) throw new Error(`文件已变化，请重新核对：${image.filename}`);
    const id = createHash('sha256').update(`${image.productId}\n${image.sourceUrl}\n${hash}`).digest('hex').slice(0, 32);
    const format = image.filename.split('.').pop().toLowerCase();
    store.saveOfficialImage({ id, productId: image.productId, sourceUrl: image.sourceUrl, sourcePage: image.sourcePage,
      name: image.filename.split('/').pop(), description: `画面已核对：${image.visualDescription}`,
      type: `image/${format === 'jpg' ? 'jpeg' : format}`, data });
    imported++;
  }
  console.log(`已导入或复用 ${imported} 张已核对官网图；历史与旧版本不改写。`);
} finally { store.close(); }
