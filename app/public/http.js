const gatewayMessages = {
  502: '网关暂时无法连接应用服务。请稍后检查连接。',
  503: '服务暂时不可用，请稍后再试。',
  504: '网关等待超时，后台任务可能仍在执行。请先查询任务或查看历史作品，勿重复生成。',
};
export async function responseError(response) {
  let data;
  try { if ((response.headers.get('content-type') || '').includes('json')) data = await response.json(); } catch {}
  const safe = typeof data?.error === 'string' && data.error.length <= 600 && !/<\/?[a-z][\s\S]*>/i.test(data.error);
  return Object.assign(new Error(safe ? data.error : gatewayMessages[response.status] || `请求失败（HTTP ${response.status}），请稍后检查服务。`), { status: response.status });
}
export async function request(url, options = {}, transport = fetch) {
  let response;
  try { response = await transport(url, options); }
  catch { throw new Error('网络连接中断。后台任务可能仍在执行，请先查询任务或查看历史作品。'); }
  if (!response.ok) throw await responseError(response);
  if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('服务返回了异常内容，请检查应用和网关连接。');
  try { return await response.json(); }
  catch { throw new Error('服务返回的数据不完整，请稍后查询任务结果。'); }
}
export async function waitForJob(jobId, { read = request, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), onProgress = () => {} } = {}) {
  let failures = 0;
  while (true) {
    let job;
    try { job = await read(`/api/jobs/${jobId}`); failures = 0; }
    catch (error) {
      if (error.status === 404 || error.status === 400 || error.status === 403) throw error;
      if (++failures >= 5) throw Object.assign(new Error('任务状态暂时无法读取，已保留任务编号。恢复连接后点击“继续查询”；无需重新生成。'), { pending: true });
      onProgress('连接暂时中断，正在查询原任务…'); await pause(2000); continue;
    }
    if (job.jobId !== jobId) throw Object.assign(new Error('任务返回编号不一致，已暂停查询。'), { pending: true });
    if (job.status === 'succeeded') return job.result;
    if (job.status === 'failed') throw Object.assign(new Error(job.error || '任务执行失败。'), { status: job.errorStatus });
    if (job.status !== 'running') throw Object.assign(new Error('任务状态异常，已暂停查询。'), { pending: true });
    onProgress('后台正在创作或核验，可等待完成。');
    await pause(2000);
  }
}
