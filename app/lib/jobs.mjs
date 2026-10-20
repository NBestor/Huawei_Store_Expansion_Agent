import { createHash } from 'node:crypto';
import { problem } from './store.mjs';

// Short HTTP requests observe long work. A repeated submission never repeats the work.
export class Jobs {
  constructor({ now = Date.now, retentionMs = 3600000, maxEntries = 40, maxRunning = 4 } = {}) {
    Object.assign(this, { now, retentionMs, maxEntries, maxRunning });
    this.entries = new Map();
  }
  prune() {
    for (const [id, job] of this.entries) if (job.status !== 'running' && this.now() - job.finishedAt > this.retentionMs) this.entries.delete(id);
  }
  get running() { return [...this.entries.values()].filter(job => job.status === 'running').length; }
  view(job) {
    return { jobId: job.id, status: job.status, ...(job.status === 'succeeded' ? { result: job.result } : {}), ...(job.status === 'failed' ? { error: job.error, errorStatus: job.errorStatus } : {}) };
  }
  get(id) {
    this.prune();
    const job = this.entries.get(id);
    if (!job) throw problem('任务记录已失效或服务已重启。请先查看历史作品，确认结果后再操作，勿直接重复生成。', 404);
    return this.view(job);
  }
  submit(id, key, input, work) {
    if (typeof id !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) throw problem('任务编号无效。');
    this.prune();
    const fingerprint = createHash('sha256').update(JSON.stringify([key, input])).digest('hex');
    const existing = this.entries.get(id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw problem('任务编号已用于其他内容，请勿重复提交。', 409);
      return this.view(existing);
    }
    if ([...this.entries.values()].some(job => job.status === 'running' && job.key === key)) throw problem('这项操作仍在后台执行，请等待完成或查询原任务，勿重复提交。', 429);
    if (this.entries.size >= this.maxEntries || this.running >= this.maxRunning) throw problem('任务较多，请稍后再试。', 429);
    const job = { id, key, fingerprint, status: 'running' };
    this.entries.set(id, job);
    Promise.resolve().then(work).then(result => { job.status = 'succeeded'; job.result = result; }, error => {
      job.status = 'failed'; job.error = error.publicMessage || '任务执行失败，请检查服务连接或输入。';
      job.errorStatus = error.status || (error.publicMessage ? 502 : 400);
    }).finally(() => { job.finishedAt = this.now(); });
    return this.view(job);
  }
}
