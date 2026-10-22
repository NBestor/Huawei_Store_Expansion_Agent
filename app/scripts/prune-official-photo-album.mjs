import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { within } from '../lib/local.mjs';
import { HistoryStore } from '../lib/store.mjs';

const root = path.resolve('官网产品照片集');
const manifestPath = path.join(root, '照片索引.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const removed = manifest.filter(image => image.kind === 'background');
const kept = manifest.filter(image => image.kind !== 'background');
for (const image of removed) await unlink(await within(root, image.filename));
await writeFile(manifestPath, `${JSON.stringify(kept, null, 2)}\n`);

const store = new HistoryStore();
try {
  const deletedFromStore = store.removeOfficialImages(removed.map(image => image.sourceUrl));
  console.log(`已删除 ${removed.length} 张无独立产品信息的背景/动画素材；本地图库移除 ${deletedFromStore} 条对应缓存。`);
} finally {
  store.close();
}
