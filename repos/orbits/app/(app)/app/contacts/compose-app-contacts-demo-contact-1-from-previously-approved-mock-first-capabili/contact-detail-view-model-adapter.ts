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
  OrbitContactView,
} from "../../orbit-contacts-route-view-model";
import type { OrbitLanguage } from "../../orbit-language-core";

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

const relationshipTokenLabels: Record<OrbitLanguage, Record<string, string>> = {
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
  ],
};

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
  const localizedValue = displaySegment(value, language);
  const withoutRawTokens = localizedValue.replace(/\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/g, (token) =>
    relationshipTokenLabels[language][token] ?? token.replace(/[_-]+/g, " "),
  );
  const withLabels = relationshipPhraseLabels[language].reduce(
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
