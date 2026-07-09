import type {
  ContactDetailSourceReference,
  ContactDetailStatusOption,
} from "../../../../../features/contacts/detail-contract";
import type {
  AppContactDetailSuccessModel,
} from "./contact-detail-route-service";
import type {
  OrbitContactEncounterView,
  OrbitContactNoteView,
  OrbitContactPipelineStatus,
  OrbitContactsViewModel,
  OrbitContactStrength,
  OrbitContactView,
} from "../../orbit-contacts-route-view-model";
import type { OrbitLanguage } from "../../orbit-language-core";

function strengthFromScore(score: number): OrbitContactStrength {
  if (score >= 75) {
    return "strong";
  }

  if (score >= 45) {
    return "medium";
  }

  if (score >= 20) {
    return "weak";
  }

  return "dormant";
}

function pipelineStatusFor(
  status: ContactDetailStatusOption,
): OrbitContactPipelineStatus {
  if (status === "needs_follow_up") {
    return "to_contact";
  }

  if (status === "archived") {
    return "partnered";
  }

  return "in_progress";
}

function sourceFor(
  source: ContactDetailSourceReference,
): OrbitContactView["source"] {
  if (source.type === "qr_scan") {
    return "scan";
  }

  return source.type === "manual" ? "manual" : "exchange";
}

const relationshipTokenLabels: Record<"en" | "zh", Record<string, string>> = {
  en: {
    commercial_opportunity: "commercial opportunity",
    community_context: "community context",
    cross_border_ecommerce: "cross-border ecommerce",
    knowledge_exchange: "knowledge exchange",
    referral_path: "referral path",
    retail_omnichannel: "retail omnichannel",
    strategic_fit: "strategic fit",
    venture_capital: "investment interest",
  },
  zh: {
    commercial_opportunity: "商业机会",
    community_context: "社群上下文",
    cross_border_ecommerce: "跨境电商",
    knowledge_exchange: "知识交换",
    referral_path: "引荐路径",
    retail_omnichannel: "零售全渠道",
    strategic_fit: "战略契合",
    venture_capital: "投资意向",
  },
};

const relationshipPhraseLabels: Record<"en" | "zh", readonly [RegExp, string][]> = {
  en: [
    [/relationship context for\s*/gi, "Relationship context: "],
    [/investment interest/gi, "investment interest"],
    [/community context/gi, "community context"],
    [/referral path/gi, "referral path"],
    [/investor warm intro for seed fundraising/gi, "investor warm intro for seed fundraising"],
    [/event table matching and sponsor visibility/gi, "event table matching and sponsor visibility"],
    [/event table matching/gi, "event table matching"],
    [/next action/gi, "next action"],
  ],
  zh: [
    // Full-sentence relationship-record templates (must run before the standalone
    // source-label patterns below so the whole sentence is rewritten cleanly).
    [/(.+?) has a concrete current-user relationship record from Confirmed offline meeting note for .+?\.?$/gi, "与 $1 有一次已确认的线下见面记录。"],
    [/(.+?) has a concrete current-user relationship record from Direct QR scan for .+?\.?$/gi, "通过现场扫码与 $1 建立了联系记录。"],
    [/(.+?) has a concrete current-user relationship record from Warm referral for .+?\.?$/gi, "经人引荐与 $1 建立了联系记录。"],
    [/(.+?) has a concrete current-user relationship record from Business card exchange for .+?\.?$/gi, "与 $1 交换名片并建立了联系记录。"],
    [/(.+?) has a concrete current-user relationship record from .+?\.?$/gi, "与 $1 已建立有据可查的联系记录。"],
    // Business interest / offer / topic phrases (seed intents), longest first so
    // longer phrases win. Substring replace so they work standalone (topics) and
    // embedded in the '与「X」匹配，依据：Y' match sentences.
    [/AI workflow PoC buyer in Japanese SMB manufacturing/gi, "日本中小制造业的 AI 流程 PoC 买家"],
    [/trusted tax and incorporation advisor for Japan entry/gi, "日本落地可信赖的税务与设立顾问"],
    [/Japan market entry advisor for China SaaS sales/gi, "中国 SaaS 进入日本市场顾问"],
    [/hands-on D2C cross-border logistics and payments/gi, "D2C 跨境物流与支付实操"],
    [/event sponsor with Chinese business-community reach/gi, "触达华人商业社群的活动赞助商"],
    [/seed investor screening and founder feedback/gi, "种子投资人筛选与创始人反馈"],
    [/manufacturing DX requirements and buyer feedback/gi, "制造业数字化需求与买家反馈"],
    [/bilingual Xiaohongshu inbound campaign partner/gi, "双语小红书获客合作伙伴"],
    [/restaurant reservation CRM integration pilot/gi, "餐饮预约 CRM 集成试点"],
    [/semiconductor supply-chain sourcing lead/gi, "半导体供应链采购负责人"],
    [/investor warm intro for seed fundraising/gi, "种子轮融资的投资人暖介绍"],
    [/retail live[- ]commerce distribution partner/gi, "零售直播电商分销伙伴"],
    [/Mandarin Japanese community marketing channel/gi, "中日双语社群营销渠道"],
    [/partner channel introductions in Kansai/gi, "关西合作渠道介绍"],
    [/D2C brand overseas-expansion partner/gi, "D2C 品牌出海合作伙伴"],
    [/cross-border ecommerce launch playbook/gi, "跨境电商启动手册"],
    [/ask the introducer for permission before creating a contact/gi, "建联前先征得引荐人同意"],
    [/review source evidence before follow-up/gi, "跟进前先核对来源证据"],
    [/Tokyo restaurant operator test site/gi, "东京餐饮门店试点场地"],
    [/follow-up message localization/gi, "跟进消息多语言本地化"],
    [/bilingual sales deck review/gi, "双语销售材料评审"],
    [/tourism and hospitality/gi, "旅游与酒店"],
    [/restaurant_inbound/gi, "餐饮入境客"],
    [/legal_accounting/gi, "法律与财务"],
    [/venture_capital/gi, "风险投资"],
    [/ai_saas/gi, "AI 与 SaaS"],
    // Standalone source labels (for the "认识来源 / 认识于" field).
    [/Confirmed offline meeting note for\s*/gi, "线下见面确认："],
    [/Warm referral for\s*/gi, "引荐认识："],
    [/Business card exchange for\s*/gi, "名片交换："],
    [/QR scan for\s*/gi, "QR 扫码："],
    [/QR scan at\s*/gi, "QR 扫码："],
    [/Direct QR scan for\s*/gi, "直接 QR 扫码："],
    [/commercial opportunity/gi, "商业机会"],
    [/relationship context for\s*/gi, "关系背景："],
    [/investment interest/gi, "投资意向"],
    [/community context/gi, "社群上下文"],
    [/referral path/gi, "引荐路径"],
    [/investor warm intro for seed fundraising/gi, "种子轮融资投资人引荐"],
    [/event table matching and sponsor visibility/gi, "活动桌匹配与赞助曝光"],
    [/event table matching/gi, "活动桌匹配"],
    [/next action/gi, "下一步"],
    [/Store Owner/gi, "门店经营者"],
    [/Community Organizer/gi, "社群组织者"],
    [/Investor Partner/gi, "投资合伙人"],
    [/DX Consultant/gi, "DX 顾问"],
    [/Marketing Lead/gi, "市场负责人"],
    [/Product Manager/gi, "产品经理"],
    [/Sales Director/gi, "销售总监"],
    [/Founder CEO/gi, "创始人 CEO"],
    [/Founder/gi, "创始人"],
    [/review evidence before follow-up/gi, "跟进前先核对证据"],
    // Company names (run last so multi-word roles/phrases above win first).
    // Prefix patterns keep the trailing space so "Aoba Partners" -> "青叶合伙".
    [/North Star /gi, "北星"],
    [/Morning Light /gi, "晨光"],
    [/Blue Harbor /gi, "蓝港"],
    [/Bamboo Grove /gi, "竹林"],
    [/Red Bridge /gi, "红桥"],
    [/Aoba /gi, "青叶"],
    [/Yokohama /gi, "横滨"],
    [/Kansai /gi, "关西"],
    [/Umeda /gi, "梅田"],
    [/Cedar /gi, "雪松"],
    [/Nanshan /gi, "南山"],
    [/Ginza /gi, "银座"],
    [/Foods\b/g, "食品"],
    [/Technologies\b/g, "科技"],
    [/Partners\b/g, "合伙"],
    [/Capital\b/g, "资本"],
    [/Community\b/g, "社群"],
  ],
};

// 联系人标签是 `前缀:值` token（如 topic:storage-pilots）。展示端只显示可读的值，
// 已知值给出中/英文案，未知值回退到把连字符换成空格。
const tagValueLabels: Record<string, Record<string, string>> = {
  en: {
    "warm-follow-up": "warm follow-up",
    nurture: "nurture",
    "climate-founders-dinner": "climate founders dinner",
    "storage-pilots": "storage pilots",
    community: "community",
    "venture-ecosystem": "venture ecosystem",
    "external-import": "external import",
    "event-import": "event import",
  },
  zh: {
    "warm-follow-up": "热跟进",
    nurture: "待培育",
    "climate-founders-dinner": "气候创始人晚宴",
    "storage-pilots": "储能试点",
    community: "社群",
    "venture-ecosystem": "创投生态",
    "external-import": "外部导入",
    "event-import": "活动导入",
  },
};

function tagLabel(tag: string, language: OrbitLanguage): string {
  const value = tag.includes(":") ? tag.slice(tag.indexOf(":") + 1) : tag;

  return tagValueLabels[language === "ja" ? "en" : language]?.[value] ?? value.replace(/[-_]+/g, " ");
}

function scriptCounts(text: string): { han: number; kana: number; latin: number } {
  return {
    han: (text.match(/\p{Script=Han}/gu) ?? []).length,
    kana: (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? [])
      .length,
    latin: (text.match(/[A-Za-z]/g) ?? []).length,
  };
}

function segmentMatchesLanguage(
  segment: string,
  language: OrbitLanguage,
): boolean {
  const { han, kana, latin } = scriptCounts(segment);

  if (language === "zh") {
    return han > 0 && kana === 0 && han >= latin;
  }

  return latin > 0 && kana === 0 && latin >= han;
}

function displaySegment(value: string, language: OrbitLanguage): string {
  const segments = value
    .split(/\s*\/\s*/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return value;
  }

  return (
    segments.find((segment) => segmentMatchesLanguage(segment, language)) ??
    value
  );
}

function displayText(value: string, language: OrbitLanguage): string {
  const langKey = language === "ja" ? "en" : language;
  const localizedValue = displaySegment(value, language);
  const withoutRawTokens = localizedValue.replace(/\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/g, (token) =>
    relationshipTokenLabels[langKey][token] ?? token.replace(/[_-]+/g, " "),
  );
  const withLabels = relationshipPhraseLabels[langKey].reduce(
    (copy, [pattern, replacement]) => copy.replace(pattern, replacement),
    withoutRawTokens,
  );
  const matchTemplate = withLabels.match(
    /^(.+?)\s+matches\s+(.+?)\s+through\s+(.+?)\.?$/i,
  );

  if (!matchTemplate) {
    return withLabels;
  }

  if (language === "zh") {
    return `${matchTemplate[1]} 与「${matchTemplate[2]}」匹配，依据：${matchTemplate[3]}。`;
  }

  return `${matchTemplate[1]} matches ${matchTemplate[2]} through ${matchTemplate[3]}.`;
}

function displayTexts(values: readonly string[], language: OrbitLanguage): string[] {
  return values.map((value) => displayText(value, language));
}

function sameDisplayCopy(left: string, right: string): boolean {
  return (
    left.replace(/\s+/g, " ").trim() ===
    right.replace(/\s+/g, " ").trim()
  );
}

function eventIdFor(model: AppContactDetailSuccessModel): string {
  const eventSource = model.connection.sourceLinks.find(
    (source) => source.type === "event_import",
  );

  if (eventSource?.id) {
    return eventSource.id;
  }

  if (model.contact.lastInteraction.source.id.startsWith("source:")) {
    return model.contact.lastInteraction.source.label;
  }

  return (
    model.contact.lastInteraction.source.id ??
    model.connection.sourceLinks[0]?.id ??
    "live-relationship-source"
  );
}

function eventNameFor(
  model: AppContactDetailSuccessModel,
  eventId: string,
): string {
  return (
    model.connection.sourceLinks.find((source) => source.type === "event_import")
      ?.label ??
    model.contact.lastInteraction.source.label ??
    model.contact.source.label ??
    model.connection.sourceLinks.find((source) => source.id === eventId)?.label ??
    model.connection.sourceLinks[0]?.label ??
    eventId
  );
}

function noteViews(
  model: AppContactDetailSuccessModel,
  language: OrbitLanguage,
): OrbitContactNoteView[] {
  const sourceNotes = model.contact.notes.map((note) => ({
    body: displayText(note.body, language),
    createdAt: note.createdAt,
    id: note.noteId,
  }));

  if (sourceNotes.length > 0) {
    return sourceNotes;
  }

  return model.evidenceTimeline.slice(0, 3).map((item) => ({
    body: displayText(item.excerpt, language),
    createdAt: item.occurredAt,
    id: item.evidenceId,
  }));
}

function encounterFor(
  model: AppContactDetailSuccessModel,
  eventId: string,
  language: OrbitLanguage,
): OrbitContactEncounterView {
  const profile = model.contact.publicProfile;
  const bio = displayText(profile.bio, language);
  const intro = displayText(profile.selfIntroduction, language);

  return {
    context: {
      metAt:
        model.contact.lastInteraction.occurredAt ||
        model.connection.lastTouchedAt ||
        model.contact.updatedAt,
      publicProfile: {
        bio,
        conversationPrompts: displayTexts(profile.conversationPrompts, language),
        industry: displayText(profile.industry, language),
        intro: sameDisplayCopy(bio, intro) ? "" : intro,
        offering: displayTexts(profile.offering, language),
        seeking: displayTexts(profile.seeking, language),
        topics: displayTexts(profile.topics, language),
      },
      reason:
        displayText(
          model.contact.relationshipContext ||
            model.connection.connectionReason ||
            model.assessment.rationale.summary,
          language,
        ),
      score:
        model.assessment.priorityScore.value || model.connection.strengthScore,
      tableNo: 0,
    },
    createdAt: model.connection.lastTouchedAt || model.contact.updatedAt,
    eventId,
    id: `encounter:${model.connection.id}`,
  };
}

export function contactDetailRouteToOrbitContactsViewModel(
  model: AppContactDetailSuccessModel,
  language: OrbitLanguage = "zh",
): OrbitContactsViewModel {
  const eventId = eventIdFor(model);
  const eventName = displayText(eventNameFor(model, eventId), language);
  const notes = noteViews(model, language);
  const contact: OrbitContactView = {
    company: model.contact.organization,
    displayName: model.contact.displayName,
    email: "",
    encounters: [encounterFor(model, eventId, language)],
    g: "g-violet",
    id: model.contact.id,
    industry: displayText(model.contact.publicProfile.industry, language),
    initial:
      model.contact.displayName.trim().slice(0, 1).toUpperCase() ||
      model.contact.id.slice(0, 1).toUpperCase(),
    lastEventId: eventId,
    lineId: "",
    location: displayText(model.contact.location, language),
    met: displayText(model.contact.source.label, language),
    note:
      displayText(
        model.contact.relationshipContext ||
          model.connection.connectionReason ||
          model.assessment.rationale.summary,
        language,
      ),
    notes,
    offering: displayTexts(model.contact.publicProfile.offering, language).join(", "),
    phone: "",
    pipelineStatus: pipelineStatusFor(model.contact.status),
    seeking: displayTexts(model.contact.publicProfile.seeking, language).join(", "),
    source: sourceFor(model.contact.source),
    stage: model.contact.status,
    title: displayText(model.contact.role, language),
    wechat: "",
    strength: strengthFromScore(
      model.assessment.priorityScore.value || model.connection.strengthScore,
    ),
    valueTags: model.contact.tags.map((tag) => tagLabel(tag, language)),
    nextAction: model.contact.nextAction
      ? {
          text: displayText(model.contact.nextAction, language),
          reason: displayText(
            model.contact.lastInteraction.summary ||
              model.contact.relationshipContext,
            language,
          ),
          evidenceId: model.contact.lastInteraction.evidenceIds[0],
        }
      : null,
    lastInteraction: displayText(
      model.contact.lastInteraction.summary,
      language,
    ),
    dormant: false,
  };

  return {
    connections: [contact],
    events: [
      {
        id: eventId,
        name: eventName,
      },
    ],
    intros: [],
    pipelineStatuses: [
      { value: "to_contact", label: "待联系" },
      { value: "in_progress", label: "在推进" },
      { value: "partnered", label: "已合作" },
    ],
  };
}
