import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../../../../shared/domain/industries";
import { hasPendingInitialization } from "../contact-relationship-initialization-view-model";
import { PIPELINE_STATUS_LABELS, pipelineStatusOptions } from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { CONTACT_DETAIL_TAG_OPTIONS } from "../../../../../features/contacts/detail-contract";
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
    return "archived";
  }

  return "in_progress";
}

function sourceFor(
  source: ContactDetailSourceReference,
): OrbitContactView["source"] {
  if (source.type === "qr_scan") {
    return "qr";
  }

  if (source.type === "business_card_ocr") return "scan";
  if (source.type === "event_import") return "event";
  if (source.type === "external_contacts") return "contact";
  if (source.type === "referral") return "referral";
  return source.type === "manual" ? "manual" : "exchange";
}

const relationshipTokenLabels: Record<OrbitLanguage, Record<string, string>> = {
  ja: {
    commercial_opportunity: "商談機会",
    community_context: "コミュニティの文脈",
    cross_border_ecommerce: "越境 EC",
    knowledge_exchange: "知見の交換",
    referral_path: "紹介ルート",
    retail_omnichannel: "小売のオムニチャネル",
    strategic_fit: "戦略的な相性",
    venture_capital: "投資の関心",
  },
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

const relationshipPhraseLabels: Record<OrbitLanguage, readonly [RegExp, string][]> = {
  // 与 zh 同一组规则、同样的先后顺序（整句模板在前，长短语先于短语，公司名最后）。
  ja: [
    [/(.+?) has a concrete current-user relationship record from Confirmed offline meeting note for .+?\.?$/gi, "$1 との対面の記録が確認されています。"],
    [/(.+?) has a concrete current-user relationship record from Direct QR scan for .+?\.?$/gi, "現地の QR スキャンで $1 とつながりました。"],
    [/(.+?) has a concrete current-user relationship record from Warm referral for .+?\.?$/gi, "紹介を通じて $1 とつながりました。"],
    [/(.+?) has a concrete current-user relationship record from Business card exchange for .+?\.?$/gi, "$1 と名刺を交換し、つながりを記録しました。"],
    [/(.+?) has a concrete current-user relationship record from .+?\.?$/gi, "$1 とのつながりが記録されています。"],
    [/AI workflow PoC buyer in Japanese SMB manufacturing/gi, "日本の中小製造業で AI 業務フローの PoC を導入する買い手"],
    [/trusted tax and incorporation advisor for Japan entry/gi, "日本進出のための信頼できる税務・会社設立アドバイザー"],
    [/Japan market entry advisor for China SaaS sales/gi, "中国 SaaS の日本市場参入アドバイザー"],
    [/hands-on D2C cross-border logistics and payments/gi, "D2C の越境物流・決済の実務"],
    [/event sponsor with Chinese business-community reach/gi, "華人ビジネスコミュニティに届くイベントスポンサー"],
    [/seed investor screening and founder feedback/gi, "シード投資家の選定と創業者へのフィードバック"],
    [/manufacturing DX requirements and buyer feedback/gi, "製造業 DX のニーズと買い手の声"],
    [/bilingual Xiaohongshu inbound campaign partner/gi, "バイリンガルの小紅書集客パートナー"],
    [/restaurant reservation CRM integration pilot/gi, "飲食店予約 CRM 連携の試験導入"],
    [/semiconductor supply-chain sourcing lead/gi, "半導体サプライチェーンの調達担当"],
    [/investor warm intro for seed fundraising/gi, "シード資金調達のための投資家紹介"],
    [/retail live[- ]commerce distribution partner/gi, "小売ライブコマースの販売パートナー"],
    [/Mandarin Japanese community marketing channel/gi, "中国語・日本語のコミュニティマーケティング窓口"],
    [/partner channel introductions in Kansai/gi, "関西での販路パートナーの紹介"],
    [/D2C brand overseas-expansion partner/gi, "D2C ブランドの海外展開パートナー"],
    [/cross-border ecommerce launch playbook/gi, "越境 EC 立ち上げの手引き"],
    [/ask the introducer for permission before creating a contact/gi, "連絡先を作る前に紹介者の了承を得る"],
    [/review source evidence before follow-up/gi, "フォローの前に出どころを確認"],
    [/Tokyo restaurant operator test site/gi, "東京の飲食店の試験導入先"],
    [/follow-up message localization/gi, "フォローメッセージの多言語化"],
    [/bilingual sales deck review/gi, "バイリンガル営業資料のレビュー"],
    [/tourism and hospitality/gi, "観光・ホスピタリティ"],
    [/restaurant_inbound/gi, "飲食インバウンド"],
    [/legal_accounting/gi, "法務・会計"],
    [/venture_capital/gi, "ベンチャーキャピタル"],
    [/ai_saas/gi, "AI・SaaS"],
    [/Confirmed offline meeting note for\s*/gi, "対面で確認："],
    [/Warm referral for\s*/gi, "紹介："],
    [/Business card scan/gi, "名刺スキャン"],
    [/Business card exchange for\s*/gi, "名刺交換："],
    [/QR scan for\s*/gi, "QR スキャン："],
    [/QR scan at\s*/gi, "QR スキャン："],
    [/Direct QR scan for\s*/gi, "直接 QR スキャン："],
    [/commercial opportunity/gi, "商談機会"],
    [/relationship context for\s*/gi, "関係の背景："],
    [/investment interest/gi, "投資の関心"],
    [/community context/gi, "コミュニティの文脈"],
    [/referral path/gi, "紹介ルート"],
    [/investor warm intro for seed fundraising/gi, "シード資金調達のための投資家紹介"],
    [/event table matching and sponsor visibility/gi, "イベントのテーブルマッチングとスポンサー露出"],
    [/event table matching/gi, "イベントのテーブルマッチング"],
    [/next action/gi, "次のアクション"],
    [/Store Owner/gi, "店舗オーナー"],
    [/Community Organizer/gi, "コミュニティ主催者"],
    [/Investor Partner/gi, "投資パートナー"],
    [/DX Consultant/gi, "DX コンサルタント"],
    [/Marketing Lead/gi, "マーケティング責任者"],
    [/Product Manager/gi, "プロダクトマネージャー"],
    [/Sales Director/gi, "営業ディレクター"],
    [/Founder CEO/gi, "創業者 CEO"],
    [/Founder/gi, "創業者"],
    [/review evidence before follow-up/gi, "フォローの前に根拠を確認"],
    // 公司名与 orbit-contacts-presentation.ts 的日文写法一致。
    [/North Star /gi, "ノーススター"],
    [/Morning Light /gi, "モーニングライト"],
    [/Blue Harbor /gi, "ブルーハーバー"],
    [/Bamboo Grove /gi, "バンブーグローブ"],
    [/Red Bridge /gi, "レッドブリッジ"],
    [/Aoba /gi, "青葉"],
    [/Yokohama /gi, "横浜"],
    [/Kansai /gi, "関西"],
    [/Umeda /gi, "梅田"],
    [/Cedar /gi, "シダー"],
    [/Nanshan /gi, "南山"],
    [/Ginza /gi, "銀座"],
    [/Foods\b/g, "フーズ"],
    [/Technologies\b/g, "テクノロジー"],
    [/Partners\b/g, "パートナーズ"],
    [/Capital\b/g, "キャピタル"],
    [/Community\b/g, "コミュニティ"],
  ],
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
    [/Business card scan/gi, "名片扫描"],
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

// 已知系统标签显示可读名称；用户自定义文字保留原样，不拆前缀或改写标点。
const tagValueLabels: Record<OrbitLanguage, Record<string, string>> = {
  ja: {
    "warm-follow-up": "温度の高いフォロー",
    nurture: "関係を育てる",
    "climate-founders-dinner": "気候テック創業者ディナー",
    "storage-pilots": "蓄電の実証",
    community: "コミュニティ",
    "venture-ecosystem": "スタートアップ・エコシステム",
    "business-card": "名刺",
    "external-import": "外部から取り込み",
    "event-import": "イベントから取り込み",
  },
  en: {
    "warm-follow-up": "warm follow-up",
    nurture: "nurture",
    "climate-founders-dinner": "climate founders dinner",
    "storage-pilots": "storage pilots",
    community: "community",
    "venture-ecosystem": "venture ecosystem",
    "business-card": "business card",
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
    "business-card": "名片来源",
    "external-import": "外部导入",
    "event-import": "活动导入",
  },
};

export function tagLabel(tag: string, language: OrbitLanguage): string {
  if (!(CONTACT_DETAIL_TAG_OPTIONS as readonly string[]).includes(tag)) return tag;
  const value = tag.includes(":") ? tag.slice(tag.indexOf(":") + 1) : tag;

  return tagValueLabels[language]?.[value] ?? value.replace(/[-_]+/g, " ");
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

export function displayText(value: string, language: OrbitLanguage): string {
  const langKey = language;
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

  return ({
    ja: `${matchTemplate[1]} は「${matchTemplate[2]}」に合います。根拠：${matchTemplate[3]}。`,
    zh: `${matchTemplate[1]} 与「${matchTemplate[2]}」匹配，依据：${matchTemplate[3]}。`,
    en: `${matchTemplate[1]} matches ${matchTemplate[2]} through ${matchTemplate[3]}.`,
  })[language];
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

// 活动只能来自数据里真的有活动的来源。此前这里一路回落到 lastInteraction /
// contact.source，于是名片扫描进来的人也被安上一场「活动」，活动名就是来源标签
// ——列表页是按 event_import 过滤的，详情页没有，两边对不上。
//
// 唯一的例外是现场扫码：sourceLabelFor 会把它规范成 "QR scan at <活动名>"
// （对人扫码则是 "QR scan for <人名>"），前者的活动名确实存在于来源数据里，
// 保留；后者和名片扫描一样，没有活动。
const QR_SCAN_AT_EVENT = /^QR scan at\s+(.+)$/i;

function qrScanEventName(model: AppContactDetailSuccessModel): string {
  if (model.contact.source.type !== "qr_scan") {
    return "";
  }

  return model.contact.source.label?.match(QR_SCAN_AT_EVENT)?.[1]?.trim() ?? "";
}

function eventIdFor(model: AppContactDetailSuccessModel): string {
  const eventSource = model.connection?.sourceLinks.find(
    (source) => source.type === "event_import",
  );

  if (eventSource?.id) {
    return eventSource.id;
  }

  if (model.contact.source.type === "event_import") {
    return model.contact.source.id;
  }

  // 用人类可读的来源标签而不是 source:qr_scan:xxx 这类内部 token——它会进入
  // encounter.eventId 并被展示层拼进可见文本。
  return qrScanEventName(model) ? (model.contact.source.label ?? "") : "";
}

// 活动名只能来自活动来源本身或现场扫码标签里真实带出的活动名，
// 不能拿最近互动或任意来源标签冒充。
function eventNameFor(
  model: AppContactDetailSuccessModel,
  eventId: string,
): string {
  if (!eventId) {
    return "";
  }

  return (
    model.connection?.sourceLinks.find((source) => source.type === "event_import")
      ?.label ??
    model.connection?.sourceLinks.find((source) => source.id === eventId)?.label ??
    (model.contact.source.type === "event_import"
      ? model.contact.source.label
      : model.contact.source.label) ??
    eventId
  );
}

function noteViews(
  model: AppContactDetailSuccessModel,
  language: OrbitLanguage,
): OrbitContactNoteView[] {
  const sourceNotes = model.contact.notes.map((note) => ({
    body: note.privacy === "private" ? note.body : displayText(note.body, language),
    createdAt: note.createdAt,
    id: note.privacy === "private" ? note.noteId : note.evidenceIds[0] ?? note.noteId,
    privacy: note.privacy,
    sourceLabel: note.sourceLabel,
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
  industry: string,
): OrbitContactEncounterView {
  const profile = model.contact.publicProfile;
  const bio = displayText(profile.bio, language);
  const intro = displayText(profile.selfIntroduction, language);

  return {
    context: {
      metAt:
        model.contact.lastInteraction.occurredAt ||
        model.connection?.lastTouchedAt ||
        model.contact.updatedAt,
      publicProfile: {
        bio,
        conversationPrompts: displayTexts(profile.conversationPrompts, language),
        industry,
        intro: sameDisplayCopy(bio, intro) ? "" : intro,
        offering: displayTexts(profile.offering, language),
        seeking: displayTexts(profile.seeking, language),
        topics: displayTexts(profile.topics, language),
        // W0060：三栏只显示真实值、推测条目弱化显示（来源与回退标记原样下发）。
        ...(profile.fieldSources ? { fieldSources: { ...profile.fieldSources } } : {}),
        ...(profile.fallbackFields?.length ? { fallbackFields: [...profile.fallbackFields] } : {}),
      },
      reason:
        displayText(
          model.contact.relationshipContext ||
            model.connection?.connectionReason ||
            model.assessment?.rationale.summary ||
            model.contact.source.label,
          language,
        ),
      score:
        model.assessment?.priorityScore.value ||
        model.connection?.strengthScore ||
        0,
      tableNo: 0,
    },
    createdAt: model.connection?.lastTouchedAt || model.contact.updatedAt,
    eventId,
    id: `encounter:${model.connection?.id ?? model.contact.id}`,
  };
}

export function contactDetailRouteToOrbitContactsViewModel(
  model: AppContactDetailSuccessModel,
  language: OrbitLanguage = "zh",
): OrbitContactsViewModel {
  const pending = hasPendingInitialization(model.contact) || (model.connection !== null && model.connection !== undefined && hasPendingInitialization(model.connection));
  const eventId = eventIdFor(model);
  const eventName = displayText(eventNameFor(model, eventId), language);
  const notes = noteViews(model, language);
  const industry = isIndustryIdCode(model.contact.primaryIndustryId)
    ? industryLabel(model.contact.primaryIndustryId, language)
    : model.contact.primaryIndustryLabel?.trim() ?? "";
  const contact: OrbitContactView = {
    company: model.contact.organization,
    displayName: model.contact.displayName,
    email: model.contact.primaryEmail ?? "",
    encounters: [encounterFor(model, eventId, language, industry)],
    g: "g-violet",
    id: model.contact.id,
    industry,
    primaryIndustryId: model.contact.primaryIndustryId,
    secondaryIndustryId: model.contact.secondaryIndustryId,
    secondaryIndustryLabel: model.contact.secondaryIndustryId ? secondaryIndustryLabel(model.contact.secondaryIndustryId, language) : undefined,
    ...(model.contact.seniorityLevel ? { seniorityLevel: model.contact.seniorityLevel } : {}),
    ...(model.contact.region ? { region: { countryCode: model.contact.region.countryCode, city: model.contact.region.city } } : {}),
    ...(model.contact.enrichment
      ? { enrichmentOrigins: Object.fromEntries((["industry", "seniorityLevel", "region"] as const)
          .flatMap((field) => model.contact.enrichment?.fields[field] ? [[field, model.contact.enrichment.fields[field]!.origin]] : [])) }
      : {}),
    initial:
      model.contact.displayName.trim().slice(0, 1).toUpperCase() ||
      model.contact.id.slice(0, 1).toUpperCase(),
    lastEventId: eventId,
    lineId: model.contact.lineId ?? "",
    location: displayText(model.contact.location, language),
    ...(model.contact.cardNotes ? { cardNotes: model.contact.cardNotes } : {}),
    met: displayText(model.contact.source.label, language),
    note:
      displayText(
        model.contact.relationshipContext ||
          model.connection?.connectionReason ||
          model.assessment?.rationale.summary ||
          model.contact.source.label,
        language,
      ),
    notes,
    offering: displayTexts(model.contact.publicProfile.offering, language).join(", "),
    phone: model.contact.primaryPhone ?? "",
    pipelineStatus: pending ? "pending_initialization" : pipelineStatusFor(model.contact.status),
    relationshipStatus: model.contact.status,
    seeking: displayTexts(model.contact.publicProfile.seeking, language).join(", "),
    source: sourceFor(model.contact.source),
    stage: pending ? PIPELINE_STATUS_LABELS.pending_initialization[language] : model.contact.status,
    title: displayText(model.contact.role, language),
    wechat: model.contact.wechatId ?? "",
    strength:
      model.assessment || model.connection
        ? strengthFromScore(
            model.assessment?.priorityScore.value ||
              model.connection?.strengthScore ||
              0,
          )
        : "unscored",
    valueTags: model.contact.tags.map((tag) => tagLabel(tag, language)),
    editableTags: model.contact.tags.map((tag) => ({ value: tag, label: tagLabel(tag, language) })),
    nextAction: !pending && model.contact.nextAction
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
    editableInteraction: {
      channel: model.contact.lastInteraction.channel,
      occurredAt: model.contact.lastInteraction.occurredAt,
      summary: model.contact.lastInteraction.summary,
    },
    lastInteraction: displayText(
      model.contact.lastInteraction.summary,
      language,
    ),
    dormant: false,
  };

  return {
    connections: [contact],
    events: eventId
      ? [
          {
            id: eventId,
            name: eventName,
          },
        ]
      : [],
    intros: [],
    pipelineStatuses: pipelineStatusOptions(pending, language),
  };
}
