export const platforms = {
  xiaohongshu: { name: '小红书', min: 3, max: 6, count: 3, tone: '短段落、场景切入；不虚构个人体验', cta: '你最常用电脑完成什么任务？欢迎留言，或带着常用文件到店体验。' },
  wechat: { name: '公众号', min: 2, max: 4, count: 3, tone: '问题引入、分段展开、说明选择依据', cta: '欢迎预约到店，带上常用文件与外设，验证这套使用流程是否适合你。' },
  moments: { name: '门店朋友圈', min: 1, max: 3, count: 1, tone: '简短直接，聚焦一个体验理由', cta: '想了解具体版本？私信咨询，或预约到店体验。' },
};
export function generate(task, evidence) {
  const platform = platforms[task.platform];
  if (!platform) throw new Error('不支持的平台');
  const { product } = evidence;
  const scene = task.scene.trim(); const audience = task.audience.trim();
  const strategy = { audience, scene, platform: platform.name, angle: `从「${scene}」中的实际任务切入，面向${audience}组织内容`, tone: platform.tone, goal: '引导用户核对具体版本并到店验证', note: '初版规则策略，尚未接入模型进行需求推理。' };
  const title = platform === platforms.moments ? `${product.name}｜带上你的任务来体验` : `${audience}的${scene}：${product.name}该怎么选？`;
  const intro = `面向${audience}，先把「${scene}」里必须完成的任务列清楚，再判断 ${product.name} 是否适合。`;
  const body = platform === platforms.moments
    ? `${intro}\n\n到店时，用自己的常用文件走一遍实际流程，再确认具体销售版本。`
    : `${intro}\n\n先看任务\n你需要使用哪些软件、连接哪些外设，是否经常携带电脑？把这些需求作为选购起点。\n\n再核对版本\n产品资料已在下方列出。系统、配置和功能条件需要以对应型号资料及实际销售版本为准；本草稿暂不自动提取参数，避免将未经结构化核验的数字写入正文。\n\n最后亲自验证\n带上常用文件和计划搭配的设备，到店按「${scene}」的实际顺序体验，确认之后再作选择。`;
  const images = evidence.images.slice(0, platform.count).map((img, i) => ({ ...img, position: i === 0 ? '标题下方' : `正文第 ${i + 1} 段附近` }));
  const checks = [
    { name: '资料来源', status: 'pending', detail: '本地赛事参考资料；尚未通过 ima 获取，不满足正式接入验收。' },
    { name: '产品事实', status: 'pending', detail: '已读取型号原文；本版未实现逐项事实核验，正文不自动加入具体参数。' },
    { name: '图片型号与数量', status: images.length >= platform.min && images.length <= platform.max ? 'pass' : 'pending', detail: `按本地索引精确匹配型号，选用 ${images.length} 张；平台要求 ${platform.min}–${platform.max} 张。未实施图像视觉核验。` },
    { name: '价格与宣传用语', status: 'pass', detail: '规则草稿未加入价格、补贴、库存、实测体验或绝对化宣传；模型语义审核尚未接入。' },
  ];
  return { mode: 'local-rule-draft', label: '本地参考 · 规则草稿（非模型生成）', strategy, title, body, cta: platform.cta, tags: task.platform === 'xiaohongshu' ? '#华为电脑 #电脑选购 #到店体验' : '', images, checks, evidence: { facts: evidence.facts, path: evidence.factPath, sources: evidence.sources }, createdAt: new Date().toISOString() };
}
