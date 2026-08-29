import type { OrbitLanguage } from "../../shared/contract/language";

import type { ContactDetailSourceType } from "./detail-contract";

const sourceLabels: Record<
  OrbitLanguage,
  Record<ContactDetailSourceType, string>
> = {
  zh: {
    business_card_ocr: "名片识别",
    calendar_signal: "日程记录",
    email_signal: "邮件记录",
    event_import: "活动导入",
    external_contacts: "联系人导入",
    manual: "手动记录",
    qr_scan: "二维码交换",
    referral: "朋友介绍",
  },
  en: {
    business_card_ocr: "Business card scan",
    calendar_signal: "Calendar record",
    email_signal: "Email record",
    event_import: "Event import",
    external_contacts: "Contact import",
    manual: "Manual note",
    qr_scan: "QR scan",
    referral: "Introduction",
  },
  ja: {
    business_card_ocr: "名刺スキャン",
    calendar_signal: "カレンダー記録",
    email_signal: "メール記録",
    event_import: "イベントから追加",
    external_contacts: "連絡先から追加",
    manual: "手動メモ",
    qr_scan: "QRコード交換",
    referral: "紹介",
  },
};

const systemCopy = {
  zh: {
    generatedContext: "联系人与关系记录生成的背景信息。",
    liveProfile: "此联系人的公开资料来自关系记录。",
    relationshipContact: "人脉联系人",
    relationshipContext: "关系背景",
    reviewBeforeAction: "采取下一步行动前，请先确认联系人详情。",
    unknownLocation: "地点未记录",
    unknownOrganization: "公司未记录",
  },
  en: {
    generatedContext: "Background generated from contact and relationship records.",
    liveProfile: "This contact's public profile comes from relationship records.",
    relationshipContact: "Relationship contact",
    relationshipContext: "Relationship context",
    reviewBeforeAction: "Review the contact details before taking the next action.",
    unknownLocation: "Location not recorded",
    unknownOrganization: "Organization not recorded",
  },
  ja: {
    generatedContext: "連絡先と関係記録から生成された背景情報です。",
    liveProfile: "この連絡先の公開プロフィールは関係記録に基づいています。",
    relationshipContact: "人脈の連絡先",
    relationshipContext: "関係の背景",
    reviewBeforeAction: "次の行動に進む前に、連絡先の詳細を確認してください。",
    unknownLocation: "場所は未登録です",
    unknownOrganization: "会社は未登録です",
  },
} as const;

const relationshipTokens: Record<OrbitLanguage, Record<string, string>> = {
  zh: {
    commercial_opportunity: "商业机会",
    community_context: "社群背景",
    cross_border_ecommerce: "跨境电商",
    education_training: "教育培训",
    knowledge_exchange: "知识交流",
    legal_accounting: "法律与财税",
    referral_path: "引荐路径",
    retail_omnichannel: "零售全渠道",
    strategic_fit: "战略匹配",
    tourism_hospitality: "旅游与酒店",
    venture_capital: "投资合作",
  },
  en: {
    commercial_opportunity: "commercial opportunity",
    community_context: "community context",
    cross_border_ecommerce: "cross-border ecommerce",
    education_training: "education and training",
    knowledge_exchange: "knowledge exchange",
    legal_accounting: "legal and accounting",
    referral_path: "referral path",
    retail_omnichannel: "retail omnichannel",
    strategic_fit: "strategic fit",
    tourism_hospitality: "tourism and hospitality",
    venture_capital: "investment interest",
  },
  ja: {
    commercial_opportunity: "商談機会",
    community_context: "コミュニティでの関係",
    cross_border_ecommerce: "越境EC",
    education_training: "教育・研修",
    knowledge_exchange: "知識交流",
    legal_accounting: "法務・会計",
    referral_path: "紹介経路",
    retail_omnichannel: "小売オムニチャネル",
    strategic_fit: "戦略的な適合",
    tourism_hospitality: "観光・ホスピタリティ",
    venture_capital: "投資連携",
  },
};

export function contactDetailCopy(language: OrbitLanguage) {
  return systemCopy[language];
}

export function contactSourceTypeLabel(
  language: OrbitLanguage,
  sourceType: ContactDetailSourceType,
): string {
  return sourceLabels[language][sourceType];
}

export function localizeContactSourceLabel(input: {
  displayName: string;
  label?: string | null;
  language: OrbitLanguage;
  sourceType: ContactDetailSourceType;
}): string {
  const label = input.label?.trim() ?? "";

  if (input.sourceType !== "qr_scan") {
    return label || contactSourceTypeLabel(input.language, input.sourceType);
  }

  const directPerson = label.replace(/^Direct QR scan for\s+/iu, "").trim();
  const namedEvent = label.replace(/\s*QR scan$/iu, "").trim();
  const counterpart =
    directPerson && directPerson !== label
      ? directPerson
      : /二维码交换记录|QR\s*(?:scan|コード)/iu.test(label)
        ? input.displayName
        : namedEvent && namedEvent !== label
          ? namedEvent
          : label || input.displayName;

  if (input.language === "zh") {
    return label.startsWith("二维码交换记录")
      ? label
      : `二维码交换记录：${counterpart}`;
  }

  if (input.language === "ja") {
    return `${counterpart}とのQRコード交換`;
  }

  return `QR scan with ${counterpart}`;
}

export function localizeRelationshipText(
  value: string,
  language: OrbitLanguage,
): string {
  return value.replace(/\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/gu, (token) =>
    relationshipTokens[language][token] ??
    token.replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim(),
  );
}

export function selectContactEvidenceText(
  summary: string,
  language: OrbitLanguage,
): { contentLanguage: OrbitLanguage | "original"; text: string } {
  const segments = new Map<string, string>();
  const marker = /(?:^|\s)(JA|ZH|EN):\s*([\s\S]*?)(?=\s+(?:JA|ZH|EN):|$)/giu;

  for (const match of summary.matchAll(marker)) {
    const key = match[1]?.toLowerCase();
    const text = match[2]?.trim();
    if (key && text) segments.set(key, text);
  }

  const selected = segments.get(language);
  if (selected) {
    return { contentLanguage: language, text: selected };
  }

  return {
    contentLanguage: "original",
    text: localizeRelationshipText(summary.trim(), language),
  };
}
