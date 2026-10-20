// Editorial defaults for this tool, not publishing-platform limits.
export const editorialProfiles = {
  moments: { min: 180, max: 320, points: 3, structure: '正文分3~4个短段：具体日常场景与本款电脑开场（约50字）；围绕1个主亮点、1个辅助亮点展开顾客关心的理由（约160字）；回扣这次换新的期待（约40字）。不写长篇小标题或参数清单。' },
  xiaohongshu: { min: 650, max: 900, points: 4, structure: '标题突出本款电脑的一个吸引点，避免广告词堆叠。正文：80~110字的人群场景开头并明确推荐本机；3个有吸引力的小标题，每节约160~200字，节内分短段，每节讲一个不同的使用关切；70~100字回扣推荐理由。可以少量emoji，不用连续感叹号，不假装自购测评。' },
  wechat: { min: 1400, max: 2000, points: 6, structure: '写成完整的门店/品牌产品推荐文章：150~200字场景导语，首段点出本机；4个围绕电脑亮点与顾客价值的小标题，每节约270~360字、2~3个自然段，串起工作/学习中的具体时刻；150~200字收束推荐理由。节与节有过渡，不写成提纲、配置表或购买步骤。可用同一有据亮点对应两个不同场景，不虚构新功能。' },
};
export function bodyCharacters(body) { return Array.from((body || '').replace(/\s/gu, '')).length; }
export function editorialReport(platform, draft) {
  const profile = editorialProfiles[platform];
  const characters = bodyCharacters(draft.body);
  return { bodyCharacters: characters, min: profile.min, max: profile.max,
    paragraphs: (draft.body || '').trim().split(/\n\s*\n/u).filter(Boolean).length,
    status: characters < profile.min ? 'below-target' : characters > profile.max ? 'above-target' : 'within-target',
    counting: '仅正文，去除空白，保留标点；不含标题、CTA和标签',
    summary: `正文${characters}字，建议${profile.min}–${profile.max}字（不含标题、引导和标签）` };
}
export function editorialGuidance(platform) {
  const profile = editorialProfiles[platform];
  return { bodyTarget: `${profile.min}–${profile.max}字，按去除空白后的字符计，含标点，不含标题、cta、tags。写作时靠近区间中部。`,
    structure: profile.structure,
    development: '围绕用户所选角度组织整篇推荐，开场就把时机或场景接到本款电脑的吸引力，不把所选主题只当文末提醒。每节从一个具体时刻或顾客关切切入，接上有依据的电脑亮点，解释它与该场景的关系，再用一句有吸引力的推荐收束。场景写成读者可能遇到的日常或期待，不冒充实际测试、用户反馈或能力保证。扩写的是场景、价值解释和段落衔接；不能用重复参数、空泛口号、长免责声明、政策介绍或选购步骤凑字数。普通场景也不能推导出原文没有的性能、软件支持、护眼、续航或兼容结论。事实条件就近简短保留。',
    presentation: '小标题用产品带给日常的吸引点，写自然文本，不加Markdown的##或**。每节只保留1~2组对读者有意义的参数，不把接口协议、全配置、所有尺寸都抄进来；若某个功能需要过多复杂条件，可以换成更容易准确表达的亮点。条件是卖点的一部分，简短贴近该句，不单列“需要提醒的是”“需要说明的是”的风险段。不要写“参数有据可依”“公开列有”“值得放进对比清单”等研究或选购语气。',
    evidenceShortage: '事实不足时可以减少亮点数量，把已支持的亮点讲透；事实准确优先于篇幅，不为凑字数编造。不要在可发布正文中解释证据不足或内部流程。',
    ending: '正文收束推荐理由，具体咨询/到店邀请仅放cta，20~50字，呼应文章亮点；不要在正文再复制一次cta。' };
}
