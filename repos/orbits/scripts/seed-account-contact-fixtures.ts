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

function timestampFor(index: number): string {
  return new Date(Date.UTC(2026, 6, 26 - index * 3, 9, 30)).toISOString();
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
    const evidenceId = `test-evidence-${key}-${suffix}`;
    const timestamp = timestampFor(index);
    const source = {
      type: fixture.sourceType,
      id: `test-source-${key}-${suffix}`,
      label: fixture.sourceLabel,
    } as const;
    const evidence: RelationshipEvidenceDTO = {
      id: evidenceId,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      summary: fixture.summary,
      occurredAt: timestamp,
      confidence: 0.9,
      createdBy: actor.id,
    };
    const contact: ContactDTO = {
      id: contactId,
      personId: `test-person-${key}-${suffix}`,
      displayName: fixture.displayName,
      organization: fixture.organization,
      role: fixture.role,
      location: fixture.location,
      primaryEmail: fixture.email,
      profileSnippet: fixture.summary,
      stage: fixture.stage,
      handles: { email: fixture.email },
      publicProfile: {
        bio: fixture.summary,
        industry: fixture.industry,
        offering: fixture.sharedTopics.slice(0, 2),
        seeking: [fixture.nextAction],
        topics: fixture.sharedTopics,
        conversationPrompts: [fixture.nextAction],
      },
      networkCategory: fixture.networkCategory,
      nextAction: {
        text: fixture.nextAction,
        reason: fixture.summary,
        evidenceId,
      },
      source,
      evidenceIds: [evidenceId],
      createdAt: timestamp,
      updatedAt: timestamp,
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
      evidenceIds: [evidenceId],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "evidence",
      recordId: evidenceId,
      userId: actor.id,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      evidenceIds: [evidenceId],
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lifecycleState: "active",
      searchText: `${fixture.displayName} ${fixture.summary}`,
      payload: evidence as unknown as Record<string, unknown>,
    });
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
      evidenceIds: [evidenceId],
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lifecycleState: "active",
      searchText: [
        fixture.displayName,
        fixture.organization,
        fixture.role,
        fixture.location,
        fixture.industry,
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
      evidenceIds: [evidenceId],
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
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
      fixtureSet: `account-network-${key}`,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Contact fixture seeding failed.");
  process.exitCode = 1;
});
