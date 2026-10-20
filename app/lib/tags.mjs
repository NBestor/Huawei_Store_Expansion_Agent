const categories = [
  { id: 'phone', label: '手机', available: false }, { id: 'wearable', label: '穿戴', available: false },
  { id: 'computer', label: '电脑', available: true }, { id: 'tablet', label: '平板', available: false },
  { id: 'smart_screen', label: '智慧屏', available: false }, { id: 'audio', label: '耳机', available: false },
  { id: 'speaker', label: '音箱', available: false }, { id: 'whole_home', label: '全屋智能', available: false },
  { id: 'router', label: '路由器', available: false }, { id: 'os', label: '操作系统', available: false },
];

const audiences = [
  { id: 'aud-student', label: '学生', categories: ['phone', 'wearable', 'computer', 'tablet', 'audio', 'router', 'os'] },
  { id: 'aud-parent', label: '家长/照护者', categories: ['phone', 'wearable', 'tablet', 'smart_screen', 'speaker', 'whole_home', 'router'] },
  { id: 'aud-child', label: '儿童/青少年', categories: ['phone', 'wearable', 'tablet', 'smart_screen', 'speaker', 'os'] },
  { id: 'aud-senior', label: '长辈', categories: ['phone', 'wearable', 'tablet', 'smart_screen', 'speaker', 'whole_home', 'router'] },
  { id: 'aud-office', label: '职场人士', categories: ['phone', 'wearable', 'computer', 'tablet', 'audio', 'router', 'os'] },
  { id: 'aud-creator', label: '内容创作者', categories: ['phone', 'computer', 'tablet', 'audio', 'speaker', 'os'] },
  { id: 'aud-gamer', label: '游戏玩家', categories: ['phone', 'computer', 'tablet', 'audio', 'router', 'os'] },
  { id: 'aud-sport', label: '运动爱好者', categories: ['phone', 'wearable', 'audio'] },
  { id: 'aud-traveler', label: '旅行/差旅人群', categories: ['phone', 'wearable', 'computer', 'tablet', 'audio', 'router', 'os'] },
  { id: 'aud-family', label: '家庭/多成员共用', categories: ['phone', 'wearable', 'tablet', 'smart_screen', 'audio', 'speaker', 'whole_home', 'router', 'os'] },
  { id: 'aud-accessibility', label: '有无障碍需求的用户', categories: categories.map(x => x.id) },
  { id: 'aud-homeowner', label: '家庭空间管理者', categories: ['phone', 'smart_screen', 'speaker', 'whole_home', 'router'] },
];

function scene(id, category, label, audiences, needs, angle, guardrails, priority = 5, aliases = []) {
  return { id, type: 'category', label, categories: [category], audiences, needs, scenarios: needs, angle, aliases,
    guardrails: [guardrails], origin: 'preset', status: 'draft', priority, weight: 1, related: [], effective: { period: null, region: null } };
}
const categoryTags = [
  scene('phone-travel', 'phone', '旅行随拍', ['旅行者', '家庭', '创作者'], ['拍摄', '导航', '行程沟通'], '按出发前、路上、回程整理旅途记录。', '影像、防护、定位和续航须按型号核验。', 8, ['旅游', '出游']),
  scene('phone-commute', 'phone', '通勤随身', ['职场人士', '学生'], ['消息', '支付', '通勤影音'], '从早晚通勤中的高频操作切入。', '网络、支付、续航与重量以型号资料为准。', 6),
  scene('phone-creation', 'phone', '随手创作', ['创作者', '学生'], ['记录灵感', '拍摄短内容', '快速编辑'], '从灵感出现到发布前整理展开。', '相机、格式、编辑能力与第三方应用分别核验。', 7),
  scene('phone-senior-ease', 'phone', '长辈易用', ['长辈及家人'], ['字体', '音量', '联系人', '简化操作'], '以首次设置和日常联系为内容主线。', '可用设置以系统版本和型号为准，不称零学习成本。', 8),
  scene('phone-child-connect', 'phone', '亲子联络', ['家长', '儿童家庭'], ['联系', '家庭协作'], '围绕家庭沟通习惯而非追踪监控展开。', '儿童适龄、隐私和安全功能须核实。', 6),
  scene('phone-game', 'phone', '移动游戏', ['游戏玩家'], ['游戏娱乐', '语音', '操控'], '先明确游戏和使用时长，再讨论体验。', '性能、散热、电池和兼容性不得推断。', 7),
  scene('phone-new-device', 'phone', '换机迁移', ['换机用户', '家庭用户'], ['资料迁移', '账号登录'], '从换机前准备到恢复常用工作流。', '迁移范围、跨系统能力与隐私处理按官方说明。', 7),
  scene('wearable-running', 'wearable', '跑步训练', ['跑者', '运动爱好者'], ['训练记录', '过程查看', '训练复盘'], '记录训练前设定、过程中查看和训练后复盘。', '运动模式、定位、数据精度和手机依赖须核验。', 8),
  scene('wearable-senior-health', 'wearable', '长辈健康关注', ['长辈及家属'], ['活动记录', '日常指标查看', '家庭联络'], '讲家庭如何共同建立日常使用习惯。', '不作医疗诊断或救援承诺；监测项目按型号核验。', 9),
  scene('wearable-child-safety', 'wearable', '儿童安全联络', ['家长', '儿童'], ['联系', '位置设置', '日常管理'], '以家长和孩子共同约定为前提。', '定位、通话、网络套餐、隐私与适龄信息须核实。', 9),
  scene('wearable-fitness', 'wearable', '健身记录', ['健身人群'], ['训练过程记录', '活动回顾'], '围绕坚持记录而不是效果承诺展开。', '运动数据不等同于专业评估或医疗建议。', 7),
  scene('wearable-cycling', 'wearable', '骑行记录', ['通勤骑行者', '运动爱好者'], ['路线', '训练回顾'], '把设备操作放在安全停车或出发前后。', '传感器、导航、联动和运动模式须核验。', 6),
  scene('wearable-swim', 'wearable', '游泳与防水运动', ['游泳者'], ['游泳记录', '水中使用'], '先明确泳池/开放水域与活动类型。', '防水等级不代表任意水域适用，按厂商限制判断。', 6),
  scene('wearable-sleep', 'wearable', '睡眠与恢复', ['关注睡眠人群'], ['睡眠记录', '作息回顾'], '分享规律作息的自我观察方式。', '数据仅供参考，不宣称改善或治疗睡眠。', 6),
  scene('computer-campus', 'computer', '校园学习', ['大学生', '研究生'], ['课程资料', '论文', '网课', '多任务'], '以新学期拥有一台心仪电脑的期待开场，用本款电脑有据可查的亮点打动上课、写论文和校园随行的人群。', '性能、重量、续航、软件兼容按具体 SKU 核验。', 9, ['开学', '学习']),
  scene('computer-office', 'computer', '日常办公', ['职场人士', '小团队'], ['文档', '表格', '会议', '邮件'], '抓住文档、会议与多任务办公的日常关切，突出本款电脑值得带进工作日的亮点，激发换新兴趣。', '软件、接口和系统兼容性按型号/版本验证。', 8, ['工作', '办公']),
  scene('computer-travel-work', 'computer', '差旅办公', ['出差人士', '顾问', '销售'], ['途中整理', '会议', '轻量处理'], '从出差也想带上一台合心意电脑切入，用本款电脑已核实的便携与办公亮点吸引经常奔波的顾客。', '重量、续航、网络与安全限制需有依据。', 7, ['出差', '旅游']),
  scene('computer-creator', 'computer', '图文内容创作', ['设计师', '编辑', '自媒体'], ['写作', '修图', '排版', '多窗口'], '以把灵感变成作品的期待推荐本款电脑，用已核实的屏幕、操作或配置亮点打动图文创作者。', '屏幕、软件与性能按配置及软件要求核验。', 8, ['创作']),
  scene('computer-video', 'computer', '视频剪辑', ['视频创作者', '学生'], ['素材整理', '剪辑', '导出'], '抓住视频创作者对新装备的期待，围绕本款电脑有依据的亮点讲清推荐理由，吸引顾客体验。', '格式、分辨率和速度只依据具体配置/实测。', 7),
  scene('computer-development', 'computer', '编程开发', ['开发者', '计算机学生'], ['IDE', '终端', '协作', '多任务'], '面向写代码与做项目的人群推荐本款电脑，把已核实的配置和操作亮点转成工作学习中的吸引力。', 'CPU、内存、虚拟化和工具链须逐项核验。', 7),
  scene('computer-gaming', 'computer', 'PC 游戏', ['游戏玩家'], ['游戏运行', '外设', '语音'], '借学习工作之余的游戏期待推荐本款电脑，仅围绕已核实的游戏适配与产品亮点展开，不夸大性能。', '兼容、帧率、散热与图形性能需要对应证据。', 7, ['游戏']),
  scene('computer-exam', 'computer', '考试备考', ['考研/考公/资格考试人群'], ['网课', '资料整理', '复习计划'], '从陪伴备考每一天的电脑搭子切入，以本款电脑已核实的学习相关亮点打动备考人群，不承诺提分。', '不暗示设备提升成绩；考试软件要求查主办方。', 6),
  scene('computer-small-business', 'computer', '门店与小微经营', ['商家', '工作室', '创业团队'], ['台账', '订单', '客户资料'], '面向门店经营者和创业团队推荐本款电脑，用有依据的办公亮点呼应日常经营，吸引咨询体验。', '收银、税务、财务应用及外设须实测/核验。', 6),
  scene('tablet-reading', 'tablet', '随身阅读', ['学生', '通勤者', '长辈'], ['教材', '文档', '电子书'], '从碎片时间阅读与资料标记切入。', '屏幕、阅读软件和格式支持须核验。', 7),
  scene('tablet-notes', 'tablet', '手写笔记', ['学生', '会议参与者'], ['课堂记录', '会议批注', '思路整理'], '展示记录、整理、回看的完整过程。', '手写笔、应用和配件兼容按型号核验。', 8),
  scene('tablet-light-office', 'tablet', '轻办公', ['移动办公者'], ['邮件', '文档批注', '会议'], '明确哪些任务适合平板，哪些仍需电脑。', '键盘、软件、桌面模式和格式兼容须核验。', 7),
  scene('tablet-drawing', 'tablet', '绘画创作', ['插画师', '学生', '爱好者'], ['绘图', '草图', '灵感记录'], '从构思到成稿的创作流程展开。', '压感笔、应用和色彩能力按设备/应用核验。', 7),
  scene('tablet-family', 'tablet', '亲子共用', ['家庭', '儿童家长'], ['阅读', '学习', '家庭娱乐'], '从家长与孩子共同使用的约定切入。', '儿童模式、内容过滤和适龄能力具体核验。', 6),
  scene('screen-family-movie', 'smart_screen', '家庭观影', ['家庭', '影音爱好者'], ['共享影音', '客厅娱乐'], '以家庭共同选择内容的场景切入。', '分辨率、音效、平台、版权和会员分别核验。', 8),
  scene('screen-video-call', 'smart_screen', '家庭视频沟通', ['异地家庭', '长辈家庭'], ['大屏通话', '家庭联系'], '讲节日或日常联络体验。', '摄像头、应用、隐私开关和网络条件须核验。', 7),
  scene('screen-learning', 'smart_screen', '亲子学习', ['家长', '儿童'], ['课程观看', '家庭学习'], '围绕共同学习时段和观看距离展开。', '内容、适龄及健康表述依据官方说明。', 6),
  scene('screen-home-control', 'smart_screen', '客厅中控', ['家庭空间管理者'], ['兼容设备查看/控制'], '讲客厅作为家庭交互入口的具体任务。', '只描述已确认接入的设备及功能。', 6),
  scene('audio-commute', 'audio', '通勤聆听', ['职场人士', '学生'], ['音乐', '播客', '通话'], '从通勤中的个人聆听习惯切入。', '降噪、续航、防护和通话效果按型号核验。', 7),
  scene('audio-focus', 'audio', '专注学习/工作', ['学生', '职场人士'], ['专注音频', '环境干扰管理'], '讲如何组织专注时段。', '不承诺隔绝所有噪声或提升成绩/效率。', 8),
  scene('audio-meeting', 'audio', '会议通话', ['差旅人士', '职场人士'], ['线上会议', '电话'], '从临时会议和设备切换展开。', '麦克风、会议软件和切换兼容须核验。', 7),
  scene('audio-sport', 'audio', '运动聆听', ['跑步者', '健身人群'], ['训练音乐', '运动佩戴'], '按室内/户外运动区分使用体验。', '佩戴安全、防水与运动适用性按型号核验。', 6),
  scene('audio-gaming', 'audio', '游戏语音与音画同步', ['游戏玩家'], ['联机语音', '影音同步'], '先区分平台、连接方式与应用。', '延迟、麦克风和主机/PC兼容须核验。', 6),
  scene('speaker-family-music', 'speaker', '家庭共享音乐', ['家庭', '音乐爱好者'], ['背景音乐', '家庭聚会'], '以家庭共同听歌或聚会为主题。', '音质、流媒体服务和账号地区限制须核验。', 7),
  scene('speaker-voice-assistant', 'speaker', '语音交互', ['家庭', '长辈'], ['语音问询', '兼容设备控制'], '从免手操作的小任务切入。', '语种、服务、联网和兼容范围须核验。', 7),
  scene('speaker-cooking', 'speaker', '厨房陪伴', ['家庭', '独居用户'], ['计时', '音频', '免手操作'], '讲做饭时可执行的免手任务。', '防水、防油烟及语音功能不可由品类推断。', 5),
  scene('home-lighting', 'whole_home', '照明与回家场景', ['家庭空间管理者'], ['照明控制', '场景联动'], '从回家、休息等具体时段梳理控制需求。', '设备协议、型号、安装及自动化条件须核验。', 8),
  scene('home-security', 'whole_home', '家庭安防与看护', ['家庭', '照护者'], ['状态提醒', '家庭设备管理'], '先列清楚需要提醒的事件和响应人。', '不承诺绝对安全；传感器能力、隐私与响应条件核验。', 6),
  scene('home-energy', 'whole_home', '家居联动与能耗管理', ['家庭空间管理者'], ['设备联动', '使用习惯'], '从家庭设备清单和日常习惯开始规划。', '节能效果、设备兼容及自动化条件需实证。', 6),
  scene('router-coverage', 'router', '家庭网络覆盖', ['多成员家庭', '远程办公者'], ['房间覆盖', '设备接入'], '从户型、宽带和常用位置排查网络需求。', '覆盖与速率受户型、干扰、套餐和终端影响。', 8),
  scene('router-gaming', 'router', '游戏与低延迟网络', ['游戏玩家'], ['联机稳定', '多设备并发'], '先确认游戏平台、接入方式和网络现状。', '不保证降低延迟；规格、线路和环境共同影响。', 7),
  scene('router-home-office', 'router', '居家办公网络', ['远程办公者', '学生'], ['视频会议', '文件传输', '多人并发'], '按会议、上传和家庭并发任务描述网络。', '带宽、覆盖和稳定性不能只由路由器型号决定。', 7),
  scene('os-device-collaboration', 'os', '跨设备协同', ['职场人士', '学生', '创作者'], ['文件流转', '多设备接续'], '从一个真实任务的设备切换流程切入。', '参与设备、系统版本、账号和应用须逐项核验。', 8),
  scene('os-accessibility', 'os', '系统辅助功能', ['有无障碍需求的用户', '长辈'], ['阅读', '听觉提示', '简化操作'], '围绕一个可复现的辅助设置展开。', '功能支持按版本、语言和应用核验，不泛化适配。', 7),
  scene('os-privacy', 'os', '隐私与权限设置', ['全体用户'], ['应用权限', '账号安全'], '分享可复现的检查路径和设置选择。', '不承诺绝对安全；功能边界按系统版本核验。', 7),
  scene('phone-portrait', 'phone', '人像与家庭影像', ['家庭', '摄影爱好者'], ['合影', '聚会', '日常记录'], '按拍摄任务讲取景、整理与分享。', '人像、变焦和修图能力不能由产品定位推断。', 6),
  scene('phone-battery-routine', 'phone', '日常续航与充电习惯', ['通勤者', '旅行者'], ['一天使用安排', '途中补电'], '用一天的使用节奏解释选购需求。', '电池、充电协议、配件和测试条件逐一核验。', 5),
  scene('phone-accessible', 'phone', '手机辅助操作', ['有无障碍需求者', '家属'], ['阅读', '听觉提示', '语音/触控辅助'], '围绕一个可复现操作展开。', '不保证适合所有需求，按系统版本核验。', 5),
  scene('wearable-outdoor', 'wearable', '徒步与户外活动', ['徒步者', '骑行者', '露营人群'], ['活动记录', '定位辅助', '状态查看'], '从轻装出门的准备清单切入。', '防护、定位和紧急能力按型号与环境核验。', 6),
  scene('wearable-independent-use', 'wearable', '轻装出门与独立使用', ['跑者', '通勤者', '家长'], ['联系', '提醒', '不常拿手机时的任务'], '说明离开手机后哪些任务仍可完成。', '通信、配对、账号、支付和网络条件须核验。', 5),
  scene('computer-job-search', 'computer', '求职与实习', ['学生', '求职者', '实习生'], ['简历', '网申', '面试', '作品集'], '以迈入职场、迎接新机会的期待推荐本款电脑，让已核实的产品亮点呼应简历、作品集与面试场景。', '摄像头、麦克风和会议兼容须核验。', 7),
  scene('computer-remote', 'computer', '居家与远程办公', ['远程员工', '自由职业者'], ['长时间工作', '沟通', '资料协同'], '以在家也值得拥有心仪工作搭子切入，突出本款电脑与居家办公相关的已核实亮点，邀请顾客体验。', '不承诺效率提升；外设和网络条件单独说明。', 6),
  scene('computer-engineering', 'computer', '工程与专业课程', ['工科学生', '工程从业者'], ['CAD', '仿真', '建模', '专业软件'], '面向专业课程与工程任务的人群推荐本款电脑，突出证据支持的配置或适配优势，不展开软件安装教程。', '不能凭性能定位认定兼容；认证与版本逐项核实。', 6),
  scene('computer-multi-screen', 'computer', '桌面多屏工作', ['职场人士', '创作者'], ['外接显示器', '键鼠', '会议设备'], '以打造心仪桌面工作区的期待推荐本款电脑，用已核实的屏幕与连接亮点吸引办公和创作人群。', '接口、分辨率、刷新率、供电和驱动须核验。', 5),
  scene('tablet-travel', 'tablet', '旅途影音与行程资料', ['旅行者', '家庭'], ['阅读', '影音', '行程资料'], '从候机或车程中的个人使用场景切入。', '续航、离线资源和内容版权分别核验。', 6),
  scene('tablet-senior', 'tablet', '长辈大屏易读', ['长辈', '家属'], ['视频沟通', '阅读', '照片查看'], '讲字体、摆放和常用联系人的设置过程。', '易用设置和通信条件按设备/版本核验。', 6),
  scene('tablet-exam', 'tablet', '备考资料整理', ['备考人群', '学生'], ['PDF', '笔记', '错题', '网课'], '按阅读、批注、复盘讲完整流程。', '格式、软件订阅和手写配件分开核验。', 5),
  scene('screen-exercise', 'smart_screen', '居家运动', ['家庭', '运动人群'], ['跟练', '动作观看'], '结合家庭空间与实际运动安排。', '运动内容和识别能力不得泛化，不替代专业建议。', 5),
  scene('screen-gaming', 'smart_screen', '大屏游戏与设备连接', ['游戏玩家', '家庭'], ['主机/电脑连接', '家庭娱乐'], '先确认游戏平台与连接需求。', '接口、输入延迟、刷新率和游戏模式按型号核验。', 5),
  scene('screen-casting', 'smart_screen', '投屏与多设备分享', ['家庭', '职场人士'], ['手机投屏', '内容分享'], '从一次可复现的连接过程讲解。', '版权限制、投屏协议和应用兼容须核验。', 5),
  scene('audio-travel', 'audio', '旅途影音', ['旅行者'], ['铁路/飞行影音', '个人聆听'], '从长途出行的娱乐准备切入。', '航空规则、降噪、续航和有线能力须核验。', 5),
  scene('audio-creator', 'audio', '内容监听与返听', ['播客/视频创作者'], ['录音监听', '剪辑回听'], '讲素材检查和返听环节。', '不把消费耳机等同于专业监听设备。', 5),
  scene('speaker-family-video', 'speaker', '家庭语音与日常提醒', ['家庭', '长辈'], ['语音问询', '提醒', '兼容设备控制'], '从家中一个小型免手操作任务切入。', '语种、服务、网络和设备兼容范围须核验。', 6),
  scene('home-new-residence', 'whole_home', '新居与设备规划', ['新居用户', '家庭空间管理者'], ['空间规划', '设备兼容', '安装'], '先列空间、网络和现有设备，再确定自动化需求。', '协议、型号、安装和服务范围逐项核验。', 7),
  scene('home-pet', 'whole_home', '宠物家庭居家管理', ['宠物家庭'], ['设备管理', '居家记录'], '围绕居家习惯和设备管理展开。', '不暗示未认证产品可监测或保障宠物安全健康。', 4),
  scene('router-dorm', 'router', '宿舍与合租网络', ['学生', '合租人群'], ['多人接入', '学习与娱乐'], '从宿舍/合租的网络规则和设备数量开始。', '校园网政策、终端限制和覆盖情况需现场确认。', 6),
  scene('router-small-business', 'router', '门店与小微网络', ['商家', '小团队'], ['收银/办公接入', '访客网络'], '先梳理网络用途、终端数量与管理需求。', '商用功能、隔离能力、带宽和安全策略逐项核验。', 5),
  scene('os-device-migration', 'os', '系统迁移与换机准备', ['换机用户', '家庭用户'], ['备份', '账号', '应用恢复'], '从换机前备份到恢复常用工作流。', '迁移范围、跨系统能力和数据处理须依官方说明。', 6),
  scene('os-app-compatibility', 'os', '应用与外设兼容核对', ['职场人士', '学生', '创作者'], ['常用软件', '插件', '外设驱动'], '先列必用软件与外设，再逐项核实支持情况。', '应用版本、架构、插件和驱动需有明确证据。', 7),
  scene('speaker-bedtime', 'speaker', '睡前与晨间习惯', ['家庭', '个人用户'], ['闹钟', '音频', '日程提示'], '围绕家庭作息安排一个可执行的小场景。', '闹钟、内容服务和自动化支持须核验。', 5),
  scene('speaker-portable', 'speaker', '便携与户外分享', ['旅行者', '朋友'], ['野餐', '露营', '小型聚会'], '先确认携带需求与实际使用环境。', '电池、防护和便携性非所有型号具备，公共场所注意音量。', 4),
  scene('speaker-children-content', 'speaker', '亲子音频时段', ['儿童家庭'], ['故事', '儿歌', '家庭音频'], '共同挑选内容并约定使用时段。', '适龄内容、账号、会员、隐私与音量设置须核验。', 5),
  scene('home-leave', 'whole_home', '离家检查', ['家庭', '经常出门者'], ['兼容设备状态确认'], '以离家前的设备检查流程切入。', '不承诺防盗或防灾；设备状态和通知条件须核验。', 6),
  scene('home-elderly', 'whole_home', '长辈居家便利', ['长辈', '照护者'], ['简化控制', '照明', '提醒'], '从共同设置和真实使用习惯展开。', '不作跌倒识别、医疗监护或紧急响应承诺。', 6),
  scene('home-permissions', 'whole_home', '家庭权限与访客', ['多成员家庭', '照护家庭'], ['设备权限', '访客', '账号管理'], '讲清家庭成员谁可以查看、谁可以更改设置。', '权限隔离能力按系统和服务方案核验。', 5),
  scene('router-mesh', 'router', '多房间与多层组网', ['大户型', '多层住宅'], ['节点部署', '回程', '漫游'], '从户型图、布线和设备位置讨论方案。', 'Mesh兼容、回程方式、节点数和漫游体验按资料核验。', 6),
  scene('router-upgrade', 'router', '网络升级排查', ['换新用户', '居家办公者'], ['宽带升级', '速度排查'], '先检查网络瓶颈，再判断是否需要更换设备。', '运营商、入户设备、网线、终端和测速条件均需检查。', 5),
  scene('router-travel', 'router', '临时与移动网络', ['差旅人群'], ['临时办公', '旅行接入'], '说明酒店或公共网络环境中的实际限制。', '不是所有路由器都支持移动网络，认证和安全条件须核验。', 4),
  scene('os-update', 'os', '系统更新与版本变化', ['全体用户'], ['更新准备', '了解变化'], '用清单帮助用户判断更新前后要检查什么。', '发布批次、升级路径、回退条件和可用性须查官方公告。', 6),
  scene('os-file-workflow', 'os', '文件整理与备份', ['学生', '职场人士'], ['文件搜索', '分类', '备份', '分享'], '展示资料从接收、整理到归档的工作流。', '访问权限、云服务、格式兼容按版本和服务核验。', 5),
];

function preset(id, type, label, categories, audiences, needs, angle, aliases, guardrails, extra = {}) {
  return { id, type, label, categories, audiences, needs, scenarios: [], angle, aliases, guardrails: [guardrails], origin: 'preset', status: 'draft', priority: 6, weight: 1, related: [], effective: { period: null, region: null }, ...extra };
}
const timingTags = [
  preset('time-spring-semester', 'timing', '春季开学', categories.map(x => x.id), ['学生', '家长'], ['新学期准备'], '借新学期新装备的期待推荐本款电脑，以校园学习相关亮点带出入手理由，邀请顾客来体验。', ['春季开学', '开学季'], '校历和学校设备要求以实际信息为准。', { priority: 7, effective: { period: '2-3月，按校历', region: '中国大陆' } }),
  preset('time-labor-day', 'timing', '五一假期', categories.map(x => x.id), ['旅行者', '家庭'], ['短途出行', '休闲'], '借五一假期的出游与休闲期待推荐本款电脑，突出旅途随行或假日创作的有据亮点，带动购机兴趣。', ['五一', '劳动节'], '交通与活动信息须使用当期权威来源。', { effective: { period: '5月法定假期', region: '中国大陆' } }),
  preset('time-graduation', 'timing', '毕业升学季', categories.map(x => x.id), ['毕业生', '家长'], ['毕业', '升学', '新阶段准备'], '以毕业迈向下一站的仪式感推荐本款电脑，让已核实的亮点呼应升学、入职和新生活的期待。', ['毕业季', '升学季'], '不假设专业需求；软件要求由学校/用户确认。', { priority: 8, effective: { period: '5-8月，按校历', region: '中国大陆' } }),
  preset('time-summer-break', 'timing', '暑假生活', categories.map(x => x.id), ['学生', '家庭'], ['假期学习', '运动', '旅行', '亲子娱乐'], '借暑假学习与创作的新计划推荐本款电脑，把有依据的亮点讲成值得为假期添置新装备的理由。', ['暑假', '暑期'], '活动日期、服务和产品事实需分别核实。', { effective: { period: '7-8月，按校历', region: '中国大陆' } }),
  preset('time-summer-travel', 'timing', '暑期旅行', categories.map(x => x.id), ['旅行者', '家庭'], ['旅行记录', '移动娱乐'], '借暑期出游热情推荐本款电脑，以有据可查的随行与创作亮点打动想把电脑带上旅途的顾客。', ['暑期出游', '暑假旅游'], '实时天气、交通及设备能力须另行核验。', { effective: { period: '7-8月', region: '中国大陆' } }),
  preset('time-back-to-school', 'timing', '开学准备', categories.map(x => x.id), ['学生', '家长'], ['课程', '宿舍', '校园生活'], '以开学给自己添一台心仪电脑的期待开场，突出本款电脑贴近校园生活的亮点，吸引新生咨询体验。', ['新生入学', '开学季'], '学校政策和专业软件要求需由学校资料确认。', { priority: 9, effective: { period: '8-9月，按校历', region: '中国大陆' } }),
  preset('time-national-day', 'timing', '国庆假期', categories.map(x => x.id), ['全人群', '旅行者'], ['旅行', '家庭活动', '返乡'], '借国庆假期为生活添新装备的期待推荐本款电脑，用假日出游、创作或休闲场景带出心动理由。', ['国庆', '十一假期'], '交通、天气及活动信息须用当期权威来源。', { priority: 8, effective: { period: '10月1日前后', region: '中国大陆' } }),
  preset('time-double-eleven', 'timing', '双11购物季', categories.map(x => x.id), ['有购置需求的人群'], ['需求清单', '型号比较'], '借双11购机热度把本款电脑推到顾客面前，突出值得入手的亮点；已核实的优惠自然带出，邀请咨询当前购机权益。', ['双11', '双十一', '购物节'], '不得编造价格、库存、优惠或补贴。', { effective: { period: '10-11月，按平台活动', region: '中国大陆' } }),
  preset('time-winter-break', 'timing', '寒假生活', categories.map(x => x.id), ['学生', '家庭'], ['假期学习', '家庭影音', '出行'], '借寒假学习、创作与休闲的期待推荐本款电脑，以已核实亮点唤起假期换新兴趣。', ['寒假', '冬季假期'], '校历与服务信息需以当年实际安排为准。', { effective: { period: '1-2月，按校历', region: '中国大陆' } }),
  preset('time-spring-festival', 'timing', '春节与返乡', categories.map(x => x.id), ['家庭', '旅行者'], ['团聚', '返乡', '假期记录'], '以新年添新装备、犒赏自己或送心意的期待推荐本款电脑，围绕真实亮点营造有温度的购买吸引力。', ['春节', '过年', '春运'], '日期按农历核对；交通与活动信息需用当期来源。', { effective: { period: '农历新年前后', region: '中国大陆' } }),
  preset('time-national-subsidy', 'timing', '国补助力电脑换新', ['computer'], ['换新用户', '大学生', '家庭'], ['电脑换新决策', '预算规划', '购买时机'], '借国补换新热度推荐本款电脑，突出电脑亮点与换新吸引力；有适用优惠依据时讲清购机实惠，邀请顾客咨询当前权益。', ['国补', '国家补贴', '以旧换新'], '标签不是补贴事实。无官方依据明确覆盖地区、时间、电脑品类、型号/渠道和资格条件时，不得承诺可享、便宜或节省金额；避免政策科普抢走电脑主角。', { priority: 9, effective: { period: '全年，按政策周期', region: '以政策地区为准' } }),
  preset('time-year-end', 'timing', '年终复盘与换新', categories.map(x => x.id), ['职场人士', '创作者', '换新用户'], ['文件整理', '项目复盘', '需求规划'], '以犒赏一年努力、迎接新一年为由推荐本款电脑，用已核实的亮点打动准备换新的顾客。', ['年终总结', '年末换新'], '产品价格、促销与服务范围须实时核验。', { effective: { period: '12月', region: '不限' } }),
];

const activeMonths = {
  'time-spring-semester': [2, 3], 'time-labor-day': [4, 5], 'time-graduation': [5, 6, 7, 8],
  'time-summer-break': [7, 8], 'time-summer-travel': [7, 8], 'time-back-to-school': [8, 9],
  'time-national-day': [9, 10], 'time-double-eleven': [10, 11], 'time-winter-break': [1, 2],
  'time-spring-festival': [1, 2], 'time-national-subsidy': Array.from({ length: 12 }, (_, i) => i + 1),
  'time-year-end': [12],
};
for (const tag of timingTags) tag.effective.months = activeMonths[tag.id] || [];

const hotTags = [
  preset('hot-subsidy', 'hot', '国补助力电脑换新', ['computer'], ['换新用户', '大学生', '家庭'], ['电脑购买动机', '预算规划', '政策窗口'], '借国补换新热度推荐本款电脑，突出电脑亮点与换新吸引力；有适用优惠依据时讲清购机实惠，邀请顾客咨询当前权益。', ['国补', '国家补贴', '消费品以旧换新', '地方补贴'], '只有官方依据明确覆盖地区、时间、电脑品类、型号/渠道和资格条件时才能确认优惠；否则不得承诺可享、便宜或省下金额。', { priority: 10 }),
  preset('hot-trade-in', 'hot', '以旧换新', categories.map(x => x.id), ['换新用户'], ['旧设备评估', '资料迁移', '回收'], '借旧电脑换新需求推荐本款电脑，把真实产品亮点讲成升级理由，有官方依据时自然带出换新权益。', ['旧机换新', '回收', '折抵'], '估值、抵扣金额、服务范围按当前官方渠道核实。', { priority: 8 }),
  preset('hot-price-cut', 'hot', '降价与价格变化', categories.map(x => x.id), ['有购置需求的人群'], ['价格判断', '型号差异'], '借价格关注度推荐本款电脑，先让顾客心动于产品亮点，再结合已核实的当前价格或优惠讲购买吸引力。', ['降价', '调价', '优惠', '到手价', '价格战'], '只使用当前官方/授权渠道页面，不从搜索摘要推定价格。', { priority: 9 }),
  preset('hot-shopping-festival', 'hot', '电商大促与购物季', categories.map(x => x.id), ['有购置需求的人群'], ['促销规则', '型号比较'], '借购物季的购机热度推荐本款电脑，以产品亮点和已核实的活动权益带动咨询，不写促销规则教程。', ['618', '双11', '双12', '年货节', '大促'], '活动日期、价格、库存及权益须实时核验。', { priority: 8 }),
  preset('hot-budget-value', 'hot', '预算与购机价值', categories.map(x => x.id), ['学生', '换新用户'], ['预算', '功能取舍'], '面向看重购机价值的顾客推荐本款电脑，用有依据的亮点讲清值得入手的理由，不做预算取舍攻略。', ['预算购机', '学生党', '性价比', '值不值得买'], '价格和可售型号必须实时核验，不做无来源排名。', { priority: 8 }),
  preset('hot-tourism', 'hot', '旅游热与目的地关注', categories.map(x => x.id), ['旅行者', '家庭'], ['行前准备', '旅途记录'], '借旅行热度推荐本款电脑，用旅途随行与记录灵感的期待带出有依据的产品亮点，不写旅行攻略。', ['旅游热', '热门目的地', '旅行攻略', '周末游'], '日期、目的地及出行提示需有当前可靠来源。', { priority: 8 }),
  preset('hot-holiday-travel', 'hot', '假期出游与返乡', categories.map(x => x.id), ['旅行者', '家庭'], ['行程沟通', '移动娱乐'], '借假期出游与返乡的期待推荐本款电脑，以旅途工作、创作或休闲场景激发购机兴趣，不讲交通准备清单。', ['暑运', '春运', '国庆出行', '返乡', '客流'], '交通、天气和拥堵信息使用权威实时来源。', { priority: 7 }),
  preset('hot-school-start', 'hot', '开学与校园生活', categories.map(x => x.id), ['学生', '家长'], ['课程准备', '校园生活'], '借开学与校园生活话题推荐本款电脑，用贴近学生日常的真实亮点营造新学期入手的心动理由。', ['开学季', '新生入学', '校园生活', '选课'], '学校设备、软件和网络要求由用户或学校资料提供。', { priority: 9 }),
  preset('hot-exam', 'hot', '考试与备考', categories.map(x => x.id), ['学生', '备考人群'], ['资料管理', '学习计划'], '借备考热度推荐本款电脑，以学习陪伴和已核实的产品亮点打动备考人群，不写复习方法或提分承诺。', ['高考', '考研', '考公', '资格考试', '期末'], '考务规定查官方来源；不得暗示设备提分。', { priority: 7 }),
  preset('hot-job-hunt', 'hot', '求职与就业', categories.map(x => x.id), ['毕业生', '求职者'], ['简历', '面试', '作品集'], '借求职入职的新阶段推荐本款电脑，用有依据的亮点呼应面试、作品展示和职场日常，不写求职教程。', ['春招', '秋招', '实习', '招聘', '求职'], '招聘数据与政策需可靠来源，不作就业保证。', { priority: 7 }),
  preset('hot-ai-application', 'hot', 'AI 应用与智能助手', categories.map(x => x.id), ['职场人士', '学生', '创作者'], ['任务辅助', '效率工具'], '借AI应用热度推荐本款电脑，突出官方已确认的相关功能与顾客价值，不把热门AI能力直接套到本机。', ['AI应用', '生成式AI', '智能助手', 'AI办公'], '开放范围、版本、地区、隐私和输出限制须核实。', { priority: 8 }),
  preset('hot-ai-creation', 'hot', 'AI 内容创作', categories.map(x => x.id), ['内容创作者'], ['构思', '编辑', '内容整理'], '借AI创作话题激发对本款电脑的兴趣，围绕已核实的创作相关亮点展开推荐，不写工具教程或虚构AI能力。', ['AIGC', 'AI绘图', 'AI视频', 'AI写作'], '版权、平台规则和模型能力需核实，不保证流量。', { priority: 7 }),
  preset('hot-os-ecosystem', 'hot', '操作系统与生态协同', categories.map(x => x.id), ['职场人士', '学生', '家庭'], ['跨设备任务', '应用支持'], '借生态协同话题突出本款电脑的吸引力，仅在勾选配角且官方证据支持时点到协同亮点，不展开设置教学。', ['鸿蒙生态', '跨设备协同', '系统更新'], '设备清单、版本、账号、地区及应用支持逐项核实。', { priority: 8 }),
  preset('hot-product-launch', 'hot', '新品发布与升级', categories.map(x => x.id), ['数码关注者'], ['新旧代际差异'], '借新品关注度推荐本款电脑，用官方已确认的新亮点唤起换新兴趣，不写发布会新闻摘要。', ['新品发布', '发布会', '产品迭代', '预热'], '传闻不得当结论；产品事实只引用官方发布资料。', { priority: 7 }),
  preset('hot-game-release', 'hot', '新游与游戏版本更新', categories.map(x => x.id), ['游戏玩家'], ['游戏平台', '配置需求'], '借新游话题吸引游戏人群了解本款电脑，只讲官方证据支持的适配与亮点，不把话题热度当作性能证明。', ['新游上线', '版本更新', '电竞赛事'], '平台、配置要求和时间查游戏/赛事官方来源。', { priority: 7 }),
  preset('hot-sports-event', 'hot', '体育赛事与运动热', categories.map(x => x.id), ['运动爱好者', '家庭'], ['运动记录', '赛事观赛'], '仅在赛事话题能自然关联电脑使用时，借观赛与内容创作的期待推荐本款电脑，不强凑运动功能。', ['马拉松', '球赛', '运动赛事', '健身挑战'], '赛事时间规则及运动建议使用权威来源。', { priority: 6 }),
  preset('hot-family-spending', 'hot', '家庭消费与家庭生活', categories.map(x => x.id), ['家庭', '家长'], ['共同需求', '预算讨论'], '借家庭添置新装备的期待推荐本款电脑，用贴近家庭学习与工作日常的真实亮点打动顾客。', ['家庭消费', '亲子消费', '家庭娱乐'], '不预设购买力或家庭结构；趋势数据需注明来源。', { priority: 6 }),
  preset('hot-privacy-security', 'hot', '数字隐私与安全', categories.map(x => x.id), ['全体用户'], ['权限设置', '账号保护'], '借数字隐私关注度推荐本款电脑，用官方已确认的隐私相关亮点带出安心使用的购买关切，不写权限设置教程。', ['隐私保护', '数据安全', '权限管理', '反诈'], '使用监管或厂商官方来源，不承诺绝对安全。', { priority: 6 }),
  preset('hot-repair-sustainability', 'hot', '维修、回收与可持续', categories.map(x => x.id), ['换新用户', '家庭'], ['维修判断', '资料迁移', '回收'], '借旧机更新与绿色消费话题推荐本款电脑，突出换新的真实吸引力，有官方依据时带出回收服务，不写维修教程。', ['维修', '回收', '循环使用', '绿色消费'], '价格、维修政策和回收信息需官方/权威来源。', { priority: 6 }),
];

const crossTags = [
  preset('cross-study', 'cross', '学习设备组合', ['computer', 'tablet', 'phone', 'audio', 'router', 'os'], ['学生'], ['课程', '笔记', '资料同步'], '围绕本款电脑的校园学习亮点展开推荐，勾选的平板等设备仅以官方支持的协同能力点到为止，电脑始终是主角。', ['学习组合', '校园设备'], '兼容关系与产品能力按型号核验。'),
  preset('cross-travel', 'cross', '旅行随行组合', ['phone', 'wearable', 'audio', 'tablet', 'computer'], ['旅行者'], ['行程', '拍摄', '聆听', '移动办公'], '推荐本款电脑成为出行搭子，勾选的手机等设备仅补充一句有官方依据的PC协同吸引力。', ['旅游装备', '出行设备'], '兼容性、续航与实时出行信息逐项核实。'),
  preset('cross-work', 'cross', '移动办公组合', ['computer', 'phone', 'tablet', 'audio', 'router', 'os'], ['职场人士'], ['文档', '会议', '协作', '差旅'], '突出本款电脑在移动办公中的推荐理由，勾选的手机、平板或耳机仅以已核实的PC协同亮点自然带过。', ['办公组合', '差旅办公'], '公司软件、账号策略及兼容性按实际环境核验。'),
  preset('cross-gaming', 'cross', '游戏娱乐组合', ['phone', 'computer', 'tablet', 'audio', 'router', 'smart_screen'], ['游戏玩家'], ['游戏', '语音', '连接', '观赛'], '围绕本款电脑有据可查的娱乐亮点展开推荐，勾选的生态设备只作一句有依据的搭配补充，不堆设备。', ['游戏设备', '电竞'], '不承诺性能提升；型号和连接条件须有依据。'),
  preset('cross-home-network', 'cross', '智能家居网络底座', ['router', 'whole_home', 'phone', 'speaker', 'smart_screen'], ['家庭空间管理者'], ['家庭网络', '设备联动'], '先梳理网络、协议、安装和现有设备，再规划联动。', ['全屋智能', '家庭网络'], '协议、设备兼容和安装条件逐项核实。'),
];

const needMappings = {
  travel: { label: '旅游', categories: ['phone', 'wearable', 'tablet', 'audio', 'computer'], clarify: ['休闲/商务', '行程长短', '是否办公或拍摄', '携带偏好'] },
  gaming: { label: '打游戏', categories: ['computer', 'phone', 'tablet', 'audio', 'router'], clarify: ['游戏名称/平台', '便携偏好', '联机方式'] },
  senior: { label: '长辈使用', categories: ['phone', 'wearable', 'tablet', 'smart_screen', 'speaker', 'whole_home'], clarify: ['主要任务', '视听/操作需求', '家人是否协助设置'] },
  learning: { label: '学习', categories: ['computer', 'tablet', 'phone', 'audio', 'router'], clarify: ['学段/专业', '课程软件', '学校规则'] },
  sports: { label: '运动', categories: ['wearable', 'phone', 'audio'], clarify: ['运动类型', '室内/户外', '数据需求'] },
  smart_home: { label: '居家智能', categories: ['router', 'whole_home', 'speaker', 'smart_screen'], clarify: ['房屋/网络条件', '现有协议与设备', '安装条件'] },
};

const tagGroups = { category: categoryTags, timing: timingTags, hot: hotTags, cross: crossTags };
export function getTagLibrary() { return { categories, audiences, categoryTags, timingTags, hotTags, crossTags, needMappings }; }
export function findPresetTag(id) { return Object.values(tagGroups).flat().find(tag => tag.id === id) || null; }

const audienceGroups = [
  ['student', '学生', '大学新生', '大学生', '研究生', '备考'],
  ['office', '职场', '出差', '差旅', '商务', '远程办公', '小团队'],
  ['creator', '创作', '创作者', '设计师', '编辑', '自媒体', '视频'],
  ['family', '家庭', '家长', '亲子'],
  ['gamer', '游戏', '玩家'],
  ['traveler', '旅行', '旅游', '出游'],
];
function audienceScore(tagAudiences, audience) {
  const target = audience.trim().toLowerCase();
  if (!target) return 0;
  return tagAudiences.reduce((best, label) => {
    const candidate = label.toLowerCase();
    if (target === candidate || target.includes(candidate) || candidate.includes(target)) return Math.max(best, 5);
    const group = audienceGroups.find(([, ...terms]) => terms.some(term => target.includes(term.toLowerCase())));
    return group?.slice(1).some(term => candidate.includes(term.toLowerCase())) ? Math.max(best, 3) : best;
  }, 0);
}
export function recommendPresetTags({ audience = '', month = new Date().getMonth() + 1, sceneLimit = 5, timingLimit = 3 } = {}) {
  const currentMonth = Number(month);
  if (!Number.isInteger(currentMonth) || currentMonth < 1 || currentMonth > 12) throw new Error('月份必须为 1 到 12。');
  const rank = tag => ({ ...tag, recommendationScore: audienceScore(tag.audiences, audience) * 10 + tag.priority });
  const scenes = categoryTags.filter(tag => tag.categories.includes('computer')).map(rank)
    .sort((a, b) => b.recommendationScore - a.recommendationScore || a.label.localeCompare(b.label, 'zh-CN'))
    .slice(0, Math.max(1, Math.min(5, sceneLimit)));
  const timing = timingTags.filter(tag => tag.categories.includes('computer') && tag.effective.months.includes(currentMonth)).map(rank)
    .sort((a, b) => b.recommendationScore - a.recommendationScore || a.label.localeCompare(b.label, 'zh-CN'))
    .slice(0, Math.max(1, Math.min(5, timingLimit)));
  return { scenes, timing, month: currentMonth };
}
