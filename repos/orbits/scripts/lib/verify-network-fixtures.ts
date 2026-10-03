/**
 * W0055（W55-3）：`verify-network` 验收账号的确定性人脉夹具——D2 老用户、55 位已确认联系人、30 条 memo、10 条已完成跟进、
 * 3 场同场活动与若干日程约见，按 W0047 规则表落在 核心／有往来／待唤醒／新认识 四档。
 *
 * 全部时间相对「种子执行时刻」推算（重复执行档位分布不变）；全部是虚构数据（`.example.test` 邮箱、合成公司名）。
 * 只产出记录形状，不写库；写入在 `seed-verify-accounts.ts`。
 */
import { createHash } from "node:crypto";

import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";
import type { ConnectionDTO, ContactDTO, RelationshipEvidenceDTO } from "../../shared/domain/contracts";

export type VerifyNetworkTier = "core" | "active" | "dormant" | "new";

/** 按设计分组造记录：核心组 8、有往来组 14、待唤醒组 8、新认识组 25（合计 55）。实际档位由 W0047 规则算出，本机实测为 9／13／8／25。 */
export const VERIFY_NETWORK_TIER_SIZES: Readonly<Record<VerifyNetworkTier, number>> = { core: 8, active: 14, dormant: 8, new: 25 };
export const VERIFY_NETWORK_CONTACTS = 55;
export const VERIFY_NETWORK_MEMOS = 30;
export const VERIFY_NETWORK_FOLLOWUPS = 10;

const DAY_MS = 86_400_000;
const MEMO_NOTE_ID_PREFIX = "note:live-contact-detail-update:";

interface PersonSeed {
  name: string;
  organization: string;
  role: string;
  location: string;
  primaryIndustryId: IndustryIdCode;
  secondaryIndustryId: SecondaryIndustryIdCode;
  industryText: string;
  offering: string;
  seeking: string;
}

// 55 位虚构人物（姓名、公司均为合成；公司名带「（合成）」）。行业分布照顾计划里的两类需求：制造业试点客户与企业软件投资人。
const PEOPLE: readonly PersonSeed[] = [
  ["佐藤 美和", "北辰精密工業（合成）", "生産技術部 部長", "東京都大田区", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "精密加工", "产线自动化改造经验", "AI 质检试点方案"],
  ["高桥 健", "東海ロボティクス（合成）", "代表取締役", "名古屋市", "manufacturing_supply_chain", "manufacturing_supply_chain.robotics", "机器人", "机器人集成与客户现场", "软件合作伙伴"],
  ["林 雨辰", "青桐资本（合成）", "投资合伙人", "上海市", "finance_investment", "finance_investment.venture_capital", "风险投资", "早期企业软件投资", "制造业 AI 项目"],
  ["田中 翔", "みなと半導体（合成）", "品質保証部 マネージャー", "熊本市", "manufacturing_supply_chain", "manufacturing_supply_chain.semiconductors", "半导体", "缺陷样本与质检流程", "自动化检测工具"],
  ["陈 思远", "远帆创投（合成）", "副总裁", "深圳市", "finance_investment", "finance_investment.venture_capital", "风险投资", "跨境企业服务投资", "日本市场项目源"],
  ["山本 理沙", "さくら自動車部品（合成）", "DX 推進室 室長", "浜松市", "manufacturing_supply_chain", "manufacturing_supply_chain.automotive", "汽车零部件", "工厂数字化预算", "可落地的 AI 供应商"],
  ["Kim Jiwoo", "Hanbit Electronics (synthetic)", "Head of Smart Factory", "Seoul", "manufacturing_supply_chain", "manufacturing_supply_chain.electronics", "Electronics", "Smart factory roadmap", "Vision inspection vendors"],
  ["伊藤 大輔", "あおば製作所（合成）", "工場長", "仙台市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "设备制造", "试点产线", "低成本质检方案"],
  ["王 若琳", "星衡企业软件（合成）", "产品总监", "北京市", "technology_internet", "technology_internet.enterprise_software", "企业软件", "B2B 产品落地经验", "日本渠道伙伴"],
  ["渡边 光", "グリーンライン物流（合成）", "経営企画部 課長", "横浜市", "trade_logistics", "trade_logistics.other", "物流", "仓储自动化需求", "数据分析工具"],
  ["Emily Carter", "Northbridge Ventures (synthetic)", "Principal", "Singapore", "finance_investment", "finance_investment.venture_capital", "Venture capital", "Seed investments in industrial AI", "Founders in Japan"],
  ["中村 優", "ひかり化学（合成）", "研究開発部 主任", "大阪市", "manufacturing_supply_chain", "manufacturing_supply_chain.materials", "化学材料", "材料检测数据", "AI 分析合作"],
  ["李 明哲", "云栈科技（合成）", "解决方案架构师", "杭州市", "technology_internet", "technology_internet.enterprise_software", "企业软件", "私有化部署经验", "制造业客户"],
  ["小林 直人", "ことぶき機械（合成）", "営業部 部長", "京都市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "机械", "经销商网络", "联合销售伙伴"],
  ["张 晓雯", "安澜咨询（合成）", "合伙人", "上海市", "professional_services", "professional_services.management_consulting", "管理咨询", "制造业数字化咨询", "技术合作伙伴"],
  ["加藤 真一", "三河電機（合成）", "生産管理課 課長", "豊田市", "manufacturing_supply_chain", "manufacturing_supply_chain.electronics", "电机", "多品种小批量产线", "排产优化"],
  ["Daniel Park", "Seoul Angels (synthetic)", "Angel investor", "Seoul", "finance_investment", "finance_investment.venture_capital", "Angel investing", "Pre-seed checks", "B2B SaaS founders"],
  ["吉田 彩", "みらい食品（合成）", "品質管理部 マネージャー", "札幌市", "food_hospitality", "food_hospitality.food_production", "食品制造", "食品检测标准", "异物检测方案"],
  ["刘 子航", "鼎峰制造（合成）", "数字化部负责人", "苏州市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "装备制造", "工厂 IT 预算", "日本技术伙伴"],
  ["山田 拓也", "やまびこ工業（合成）", "技術顧問", "広島市", "manufacturing_supply_chain", "manufacturing_supply_chain.automotive", "汽车零部件", "工艺改进经验", "技术交流"],
  ["赵 欣怡", "海川基金（合成）", "投资经理", "香港", "finance_investment", "finance_investment.private_equity", "私募股权", "成长期项目判断", "日本制造业标的"],
  ["松本 恵", "東都エンジニアリング（合成）", "プロジェクトマネージャー", "東京都品川区", "professional_services", "professional_services.other", "工程服务", "工厂改造项目", "软件供应商"],
  ["Lucas Meyer", "Rheinwerk Automation (synthetic)", "Business Development Manager", "Munich", "manufacturing_supply_chain", "manufacturing_supply_chain.robotics", "Automation", "European plant contacts", "Japanese partners"],
  ["井上 智子", "なごみ製薬（合成）", "生産本部 次長", "富山市", "healthcare_life_sciences", "healthcare_life_sciences.pharmaceuticals", "制药", "GMP 产线经验", "数据合规方案"],
  ["孙 浩然", "智衡数据（合成）", "首席技术官", "成都市", "technology_internet", "technology_internet.ai_data", "AI 数据", "视觉模型训练", "工业数据集"],
  ["木村 涼", "つばさ精機（合成）", "社長室 室長", "静岡市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "精密设备", "家族企业决策链", "数字化合作"],
  ["周 雅", "晨星天使（合成）", "创始合伙人", "北京市", "finance_investment", "finance_investment.venture_capital", "天使投资", "早期项目资源", "AI 创始人"],
  ["清水 隆", "ミナミ鋳造（合成）", "製造部 係長", "福岡市", "manufacturing_supply_chain", "manufacturing_supply_chain.materials", "铸造", "铸件缺陷数据", "检测设备"],
  ["Sarah Nguyen", "Pacific Rim Capital (synthetic)", "Partner", "Ho Chi Minh City", "finance_investment", "finance_investment.venture_capital", "Venture capital", "Southeast Asia expansion", "Japanese B2B startups"],
  ["森 由紀", "しらかば電子（合成）", "購買部 部長", "長野市", "manufacturing_supply_chain", "manufacturing_supply_chain.electronics", "电子元件", "采购流程", "供应商评估工具"],
  ["黄 志强", "粤港智造（合成）", "总经理", "广州市", "manufacturing_supply_chain", "manufacturing_supply_chain.electronics", "电子制造", "代工厂资源", "质检升级"],
  ["池田 悠", "ハーバー法律事務所（合成）", "弁護士", "東京都千代田区", "professional_services", "professional_services.legal", "法律", "数据合规咨询", "科技客户"],
  ["橋本 美咲", "こもれび広告（合成）", "アカウントディレクター", "東京都渋谷区", "media_creative", "media_creative.advertising_marketing", "广告", "B2B 品牌传播", "新客户"],
  ["郑 凯", "前沿芯片（合成）", "工艺工程师", "无锡市", "manufacturing_supply_chain", "manufacturing_supply_chain.semiconductors", "半导体", "晶圆检测经验", "AI 工具"],
  ["石川 遼", "ほくりく繊維（合成）", "生産部 部長", "金沢市", "manufacturing_supply_chain", "manufacturing_supply_chain.materials", "纺织", "织物瑕疵样本", "检测自动化"],
  ["Olivia Brown", "Harborview Partners (synthetic)", "Investment Associate", "London", "finance_investment", "finance_investment.venture_capital", "Venture capital", "Industrial tech thesis", "Deal flow from Japan"],
  ["前田 和也", "まえだ金属（合成）", "専務取締役", "堺市", "manufacturing_supply_chain", "manufacturing_supply_chain.materials", "金属加工", "中小工厂视角", "简单易用的工具"],
  ["许 静", "知行教育科技（合成）", "运营总监", "南京市", "education_research", "education_research.edtech", "教育科技", "培训渠道", "企业培训合作"],
  ["藤田 直樹", "ふじた工機（合成）", "技術部 マネージャー", "新潟市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "机床", "设备数据接口", "联合开发"],
  ["岡田 さくら", "オカダ・ホテルズ（合成）", "経営企画マネージャー", "那覇市", "food_hospitality", "food_hospitality.hotels_tourism", "酒店", "多门店运营", "客户管理系统"],
  ["何 子轩", "合众供应链（合成）", "业务发展经理", "厦门市", "trade_logistics", "trade_logistics.other", "供应链", "跨境物流资源", "日本客户"],
  ["長谷川 誠", "はせがわ樹脂（合成）", "品質保証課 課長", "岐阜市", "manufacturing_supply_chain", "manufacturing_supply_chain.materials", "树脂成型", "成型缺陷数据", "检测方案"],
  ["Mia Tanaka-Lee", "Bay Area Industrial Fund (synthetic)", "Venture Partner", "San Francisco", "finance_investment", "finance_investment.venture_capital", "Venture capital", "US industrial AI network", "Japan-based founders"],
  ["村上 葵", "むらかみ電装（合成）", "生産技術課 主任", "宇都宮市", "manufacturing_supply_chain", "manufacturing_supply_chain.automotive", "汽车电装", "产线节拍数据", "改善工具"],
  ["马 骁", "骁腾机器人（合成）", "创始人", "深圳市", "manufacturing_supply_chain", "manufacturing_supply_chain.robotics", "机器人", "协作机器人方案", "日本合作伙伴"],
  ["近藤 美穂", "こんどう会計事務所（合成）", "税理士", "東京都新宿区", "professional_services", "professional_services.tax_accounting", "会计", "中小企业财务", "数字化工具"],
  ["坂本 健太", "さかもと造船（合成）", "設計部 部長", "長崎市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "造船", "大型焊接检测", "AI 检测试点"],
  ["韩 雪", "北辰医疗器械（合成）", "注册事务经理", "天津市", "healthcare_life_sciences", "healthcare_life_sciences.medical_devices", "医疗器械", "质量体系经验", "日本注册咨询"],
  ["遠藤 亮", "えんどう物産（合成）", "海外事業部 課長", "神戸市", "trade_logistics", "trade_logistics.other", "贸易", "东南亚渠道", "新品类"],
  ["Noah Wilson", "Granite Peak Capital (synthetic)", "Associate", "New York", "finance_investment", "finance_investment.private_equity", "Private equity", "Manufacturing roll-ups", "Operational tech"],
  ["青木 玲奈", "あおき印刷（合成）", "営業企画部 マネージャー", "埼玉県川口市", "media_creative", "media_creative.publishing_content", "印刷", "印刷质检流程", "自动检测"],
  ["杨 帆", "启航孵化器（合成）", "孵化经理", "上海市", "professional_services", "professional_services.startup_services", "创业服务", "创业社群", "优质项目"],
  ["西村 拓海", "にしむら鉄工（合成）", "代表取締役", "北九州市", "manufacturing_supply_chain", "manufacturing_supply_chain.materials", "钢铁加工", "老厂改造需求", "可靠的供应商"],
  ["徐 嘉怡", "嘉禾食品机械（合成）", "销售总监", "青岛市", "manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment", "食品机械", "设备客户网络", "日本代理"],
  ["原田 修", "はらだ技研（合成）", "技術開発室 室長", "つくば市", "education_research", "education_research.research_institutes", "研究机构", "视觉算法研究", "产业落地伙伴"],
].map(([name, organization, role, location, primaryIndustryId, secondaryIndustryId, industryText, offering, seeking]) => ({
  industryText: industryText!, location: location!, name: name!, offering: offering!, organization: organization!,
  primaryIndustryId: primaryIndustryId as IndustryIdCode, role: role!, secondaryIndustryId: secondaryIndustryId as SecondaryIndustryIdCode, seeking: seeking!,
}));

export interface VerifyNetworkContactFixture {
  index: number;
  tier: VerifyNetworkTier;
  contact: ContactDTO;
  connection: ConnectionDTO;
  evidence: RelationshipEvidenceDTO;
  person: PersonSeed;
}

export interface VerifyNetworkMemoFixture {
  contactId: string;
  noteId: string;
  body: string;
  createdAt: string;
  /** 东京日期 YYYY-MM-DD。 */
  occurredAt: string;
}

export interface VerifyNetworkFollowupFixture {
  id: string;
  contactId: string;
  connectionId: string;
  title: string;
  completedAt: string;
}

export interface VerifyNetworkScheduleFixture {
  id: string;
  kind: "meeting" | "event";
  title: string;
  startsAt: string;
  endsAt: string;
  contactIds: string[];
  /** event 才有（合成活动 id，带 orbit-verify- 标记，重置时随账号删除）。 */
  eventId?: string;
  meetingId?: string;
  location: string;
}

export interface VerifyNetworkFixtures {
  contacts: VerifyNetworkContactFixture[];
  memos: VerifyNetworkMemoFixture[];
  followups: VerifyNetworkFollowupFixture[];
  schedule: VerifyNetworkScheduleFixture[];
}

function key(actorId: string): string {
  return createHash("sha256").update(`verify-network:${actorId}`).digest("hex").slice(0, 10);
}

function tierOf(index: number): VerifyNetworkTier {
  const { core, active, dormant } = VERIFY_NETWORK_TIER_SIZES;
  if (index < core) return "core";
  if (index < core + active) return "active";
  if (index < core + active + dormant) return "dormant";
  return "new";
}

function tokyoDate(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 东京某日（相对 now 的天数）某整点。 */
function at(now: Date, daysAgo: number, hour: number): string {
  const date = tokyoDate(now.getTime() - daysAgo * DAY_MS);
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString();
}

const MEMO_TEMPLATES: readonly ((person: PersonSeed) => string)[] = [
  (person) => `和${person.name}聊了${person.industryText}现场的情况，对方提到「${person.seeking}」，愿意先看一页方案。`,
  (person) => `${person.name}介绍了${person.organization}今年的重点：${person.offering}。约定下次带演示视频过去。`,
  (person) => `活动后和${person.name}单独交流，对方对试点费用比较敏感，希望先做两周小范围验证。`,
];

/** 夹具（只依赖 actorId 与 now；同一天重复执行结果相同）。 */
export function buildVerifyNetworkFixtures(actorId: string, now: Date): VerifyNetworkFixtures {
  if (PEOPLE.length !== VERIFY_NETWORK_CONTACTS) throw new Error(`verify-network 夹具人数应为 ${VERIFY_NETWORK_CONTACTS}，实际 ${PEOPLE.length}。`);
  const prefix = key(actorId);
  const contacts: VerifyNetworkContactFixture[] = PEOPLE.map((person, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const tier = tierOf(index);
    const contactId = `orbit-contact-${prefix}-n${suffix}`;
    const connectionId = `orbit-connection-${prefix}-n${suffix}`;
    // 建立联系时间：核心／有往来 20～34 天前，待唤醒 110～124 天前，新认识 3～48 天前。
    const capturedDaysAgo = tier === "dormant" ? 110 + (index % 15) : tier === "new" ? 3 + ((index * 7) % 46) : 20 + (index % 15);
    const createdAt = at(now, capturedDaysAgo, 19);
    const byCard = index % 2 === 0;
    const source = {
      id: `orbit-source-${prefix}-n${suffix}`,
      label: byCard ? "名片导入（验收种子）" : "活动交换（验收种子）",
      type: byCard ? "business_card_ocr" : "event_import",
    } as const;
    const evidence: RelationshipEvidenceDTO = {
      confidence: 0.9,
      createdBy: actorId,
      id: `orbit-evidence-${prefix}-n${suffix}`,
      occurredAt: createdAt,
      sourceId: `${source.id}:capture`,
      sourceType: source.type,
      summary: byCard ? `交换名片：${person.organization}` : `活动上认识：${person.organization}`,
    };
    const email = `contact${suffix}@verify-network.example.test`;
    const contact: ContactDTO = {
      createdAt,
      displayName: person.name,
      evidenceIds: [evidence.id],
      handles: { email },
      id: contactId,
      location: person.location,
      organization: person.organization,
      personId: `orbit-person-${prefix}-n${suffix}`,
      primaryEmail: email,
      primaryIndustryId: person.primaryIndustryId,
      profileSnippet: `${person.organization}·${person.role}。${person.offering}。`,
      publicProfile: {
        bio: `${person.organization}的${person.role}，关注${person.industryText}。`,
        conversationPrompts: [],
        industry: person.industryText,
        offering: [person.offering],
        primaryIndustryId: person.primaryIndustryId,
        secondaryIndustryId: person.secondaryIndustryId,
        seeking: [person.seeking],
        selfIntroduction: "",
        topics: [person.industryText],
      },
      role: person.role,
      secondaryIndustryId: person.secondaryIndustryId,
      source,
      stage: tier === "new" ? "captured" : "active",
      updatedAt: createdAt,
    };
    const connection: ConnectionDTO = {
      accountId: actorId,
      businessRelevanceScore: 60,
      contactId,
      createdAt,
      evidenceIds: [evidence.id],
      id: connectionId,
      relationshipStrength: 50,
      sharedTopics: [person.industryText],
      source,
      stage: contact.stage,
      suggestedActions: [],
      summary: `${person.organization}·${person.role}`,
      trustLevel: tier === "core" ? "trusted" : tier === "new" ? "unverified" : "warm",
      updatedAt: createdAt,
      valueTypes: ["strategic_fit"],
    };
    return { connection, contact, evidence, index, person, tier };
  });

  const memos: VerifyNetworkMemoFixture[] = [];
  const addMemo = (fixture: VerifyNetworkContactFixture, daysAgo: number, template: number) => {
    const occurredMs = Date.parse(at(now, daysAgo, 20));
    memos.push({
      body: MEMO_TEMPLATES[template % MEMO_TEMPLATES.length]!(fixture.person),
      contactId: fixture.contact.id,
      createdAt: new Date(occurredMs).toISOString(),
      noteId: `${MEMO_NOTE_ID_PREFIX}verify-network-${fixture.index + 1}-${memos.length + 1}`,
      occurredAt: tokyoDate(occurredMs),
    });
  };
  const followups: VerifyNetworkFollowupFixture[] = [];
  const addFollowup = (fixture: VerifyNetworkContactFixture, daysAgo: number) => {
    followups.push({
      completedAt: at(now, daysAgo, 11),
      connectionId: fixture.connection.id,
      contactId: fixture.contact.id,
      id: `task:orbit-verify-network-followup-${fixture.index + 1}`,
      title: `给${fixture.person.name}发会后跟进`,
    });
  };
  const schedule: VerifyNetworkScheduleFixture[] = [];
  const addMeeting = (fixture: VerifyNetworkContactFixture, daysAgo: number, hour = 15) => {
    const startsAt = at(now, daysAgo, hour);
    const id = `schedule:orbit-verify-network-meeting-${fixture.index + 1}-${schedule.length + 1}`;
    schedule.push({
      contactIds: [fixture.contact.id],
      endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
      id,
      kind: "meeting",
      location: `${fixture.person.location}（合成地点）`,
      meetingId: `meeting:orbit-verify-network-${fixture.index + 1}-${schedule.length + 1}`,
      startsAt,
      title: `与${fixture.person.name}面谈`,
    });
  };

  const byTier = (tier: VerifyNetworkTier) => contacts.filter((fixture) => fixture.tier === tier);
  // 核心 8：两条 memo、已发生的约见、已完成跟进、同场活动 A（10 天前）。
  for (const fixture of byTier("core")) {
    addMemo(fixture, 3 + (fixture.index % 3), 0);
    addMemo(fixture, 8 + (fixture.index % 3), 1);
    addMeeting(fixture, 5 + (fixture.index % 4));
    addFollowup(fixture, 4 + (fixture.index % 3));
  }
  // 有往来 14：前 10 位一条 memo；全部有一次约见与同场活动 B（12 天前）；最后 2 位各一条已完成跟进。
  const active = byTier("active");
  active.forEach((fixture, position) => {
    if (position < 10) addMemo(fixture, 6 + (position % 5), 2);
    addMeeting(fixture, 9 + (position % 5));
    // 没有 memo 的 4 位再加一次更早的约见（不同东京日），保证落在「有往来」档。
    if (position >= 10) addMeeting(fixture, 16 + (position % 3), 10);
    if (position >= active.length - 2) addFollowup(fixture, 7 + position % 3);
  });
  // 待唤醒 8：约 100 天前热络（memo 或两次约见 + 同场活动 C），之后再无往来。
  byTier("dormant").forEach((fixture, position) => {
    if (position < 4) {
      addMemo(fixture, 100 + position, position);
      addMeeting(fixture, 98 + position);
    } else {
      addMeeting(fixture, 97 + position);
      addMeeting(fixture, 102 + position, 10);
    }
  });
  // 新认识：前 3 位各有一场未来约见（5 分、不衰减）。
  byTier("new").slice(0, 3).forEach((fixture, position) => addMeeting(fixture, -(3 + position)));

  const event = (id: string, title: string, daysAgo: number, tier: VerifyNetworkTier, location: string) => {
    const startsAt = at(now, daysAgo, 18);
    schedule.push({
      contactIds: byTier(tier).map((fixture) => fixture.contact.id),
      endsAt: new Date(Date.parse(startsAt) + 3 * 3_600_000).toISOString(),
      eventId: id,
      id: `schedule:${id}`,
      kind: "event",
      location,
      startsAt,
      title,
    });
  };
  event("orbit-verify-network-event-a", "验收用：制造业 AI 落地分享会", 10, "core", "东京·大手町（合成会场）");
  event("orbit-verify-network-event-b", "验收用：企业软件与投资人交流会", 12, "active", "东京·六本木（合成会场）");
  event("orbit-verify-network-event-c", "验收用：智能工厂年会", 105, "dormant", "名古屋（合成会场）");

  if (memos.length !== VERIFY_NETWORK_MEMOS) throw new Error(`verify-network memo 数应为 ${VERIFY_NETWORK_MEMOS}，实际 ${memos.length}。`);
  if (followups.length !== VERIFY_NETWORK_FOLLOWUPS) throw new Error(`verify-network 已完成跟进数应为 ${VERIFY_NETWORK_FOLLOWUPS}，实际 ${followups.length}。`);
  return { contacts, followups, memos, schedule };
}
