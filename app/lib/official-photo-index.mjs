import { readFileSync } from 'node:fs';

// This offline registry stores observations, never product-claim evidence.
let reviewedImages = new Map();
try {
  const records = JSON.parse(readFileSync(new URL('../../官网产品照片集/照片索引.json', import.meta.url), 'utf8'));
  reviewedImages = new Map(records.filter(image => image.reviewStatus === '已逐张目视核对').map(image => [`${image.productId}\n${image.sourceUrl}`, image]));
} catch {}

export function reviewedOfficialImage(image, productId) {
  const annotation = reviewedImages.get(`${image.productId || productId}\n${image.sourceUrl}`);
  if (!annotation) return image;
  return { ...image, reviewedKind: annotation.kind, reviewedDescription: annotation.visualDescription,
    description: `画面已核对：${annotation.visualDescription}`, autoEligible: annotation.autoEligible,
    suitableFor: annotation.suitableFor, avoidFor: annotation.avoidFor, reviewStatus: annotation.reviewStatus };
}
