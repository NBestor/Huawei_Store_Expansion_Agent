export const platforms = {
  xiaohongshu: { name: '小红书', min: 3, max: 6, count: 3, tone: '华为销售人员面向顾客的种草笔记：亮眼标题、短段落，以场景带出这款电脑的具体亮点和心动理由，结尾邀请咨询或到店体验；不冒充消费者实测', cta: '喜欢这样的电脑搭子？欢迎私信聊聊，或来店里亲手体验。' },
  wechat: { name: '公众号', min: 2, max: 4, count: 3, tone: '华为门店或品牌运营人员面向顾客的产品推荐文章：场景开篇，分段介绍电脑亮点与顾客价值，自然邀请咨询、预约体验；小标题围绕产品亮点，不写选购步骤', cta: '欢迎咨询这款电脑的在售配置，预约到店，开启你的电脑新体验。' },
  moments: { name: '门店朋友圈', min: 1, max: 3, count: 1, tone: '简短直接，聚焦一个体验理由', cta: '想了解具体版本？私信咨询，或预约到店体验。' },
};
export const voiceProfiles = {
  friendly: { label: '明快亲切', guidance: '以亲切活泼的华为销售口吻推荐本款电脑，把亮点转成顾客听得懂的吸引力；不堆感叹号。CTA示例：心动这款电脑？欢迎私信咨询在售配置，或来店里亲手体验！', cta: '心动这款电脑？欢迎私信咨询在售配置，或来店里亲手体验！' },
  warm: { label: '温暖陪伴', guidance: '以体贴从容的华为销售口吻介绍电脑，让推荐贴近顾客的学习和工作日常；自然邀请沟通。CTA示例：期待陪你找到心仪的电脑，欢迎来店里体验，也可以私信聊聊你的需要。', cta: '期待陪你找到心仪的电脑，欢迎来店里体验，也可以私信聊聊你的需要。' },
  professional: { label: '简洁专业', guidance: '以专业销售口吻直接介绍本款电脑的具体亮点和应用价值，参数准确，必要条件就近简短保留。CTA示例：欢迎咨询在售配置与购买信息，预约到店体验这款华为电脑。', cta: '欢迎咨询在售配置与购买信息，预约到店体验这款华为电脑。' },
};
export const salesIdentity = '你为华为门店销售或品牌运营工作人员代拟可直接面向顾客发布的产品宣传成稿。作者站在销售方，读者是潜在顾客；目的为推荐当前这款华为电脑、激发了解和购买兴趣、引导咨询或到店体验。不要把读者当营销员工进行培训。不要写选购指南、攻略、政策教程、核对清单或测评报告；不假装自购用户，不虚构门店活动、优惠、库存、服务承诺或实测经历。电脑是主角，客观事实仍须有依据。';
export function marketingCopyIssues(draft) {
  const issues = [], title = draft.title || '', body = draft.body || '', cta = draft.cta || '';
  if (/攻略|指南|避坑|怎么选|如何选|选购步骤|先.*(?:核对|查清)/.test(title)) issues.push('标题仍是选购或核对指南，应直接突出当前电脑和推荐亮点。');
  if (/先(?:确认|确定|核对|查|看)[^。\n]{0,70}(?:再(?:看|确认|核对)|接着|最后)|建议按.{0,8}步|顺序别反/.test(body)) issues.push('正文出现步骤式选购或政策核对教程，应围绕电脑亮点和顾客价值展开。');
  if (/自然提示|电脑(?:是|为|作为)(?:唯一)?主角|文案结构|创作角度|不能作为事实|来源同时明确覆盖|当前地区、时间、电脑品类|先写电脑|再把政策|仅表示用户需求/.test(body)) issues.push('内部写作指令泄漏到顾客文案，应改写成自然销售表达。');
  if (/SKU|P1(?:事实|资料)|本草稿|结构化核验/.test(body + cta)) issues.push('正文出现内部型号或核验术语，应使用顾客可理解的表达。');
  if (/(?:先|请|建议).{0,35}(?:核对|查).{0,35}(?:再(?:做|作|决定)|细则)/.test(cta)) issues.push('结尾把任务交还顾客，应改为友善邀请咨询或到店体验。');
  return issues;
}
export function generate(task, evidence) {
  const platform = platforms[task.platform];
  if (!platform) throw new Error('不支持的平台');
  const { product } = evidence;
  const scene = task.scene.trim(); const audience = task.audience.trim();
  const voice = voiceProfiles[task.voice] || voiceProfiles.friendly;
  const strategy = { audience, scene, tag: task.tag ? { id: task.tag.id, type: task.tag.type, label: task.tag.label } : null, platform: platform.name, voice: voice.label, angle: `面向${audience}，以「${scene}」带出当前电脑的推荐理由`, tone: platform.tone, goal: '推荐当前电脑，激发兴趣并引导咨询、到店体验', note: '标签只提供创作角度，不代表产品事实；尚未接入模型进行需求推理。' };
  const title = `${product.name}｜让下一段日常，充满期待`;
  const intro = `${product.name}，期待成为${audience}的新电脑搭子。围绕「${scene}」，一起开启新的学习与工作日常。`;
  const body = platform === platforms.moments
    ? `${intro}\n\n新电脑，新期待。欢迎来店里近距离感受这款华为电脑，聊聊你喜欢的配置！`
    : `${intro}\n\n给新日常，一份新期待\n从一堂新课到一个新项目，每次打开电脑，都有值得投入的事。今天为你推荐的，就是这款 ${product.name}。\n\n心动，就来亲手体验\n欢迎来店里看看它的外观，体验日常操作，也可以私信咨询在售配置与购买信息。让我们一起，把心仪的电脑带进你的生活。`;
  const images = evidence.images.slice(0, Math.min(platform.max, Math.max(platform.count, task.officialImageIds?.length || 0))).map((img, i) => ({ ...img, position: i === 0 ? '标题下方' : `正文第 ${i + 1} 段附近` }));
  const checks = [
    { name: '资料来源', status: 'pending', detail: '本地赛事参考资料；尚未通过 ima 获取，不满足正式接入验收。' },
    { name: '产品事实', status: 'pending', detail: '已读取型号原文；本版未实现逐项事实核验，正文不自动加入具体参数。' },
    { name: '图片型号与数量', status: images.length >= platform.min && images.length <= platform.max ? 'pass' : 'pending', detail: `按本地索引精确匹配型号，选用 ${images.length} 张；平台要求 ${platform.min}–${platform.max} 张。未实施图像视觉核验。` },
    { name: '价格与宣传用语', status: 'pass', detail: '规则草稿未加入价格、补贴、库存、实测体验或绝对化宣传；模型语义审核尚未接入。' },
  ];
  return { mode: 'local-rule-draft', label: '本地参考 · 规则草稿（非模型生成）', strategy, title, body, cta: voice.cta, tags: task.platform === 'xiaohongshu' ? '#华为电脑 #电脑推荐 #到店体验' : '', images, imageSelection: evidence.imageSelection, checks, evidence: { facts: evidence.facts, path: evidence.factPath, sources: evidence.sources }, createdAt: new Date().toISOString() };
}
