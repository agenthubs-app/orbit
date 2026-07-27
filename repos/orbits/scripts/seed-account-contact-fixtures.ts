import { createHash } from "node:crypto";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../shared/domain/contracts";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";

interface FixtureDefinition {
  displayName: string;
  organization: string;
  role: string;
  location: string;
  email: string;
  profileBio: string;
  selfIntroduction: string;
  offering: readonly string[];
  seeking: readonly string[];
  conversationPrompts: readonly string[];
  interactionHistory: readonly [string, string, string];
  stage: ContactDTO["stage"];
  sourceType: ContactDTO["source"]["type"];
  sourceLabel: string;
  networkCategory: NonNullable<ContactDTO["networkCategory"]>;
  industry: string;
  valueTypes: ConnectionDTO["valueTypes"];
  relationshipStrength: number;
  businessRelevanceScore: number;
  trustLevel: NonNullable<ConnectionDTO["trustLevel"]>;
  sharedTopics: readonly string[];
  nextAction: string;
  summary: string;
}

const fixtures: readonly FixtureDefinition[] = [
  {
    displayName: "林玫",
    organization: "港湾创投",
    role: "投资合伙人",
    location: "东京",
    email: "mei.lin@harbor.example.test",
    profileBio: "港湾创投投资合伙人，过去十二年持续投资企业软件、人工智能基础设施与产业数字化项目，主要覆盖日本及东亚市场。",
    selfIntroduction: "我关注能够解决真实产业问题的早期团队，也愿意帮助创始人梳理日本市场进入路径和后续融资节奏。",
    offering: ["早期项目判断与融资反馈", "日本产业投资人与企业客户引荐"],
    seeking: ["具备清晰验证数据的人工智能项目", "可共同研究的产业数字化投资主题"],
    conversationPrompts: ["最近日本企业客户最愿意为哪类人工智能能力付费？", "种子轮团队进入日本市场时最容易低估什么？"],
    interactionHistory: [
      "电话复盘了三家人工智能项目，林玫重点询问客户续费数据并建议暂缓推荐其中一家。",
      "在东京人工智能合作伙伴交流会上首次深入交谈，确认双方都关注制造业效率工具。",
      "会后邮件分享了港湾创投的投资阶段、单笔规模和项目筛选标准。",
    ],
    stage: "active",
    sourceType: "event_import",
    sourceLabel: "东京人工智能合作伙伴交流会",
    networkCategory: "investor",
    industry: "风险投资",
    valueTypes: ["strategic_fit", "referral_path"],
    relationshipStrength: 92,
    businessRelevanceScore: 95,
    trustLevel: "trusted",
    sharedTopics: ["人工智能", "日本市场", "种子轮融资"],
    nextAction: "周五前发送人工智能合作项目清单，并标注适合其基金阶段的三家公司。",
    summary: "长期关注日本人工智能早期项目的投资合伙人，熟悉种子轮决策流程和本地产业资源。双方已有多次有效交流，适合优先维护并讨论联合项目筛选。",
  },
  {
    displayName: "佐藤健司",
    organization: "云端机器人",
    role: "创始人兼首席执行官",
    location: "横滨",
    email: "kenji.sato@kumo.example.test",
    profileBio: "云端机器人创始人兼首席执行官，带领团队研发面向精密制造产线的视觉检测和机器人协同软件。",
    selfIntroduction: "我们希望让中型工厂也能以可控成本部署视觉质检，目前正在寻找首批联合验证客户和懂制造现场的技术伙伴。",
    offering: ["制造业视觉质检场景与一线数据", "机器人控制和产线集成经验"],
    seeking: ["三家愿意提供缺陷样本的试点工厂", "产品商业化和种子轮融资建议"],
    conversationPrompts: ["现有产线中哪一种缺陷最影响交付？", "试点成功后由哪个部门决定集团范围采购？"],
    interactionHistory: [
      "线上需求会确认首个试点聚焦金属零件划痕检测，佐藤健司承诺补充两百张脱敏样本。",
      "交换名片后发送了产品资料，资料显示当前模型在实验环境的召回率为百分之九十四。",
      "在制造业人工智能峰会听取其演讲，现场讨论了边缘部署与产线停机限制。",
    ],
    stage: "needs_follow_up",
    sourceType: "business_card_ocr",
    sourceLabel: "名片扫描",
    networkCategory: "prospect",
    industry: "机器人",
    valueTypes: ["commercial_opportunity", "knowledge_exchange"],
    relationshipStrength: 58,
    businessRelevanceScore: 91,
    trustLevel: "warm",
    sharedTopics: ["工业机器人", "智能制造", "计算机视觉"],
    nextAction: "本周确认下周产品演示时间，并提前收集产线相机型号、节拍和误检率数据。",
    summary: "正在为制造业客户评估视觉质检方案的机器人创业者，拥有明确的试点场景和预算窗口。当前关系处于需求确认阶段，需要用具体演示和数据接口方案推进。",
  },
  {
    displayName: "田中爱子",
    organization: "东京创业者联盟",
    role: "社群总监",
    location: "东京",
    email: "aiko.tanaka@guild.example.test",
    profileBio: "东京创业者联盟社群总监，负责创始人会员体系、闭门圆桌和跨机构合作，每年组织四十余场小型行业交流。",
    selfIntroduction: "我擅长把处于相似阶段、面临相似难题的创业者组织到同一张桌上，让交流能够形成后续合作。",
    offering: ["东京创业者社群与活动渠道", "按议题筛选嘉宾和建立暖连接"],
    seeking: ["高质量行业议题和分享嘉宾", "能够长期支持创始人的合作机构"],
    conversationPrompts: ["今年创始人最希望闭门讨论哪些经营问题？", "怎样的合作方最容易获得社群成员信任？"],
    interactionHistory: [
      "语音沟通圆桌主题，田中爱子建议从融资改为首批企业客户获取，并给出五位候选嘉宾。",
      "由林玫在小范围晚餐中完成引荐，三方确认后续直接联系。",
      "邮件发送联盟会员画像和活动合作原则，明确不接受无筛选的批量推广。",
    ],
    stage: "needs_follow_up",
    sourceType: "referral",
    sourceLabel: "由林玫推荐",
    networkCategory: "connector",
    industry: "创业服务",
    valueTypes: ["community_context", "referral_path"],
    relationshipStrength: 72,
    businessRelevanceScore: 82,
    trustLevel: "trusted",
    sharedTopics: ["创业者社群", "行业活动", "嘉宾连接"],
    nextAction: "发送创业者圆桌嘉宾画像，并请她确认最适合邀请的五位创始人。",
    summary: "负责东京多个创业者社群的运营与合作，擅长根据议题组织高质量的小范围交流。由林玫引荐，信任基础较好，是连接创始人与活动资源的重要节点。",
  },
  {
    displayName: "普丽娅·拉奥",
    organization: "云启系统",
    role: "人工智能交付总监",
    location: "新加坡",
    email: "priya.rao@nimbus.example.test",
    profileBio: "云启系统人工智能交付总监，管理新加坡、马来西亚和泰国的解决方案架构师与实施团队，专长是复杂企业系统落地。",
    selfIntroduction: "我关心的不只是模型效果，还包括数据权限、变更管理和上线后的运营责任，希望与产品团队建立可复制的交付方式。",
    offering: ["东南亚企业项目交付团队", "安全审查与系统集成方法"],
    seeking: ["稳定可部署的人工智能产品能力", "透明的项目责任与商业分配机制"],
    conversationPrompts: ["联合项目中最需要提前锁定哪几条责任边界？", "区域客户的安全审查通常在哪个环节卡住？"],
    interactionHistory: [
      "联合方案评审会上逐项确认售前、数据准备、实施和客户成功负责人，仍需补充故障升级机制。",
      "共享了某银行项目的脱敏交付复盘，指出用户培训不足是采用率下降的主要原因。",
      "通过通讯录重新建立联系，并确认双方曾在新加坡企业技术论坛见面。",
    ],
    stage: "reviewing",
    sourceType: "external_contacts",
    sourceLabel: "通讯录导入",
    networkCategory: "partner",
    industry: "企业人工智能",
    valueTypes: ["commercial_opportunity", "strategic_fit"],
    relationshipStrength: 76,
    businessRelevanceScore: 94,
    trustLevel: "warm",
    sharedTopics: ["企业人工智能", "项目交付", "东南亚市场"],
    nextAction: "共同审阅区域项目交付模型，明确售前、实施、数据安全和客户成功的责任边界。",
    summary: "管理东南亚企业人工智能项目交付，熟悉大型客户的采购、安全审查和上线流程。具备区域实施团队，是共同承接跨国项目的高匹配合作伙伴。",
  },
  {
    displayName: "索菲娅·马丁内斯",
    organization: "市场桥梁",
    role: "跨境电商负责人",
    location: "大阪",
    email: "sofia.martinez@mercado.example.test",
    profileBio: "市场桥梁跨境电商负责人，帮助拉丁美洲消费品牌完成日本渠道测试、商品本地化和首批供应链搭建。",
    selfIntroduction: "我希望把品牌进入日本时的试错成本降下来，尤其关注小规模渠道验证、客服语言和合规准备。",
    offering: ["拉美品牌资源与跨境选品经验", "日本渠道测试和本地运营伙伴"],
    seeking: ["日本零售渠道与物流服务商", "适合拉美品牌的低成本市场验证工具"],
    conversationPrompts: ["拉美品牌进入日本最常见的错误假设是什么？", "首批渠道测试用哪些指标判断值得继续投入？"],
    interactionHistory: [
      "视频交流了两个准备进入日本的食品品牌，索菲娅希望先验证大阪地区的精品超市渠道。",
      "现场扫码后互换公司介绍，她补充说明团队在墨西哥和智利有本地运营人员。",
      "发送日本市场进入清单初稿，并请她标出拉美品牌最难准备的合规材料。",
    ],
    stage: "nurture",
    sourceType: "qr_scan",
    sourceLabel: "现场扫码交换资料",
    networkCategory: "partner",
    industry: "跨境电商",
    valueTypes: ["knowledge_exchange", "commercial_opportunity"],
    relationshipStrength: 49,
    businessRelevanceScore: 78,
    trustLevel: "emerging",
    sharedTopics: ["跨境电商", "拉丁美洲市场", "日本市场"],
    nextAction: "分享日本市场进入清单，并约一次交流梳理拉美品牌在日本的渠道与合规难点。",
    summary: "帮助拉丁美洲消费品牌进入日本市场，覆盖渠道选择、本地运营与合作伙伴协调。双方刚建立联系，已有清晰的知识互补和潜在客户转介价值。",
  },
  {
    displayName: "奥马尔·拉赫曼",
    organization: "阿特拉斯云",
    role: "区域合作副总裁",
    location: "迪拜",
    email: "omar.rahman@atlas.example.test",
    profileBio: "阿特拉斯云区域合作副总裁，负责中东重点市场的渠道生态、联合销售和云迁移合作伙伴计划。",
    selfIntroduction: "我的工作是让产品公司、实施伙伴和云平台在同一客户计划里形成清晰分工，并共同承担销售结果。",
    offering: ["中东企业客户和渠道网络", "云平台联合销售及市场资源"],
    seeking: ["能够解决行业痛点的成熟产品", "响应迅速且具备区域交付能力的伙伴"],
    conversationPrompts: ["哪些客户最适合由双方共同切入？", "联合销售计划需要怎样的投入才能获得平台资源？"],
    interactionHistory: [
      "邮件确认三家联合销售目标客户，其中一家已进入技术评估，双方约定本周补齐联系人地图。",
      "季度伙伴会议讨论了医疗和酒店两个行业方案，奥马尔建议优先选择已有本地案例的方向。",
      "首次邮件往来确认合作范围，他提供阿联酋和沙特的渠道负责人名单。",
    ],
    stage: "active",
    sourceType: "email_signal",
    sourceLabel: "已确认邮件往来",
    networkCategory: "partner",
    industry: "云基础设施",
    valueTypes: ["strategic_fit", "commercial_opportunity"],
    relationshipStrength: 84,
    businessRelevanceScore: 89,
    trustLevel: "trusted",
    sharedTopics: ["云基础设施", "渠道合作", "中东市场"],
    nextAction: "整理联合销售客户短名单，分别标注客户负责人、采购阶段和双方可提供的资源。",
    summary: "负责中东地区云业务生态合作，能够协调渠道、技术和重点客户团队。双方已有稳定邮件往来，并存在多个可落地的联合销售机会。",
  },
  {
    displayName: "森花",
    organization: "绿桌可持续发展联盟",
    role: "可持续发展顾问",
    location: "京都",
    email: "hana.mori@greentable.example.test",
    profileBio: "绿桌可持续发展联盟顾问，为京都地区酒店、餐饮和文化设施设计节能、采购与员工参与方案。",
    selfIntroduction: "我喜欢从一线运营细节出发，把可持续目标变成店长和员工每天能够执行的动作。",
    offering: ["酒店餐饮可持续运营方法", "京都本地供应商与案例资源"],
    seeking: ["可量化运营改善的数字工具", "愿意公开实践过程的示范门店"],
    conversationPrompts: ["酒店最容易先落地的可持续指标是什么？", "怎样让一线员工真正参与而不是增加填表负担？"],
    interactionHistory: [
      "工作坊大纲评审中删除了过多概念介绍，森花建议加入餐厨垃圾和客房能耗两个现场练习。",
      "在京都酒店协会活动后短暂交流，她分享一家旅馆减少一次性用品的实施经验。",
      "手动补录其联系方式，并记录由协会秘书确认可以直接联系。",
    ],
    stage: "captured",
    sourceType: "manual",
    sourceLabel: "手动录入",
    networkCategory: "advisor",
    industry: "可持续发展",
    valueTypes: ["knowledge_exchange", "community_context"],
    relationshipStrength: 35,
    businessRelevanceScore: 64,
    trustLevel: "emerging",
    sharedTopics: ["可持续经营", "酒店业", "京都"],
    nextAction: "请她审阅可持续经营工作坊大纲，重点核对酒店运营案例和衡量指标。",
    summary: "长期为京都酒店和餐饮企业提供可持续经营咨询，熟悉节能、供应链和员工参与议题。当前是新建立的顾问关系，适合先通过内容审阅验证合作默契。",
  },
  {
    displayName: "陈立安",
    organization: "北辰软件",
    role: "营收运营负责人",
    location: "台北",
    email: "lucas.chen@northstar.example.test",
    profileBio: "北辰软件营收运营负责人，统一管理市场线索、销售流程、续约预测与管理层经营报表。",
    selfIntroduction: "我希望把跨团队流程变成可追踪的数据闭环，先从线索分配和续约风险预警两个高频场景开始。",
    offering: ["企业软件营收流程和真实业务数据", "自动化试点的明确验收标准"],
    seeking: ["可与现有客户关系管理系统集成的自动化方案", "六周内可以验证价值的实施团队"],
    conversationPrompts: ["目前线索分配的最大延迟发生在哪一步？", "续约风险要提前多少天暴露才真正有行动价值？"],
    interactionHistory: [
      "日程会议确认概念验证范围，陈立安同意提供字段字典并指定一名销售运营分析师参与。",
      "第二次方案讨论将续约预警从首期移出，先验证线索路由是否能缩短响应时间。",
      "首次会议梳理现状流程，发现三个地区团队使用不同的线索优先级规则。",
    ],
    stage: "needs_follow_up",
    sourceType: "calendar_signal",
    sourceLabel: "已确认日程会议",
    networkCategory: "customer",
    industry: "企业软件",
    valueTypes: ["commercial_opportunity"],
    relationshipStrength: 63,
    businessRelevanceScore: 88,
    trustLevel: "warm",
    sharedTopics: ["企业软件", "营收运营", "流程自动化"],
    nextAction: "发送修订后的自动化概念验证范围，补充数据字段、验收指标和六周实施时间表。",
    summary: "负责销售、市场与客户成功之间的营收流程，正在推动线索分配和续约预警自动化。已有明确业务负责人和验证目标，是近期应重点推进的客户关系。",
  },
  {
    displayName: "艾玛·威尔逊",
    organization: "当代品牌工作室",
    role: "品牌战略负责人",
    location: "伦敦",
    email: "emma.wilson@current.example.test",
    profileBio: "当代品牌工作室品牌战略负责人，服务消费科技、生活方式和文化项目，专注定位、品牌架构与上市叙事。",
    selfIntroduction: "我通常在产品准备进入新市场或业务发生转型时加入，帮助团队把复杂能力转成客户能够理解和记住的价值。",
    offering: ["消费品牌定位与叙事方法", "欧洲设计与创意合作网络"],
    seeking: ["有真实用户洞察的品牌转型项目", "需要跨市场统一表达的产品团队"],
    conversationPrompts: ["品牌计划重新启动时，最需要先补哪类用户证据？", "跨市场叙事中哪些部分应保持统一，哪些必须本地化？"],
    interactionHistory: [
      "归档前邮件确认消费产品发布时间推迟，双方约定有新用户研究后再恢复讨论。",
      "品牌材料评审中指出目标客群过宽，并建议先选择一个高频使用场景。",
      "通讯录导入后补充了伦敦工作室信息和过往合作项目链接。",
    ],
    stage: "archived",
    sourceType: "external_contacts",
    sourceLabel: "通讯录导入",
    networkCategory: "advisor",
    industry: "品牌战略",
    valueTypes: ["knowledge_exchange"],
    relationshipStrength: 28,
    businessRelevanceScore: 42,
    trustLevel: "emerging",
    sharedTopics: ["品牌定位", "设计策略", "消费市场"],
    nextAction: "消费产品发布计划重启后再联系，并提前准备品牌定位和目标客群材料。",
    summary: "擅长消费品牌定位、叙事体系和发布策略，曾参与多个欧洲市场项目。当前没有进行中的合作事项，保留为未来消费业务启动时的专业顾问。",
  },
  {
    displayName: "小林大地",
    organization: "精进制造",
    role: "数字化转型经理",
    location: "名古屋",
    email: "daichi.kobayashi@seishin.example.test",
    profileBio: "精进制造数字化转型经理，负责集团多家工厂的质量、设备和生产数据项目，长期协调现场与信息系统部门。",
    selfIntroduction: "我希望先在一条产线上证明效果，再把数据标准和部署方式复制到其他工厂，避免只做无法扩展的展示项目。",
    offering: ["真实制造产线和质量检测数据", "多工厂数字化推广经验"],
    seeking: ["能够适应边缘环境的视觉检测方案", "清晰的数据准备和投资回报测算"],
    conversationPrompts: ["哪一种缺陷最值得作为第一阶段目标？", "从单线试点扩展到多工厂需要提前统一哪些标准？"],
    interactionHistory: [
      "现场勘察记录了相机位置、光照变化和单件节拍，小林大地要求方案不得影响现有生产速度。",
      "制造业人工智能峰会后交换需求表，确认主要问题是人工复检成本和判定一致性。",
      "日程会议邀请质量部门负责人加入，双方约定先完成历史图片可用性检查。",
    ],
    stage: "reviewing",
    sourceType: "event_import",
    sourceLabel: "制造业人工智能峰会",
    networkCategory: "prospect",
    industry: "制造业",
    valueTypes: ["commercial_opportunity", "knowledge_exchange"],
    relationshipStrength: 54,
    businessRelevanceScore: 86,
    trustLevel: "warm",
    sharedTopics: ["智能制造", "质量检测", "人工智能"],
    nextAction: "梳理视觉质检数据要求，确认缺陷类别、历史图片规模、产线节拍和现场部署限制。",
    summary: "负责集团工厂数字化项目，正在评估计算机视觉质检以降低人工复检成本。业务价值明确，但需要先完成数据可用性和现场设备条件评估。",
  },
  {
    displayName: "诺拉·费舍尔",
    organization: "阿尔卑斯健康",
    role: "创新项目负责人",
    location: "柏林",
    email: "nora.fischer@alpine.example.test",
    profileBio: "阿尔卑斯健康创新项目负责人，评估数字医疗工具并组织隐私、安全、临床和采购团队完成试点审查。",
    selfIntroduction: "我负责把创新方案带进真实医疗流程，前提是患者数据边界、临床责任和长期运营成本都足够清晰。",
    offering: ["欧洲数字医疗试点流程经验", "隐私与临床利益相关方协调"],
    seeking: ["隐私优先且可审计的技术架构", "能够耐心完成合规验证的产品伙伴"],
    conversationPrompts: ["什么证据能让隐私团队更早参与而不是最后否决？", "医疗试点最合理的最小数据范围是什么？"],
    interactionHistory: [
      "隐私架构交流中确认不得保存原始患者文本，诺拉要求补充权限撤销和审计日志说明。",
      "由合作伙伴邮件引荐，双方先交换了非保密产品和合规材料。",
      "十五分钟介绍会确认项目仍处于探索期，短期目标是完成内部信息安全预审。",
    ],
    stage: "nurture",
    sourceType: "referral",
    sourceLabel: "合作伙伴推荐",
    networkCategory: "prospect",
    industry: "数字医疗",
    valueTypes: ["strategic_fit", "knowledge_exchange"],
    relationshipStrength: 46,
    businessRelevanceScore: 73,
    trustLevel: "emerging",
    sharedTopics: ["数字医疗", "隐私保护", "创新项目"],
    nextAction: "发送隐私架构概览，重点说明数据最小化、权限审计和欧盟境内存储方案。",
    summary: "负责医疗服务创新试点，对患者数据保护、临床流程适配和供应商合规有严格要求。关系仍在早期培育阶段，应先建立技术可信度，再讨论商业试点。",
  },
  {
    displayName: "拉菲尔·科斯塔",
    organization: "流明酒店集团",
    role: "增长总监",
    location: "里斯本",
    email: "rafael.costa@lumen.example.test",
    profileBio: "流明酒店集团增长总监，负责直销渠道、会员运营、客户关系管理和新门店增长计划。",
    selfIntroduction: "我关注能够直接改善复购、升级销售和前台效率的工具，所有扩展决策都会基于门店数据和员工反馈。",
    offering: ["酒店客户运营数据与多门店场景", "葡萄牙酒店和旅游合作网络"],
    seeking: ["可复制的客户关系管理自动化能力", "能够支持多语言运营的实施伙伴"],
    conversationPrompts: ["首批上线后哪一个指标最能证明扩店价值？", "不同门店的员工培训和流程差异如何处理？"],
    interactionHistory: [
      "月度复盘确认会员激活率提升，但前台录入完整度仍低，拉菲尔希望下一版减少必填字段。",
      "首家酒店上线两周后电话检查，门店经理反馈自动提醒显著减少遗漏回访。",
      "名片扫描后安排首次需求会，确定先从里斯本两家商务酒店开始试点。",
    ],
    stage: "active",
    sourceType: "business_card_ocr",
    sourceLabel: "名片扫描",
    networkCategory: "customer",
    industry: "酒店业",
    valueTypes: ["commercial_opportunity", "community_context"],
    relationshipStrength: 79,
    businessRelevanceScore: 87,
    trustLevel: "trusted",
    sharedTopics: ["酒店运营", "入境旅游", "客户关系管理"],
    nextAction: "复盘首批酒店的客户关系管理上线结果，并确认下一阶段扩展门店、预算和负责人。",
    summary: "负责集团增长与客户运营，首批客户关系管理项目已经上线并产生可量化效果。合作信任度较高，下一步重点是用复盘数据推动多门店扩展。",
  },
];

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;

  return value?.trim() || null;
}

function actorKey(actorId: string): string {
  return createHash("sha256").update(actorId).digest("hex").slice(0, 10);
}

function interactionTimestamp(
  contactIndex: number,
  interactionIndex: number,
): string {
  const daysAgo = [
    2 + (contactIndex % 5),
    16 + contactIndex,
    48 + contactIndex * 2,
  ][interactionIndex] ?? 60;

  return new Date(Date.UTC(2026, 6, 27 - daysAgo, 9, 30)).toISOString();
}

function interactionSourceType(
  primary: ContactDTO["source"]["type"],
  interactionIndex: number,
): ContactDTO["source"]["type"] {
  if (interactionIndex === 2) return primary;
  if (interactionIndex === 1) {
    return primary === "email_signal" ? "manual" : "email_signal";
  }
  return primary === "calendar_signal" ? "manual" : "calendar_signal";
}

async function main(): Promise<void> {
  const email = argumentValue("--email");
  if (!email) {
    throw new Error("Usage: --email <test-account-email>");
  }

  const authProvider = createConfiguredStorageAuthUserProvider();
  const configuredStore = createConfiguredPostgresLiveRecordStore();
  if (!authProvider || !configuredStore) {
    throw new Error("The configured live store is unavailable.");
  }

  const actor = await authProvider.getUserByEmail(email);
  if (!actor) {
    throw new Error(`No account exists for ${email}.`);
  }

  const key = actorKey(actor.id);
  for (const [index, fixture] of fixtures.entries()) {
    const suffix = String(index + 1).padStart(2, "0");
    const contactId = `test-contact-${key}-${suffix}`;
    const connectionId = `test-connection-${key}-${suffix}`;
    const source = {
      type: fixture.sourceType,
      id: `test-source-${key}-${suffix}`,
      label: fixture.sourceLabel,
    } as const;
    const evidenceRecords: RelationshipEvidenceDTO[] =
      fixture.interactionHistory.map((summary, interactionIndex) => {
        const sourceType = interactionSourceType(
          fixture.sourceType,
          interactionIndex,
        );
        return {
          id: `test-evidence-${key}-${suffix}-${interactionIndex + 1}`,
          sourceType,
          sourceId: `${source.id}:interaction:${interactionIndex + 1}`,
          summary,
          occurredAt: interactionTimestamp(index, interactionIndex),
          confidence: 0.9 - interactionIndex * 0.04,
          createdBy: actor.id,
        };
      });
    const evidenceIds = evidenceRecords.map((evidence) => evidence.id) as [
      string,
      ...string[],
    ];
    const latestTimestamp = evidenceRecords[0].occurredAt;
    const createdAt = evidenceRecords.at(-1)?.occurredAt ?? latestTimestamp;
    const contact: ContactDTO = {
      id: contactId,
      personId: `test-person-${key}-${suffix}`,
      displayName: fixture.displayName,
      organization: fixture.organization,
      role: fixture.role,
      location: fixture.location,
      primaryEmail: fixture.email,
      profileSnippet: fixture.profileBio,
      stage: fixture.stage,
      handles: { email: fixture.email },
      publicProfile: {
        bio: fixture.profileBio,
        selfIntroduction: fixture.selfIntroduction,
        industry: fixture.industry,
        offering: fixture.offering,
        seeking: fixture.seeking,
        topics: fixture.sharedTopics,
        conversationPrompts: fixture.conversationPrompts,
      },
      networkCategory: fixture.networkCategory,
      nextAction: {
        text: fixture.nextAction,
        reason: fixture.summary,
        evidenceId: evidenceIds[0],
      },
      source,
      evidenceIds,
      createdAt,
      updatedAt: latestTimestamp,
    };
    const connection: ConnectionDTO = {
      id: connectionId,
      accountId: actor.id,
      contactId,
      stage: fixture.stage,
      valueTypes: fixture.valueTypes,
      summary: fixture.summary,
      relationshipStrength: fixture.relationshipStrength,
      trustLevel: fixture.trustLevel,
      businessRelevanceScore: fixture.businessRelevanceScore,
      sharedTopics: fixture.sharedTopics,
      suggestedActions: [fixture.nextAction],
      source,
      evidenceIds,
      createdAt,
      updatedAt: latestTimestamp,
    };

    for (const evidence of evidenceRecords) {
      await configuredStore.store.upsertRecord({
        workspaceId: configuredStore.workspaceId,
        collectionName: "evidence",
        recordId: evidence.id,
        userId: actor.id,
        sourceType: evidence.sourceType,
        sourceId: evidence.sourceId,
        sourceLabel: fixture.sourceLabel,
        evidenceIds: [evidence.id],
        occurredAt: evidence.occurredAt,
        createdAt: evidence.occurredAt,
        updatedAt: evidence.occurredAt,
        lifecycleState: "active",
        searchText: `${fixture.displayName} ${evidence.summary}`,
        payload: evidence as unknown as Record<string, unknown>,
      });
    }
    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "contacts",
      recordId: contactId,
      userId: actor.id,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      provider: "orbit-account-contact-fixtures",
      providerRecordId: contactId,
      targetType: "contact",
      targetId: contactId,
      evidenceIds,
      occurredAt: createdAt,
      createdAt,
      updatedAt: latestTimestamp,
      lifecycleState: "active",
      searchText: [
        fixture.displayName,
        fixture.organization,
        fixture.role,
        fixture.location,
        fixture.industry,
        fixture.profileBio,
        fixture.selfIntroduction,
        fixture.summary,
        ...fixture.offering,
        ...fixture.seeking,
        ...fixture.sharedTopics,
      ].join(" "),
      payload: contact as unknown as Record<string, unknown>,
    });
    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "connections",
      recordId: connectionId,
      userId: actor.id,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      provider: "orbit-account-contact-fixtures",
      providerRecordId: connectionId,
      targetType: "connection",
      targetId: connectionId,
      evidenceIds,
      occurredAt: createdAt,
      createdAt,
      updatedAt: latestTimestamp,
      lifecycleState: "active",
      searchText: `${fixture.displayName} ${fixture.summary} ${fixture.sharedTopics.join(" ")}`,
      payload: connection as unknown as Record<string, unknown>,
    });
  }

  // Keep the introduction fixture created during account QA aligned with the
  // localized contact records. Only the exact known test draft is migrated;
  // user-authored introduction notes are never rewritten.
  const introductionRecords = await configuredStore.store.listRecords({
    workspaceId: configuredStore.workspaceId,
    collectionName: "contact_introductions",
  });
  const localizedIntroduction =
    "林玫熟悉日本早期投资，佐藤健司正在推进机器人视觉项目。建议双方先交流产品路线、试点需求与融资节奏，再确认是否安排后续合作讨论。";
  for (const record of introductionRecords) {
    if (
      record.userId !== actor.id ||
      record.payload.contactAId !== `test-contact-${key}-01` ||
      record.payload.contactBId !== `test-contact-${key}-02` ||
      record.payload.blurb !==
        "Mei 熟悉日本早期投资，Kenji 正在推进机器人视觉项目，建议双方先交流产品路线与融资节奏。"
    ) {
      continue;
    }

    const updatedAt = new Date().toISOString();
    await configuredStore.store.upsertRecord({
      ...record,
      updatedAt,
      searchText: `林玫 佐藤健司 ${localizedIntroduction}`,
      payload: {
        ...record.payload,
        labelA: "林玫",
        labelB: "佐藤健司",
        blurb: localizedIntroduction,
        updatedAt,
      },
    });
  }

  console.log(
    JSON.stringify({
      accountId: actor.id,
      contactsUpserted: fixtures.length,
      interactionEvidenceUpserted: fixtures.reduce(
        (count, fixture) => count + fixture.interactionHistory.length,
        0,
      ),
      fixtureSet: `account-network-${key}`,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Contact fixture seeding failed.");
  process.exitCode = 1;
});
