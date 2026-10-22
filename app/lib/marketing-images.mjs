import { platforms } from './workflow.mjs';
import { distinctOfficialImages } from './knowledge.mjs';
import { reviewedOfficialImage } from './official-photo-index.mjs';

function imageKind(image) {
  if (image.reviewedKind) return image.reviewedKind;
  const text = `${image.sourceUrl || ''} ${image.description || ''}`;
  const filename = (image.sourceUrl || '').split('/').pop();
  if (/[-_](?:kv[0-9]*|hero|key-vision)(?:[_.-])|^(?:kv|hero)[.]/i.test(filename) || /主视觉/.test(image.description || '')) return 'hero';
  if (/color|colour|[-_](?:gold|black|white|green|grey)[.]|配色/i.test(text)) return 'color';
  if (/screen|display|屏幕/i.test(text)) return 'screen';
  if (/keyboard|键盘/i.test(text)) return 'keyboard';
  if (/thin|lightweight|thinness|body|appearance|[-_]id[.]|hinge|外观|轻薄|机身/i.test(text)) return 'design';
  if (/collab|super-device|ecosystem|share|协同/i.test(text)) return 'ecosystem';
  if (/office|study|creat|travel|scene|handwriting|场景/i.test(text)) return 'scene';
  return 'feature';
}

export function chooseOfficialImages(images, task) {
  const desired = platforms[task.platform].count;
  const context = `${task.scene || ''} ${task.audience || ''} ${task.tag?.label || ''}`;
  const score = image => {
    const kind = imageKind(image);
    let value = { hero: 100, scene: 65, design: 50, screen: 45, keyboard: 40, color: 30, ecosystem: 35, feature: 10 }[kind];
    if (/差旅|出差|移动|携带|职场/.test(context) && kind === 'design') value += 30;
    if (/学习|大学|阅读|创作/.test(context) && ['screen', 'keyboard', 'scene'].includes(kind)) value += 25;
    if (task.ecosystemDevices?.length && kind === 'ecosystem') value += 35;
    return value;
  };
  const reviewed = images.map(image => reviewedOfficialImage(image, task.productId)).filter(image => image.autoEligible !== false);
  const sorted = distinctOfficialImages(reviewed).sort((a, b) => score(b) - score(a)), picked = [], usedKinds = new Set();
  for (const image of sorted) {
    if (usedKinds.has(imageKind(image))) continue;
    picked.push(image); usedKinds.add(imageKind(image));
    if (picked.length === desired) break;
  }
  for (const image of sorted) if (picked.length < desired && !picked.includes(image)) picked.push(image);
  const labels = { hero: '官方产品主视觉', color: '官方配色外观', screen: '官方屏幕展示', keyboard: '官方键盘展示', design: '官方机身设计', ecosystem: '官方互联场景展示', scene: '官方使用场景', feature: '官方产品展示' };
  return picked.map(image => ({ ...image, description: image.reviewedDescription ? `画面已核对：${image.reviewedDescription}` : `${labels[imageKind(image)]} · ${image.description}` }));
}
