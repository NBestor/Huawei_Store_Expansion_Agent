import test from 'node:test';
import assert from 'node:assert/strict';
import { contentOf, exportGate, reviewClaims } from '../public/review.js';

const content = { title: '产品标题', body: '有依据的产品描述', cta: '到店体验', tags: '' };
function draft(status = 'verified') {
  return { ...content, images: [{ url: '/image' }], verification: { status, content: { ...content }, claims: status === 'conflict' ? [{ status: 'conflict' }] : [] } };
}
test('warnings allow export but conflicts, errors and stale verification do not', () => {
  assert.equal(exportGate({ draft: draft('verified'), platform: 'moments' }).allowed, true);
  assert.equal(exportGate({ draft: draft('warning'), platform: 'moments' }).allowed, true);
  assert.equal(exportGate({ draft: draft('conflict'), platform: 'moments' }).allowed, false);
  assert.equal(exportGate({ draft: draft('error'), platform: 'moments' }).allowed, false);
  const changed = draft(); changed.body = '修改后但未重核';
  assert.equal(exportGate({ draft: changed, platform: 'moments' }).allowed, false);
});
test('images, empty content, dirty edits and failed image loads remain blocked', () => {
  assert.equal(exportGate({ draft: draft(), platform: 'xiaohongshu' }).allowed, false);
  assert.equal(exportGate({ draft: draft(), platform: 'moments', dirty: true }).allowed, false);
  assert.equal(exportGate({ draft: draft(), platform: 'moments', loaded: ['failed'] }).allowed, false);
  const empty = draft(); empty.title = '';
  assert.equal(exportGate({ draft: empty, platform: 'moments' }).allowed, false);
  assert.deepEqual(contentOf(draft()), content);
});
test('review queue shows only unsupported claims and excludes verified or conflicting claims', () => {
  const report = { claims: [
    { status: 'warning', statement: '没有来源', evidence: [] },
    { status: 'verified', statement: '文档支持', evidence: [{ kind: 'local' }] },
    { status: 'verified', statement: 'ima支持', evidence: [{ kind: 'ima' }] },
    { status: 'verified', statement: '只有网页支持', evidence: [{ kind: 'web' }] },
    { status: 'verified', statement: '网页和文档都支持', evidence: [{ kind: 'web' }, { kind: 'local' }] },
    { status: 'conflict', statement: '与资料冲突', evidence: [] },
  ] };
  assert.deepEqual(reviewClaims(report).map(claim => claim.statement), ['没有来源']);
  assert.equal(report.claims.length, 6, 'display filtering must not mutate the persisted full report');
});
