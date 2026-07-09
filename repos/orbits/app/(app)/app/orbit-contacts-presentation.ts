// Contacts presentation layer: localizes the English seed identity fields
// (company · title · location), the relationship value tags and the nextAction
// copy to the page language, before localizeOrbitTree. The app localizer is
// zh->en dictionary only, so English-canonical seed data never followed the page
// language on the Chinese/Japanese contacts pages. Vocabulary is bounded, so we
// translate via small token dictionaries here.

import type { OrbitLanguage } from "./orbit-language-core";
import type {
  OrbitContactView,
  OrbitContactsViewModel,
} from "./orbit-contacts-route-view-model";

interface Tri {
  en: string;
  ja: string;
  zh: string;
}

function tr(dict: Record<string, Tri>, value: string, language: OrbitLanguage): string {
  const entry = dict[value];
  return entry ? entry[language] ?? entry.zh : value;
}

const ROLE: Record<string, Tri> = {
  "Store Owner": { zh: "门店店主", en: "Store Owner", ja: "店舗オーナー" },
  "Investor Partner": { zh: "投资合伙人", en: "Investor Partner", ja: "投資パートナー" },
  "Marketing Lead": { zh: "市场负责人", en: "Marketing Lead", ja: "マーケティング責任者" },
  "Product Manager": { zh: "产品经理", en: "Product Manager", ja: "プロダクトマネージャー" },
  "DX Consultant": { zh: "DX 顾问", en: "DX Consultant", ja: "DXコンサルタント" },
  "Sales Director": { zh: "销售总监", en: "Sales Director", ja: "営業ディレクター" },
  "Community Organizer": { zh: "社群组织者", en: "Community Organizer", ja: "コミュニティ主催者" },
  "Founder CEO": { zh: "创始人 CEO", en: "Founder CEO", ja: "創業者CEO" },
};

const LOCATION: Record<string, Tri> = {
  Osaka: { zh: "大阪", en: "Osaka", ja: "大阪" },
  Shenzhen: { zh: "深圳", en: "Shenzhen", ja: "深セン" },
  Singapore: { zh: "新加坡", en: "Singapore", ja: "シンガポール" },
  Tokyo: { zh: "东京", en: "Tokyo", ja: "東京" },
};

const COMPANY_PREFIX: Record<string, Tri> = {
  "North Star": { zh: "北星", en: "North Star", ja: "ノーススター" },
  Aoba: { zh: "青叶", en: "Aoba", ja: "青葉" },
  Yokohama: { zh: "横滨", en: "Yokohama", ja: "横浜" },
  Kansai: { zh: "关西", en: "Kansai", ja: "関西" },
  Umeda: { zh: "梅田", en: "Umeda", ja: "梅田" },
  "Morning Light": { zh: "晨光", en: "Morning Light", ja: "モーニングライト" },
  Cedar: { zh: "雪松", en: "Cedar", ja: "シダー" },
  "Blue Harbor": { zh: "蓝港", en: "Blue Harbor", ja: "ブルーハーバー" },
  "Bamboo Grove": { zh: "竹林", en: "Bamboo Grove", ja: "バンブーグローブ" },
  Nanshan: { zh: "南山", en: "Nanshan", ja: "南山" },
  Ginza: { zh: "银座", en: "Ginza", ja: "銀座" },
  "Red Bridge": { zh: "红桥", en: "Red Bridge", ja: "レッドブリッジ" },
};

const COMPANY_TYPE: Record<string, Tri> = {
  Foods: { zh: "食品", en: "Foods", ja: "フーズ" },
  Technologies: { zh: "科技", en: "Technologies", ja: "テクノロジー" },
  Partners: { zh: "合伙", en: "Partners", ja: "パートナーズ" },
  Capital: { zh: "资本", en: "Capital", ja: "キャピタル" },
  Community: { zh: "社群", en: "Community", ja: "コミュニティ" },
};

const VALUE_TAG: Record<string, Tri> = {
  "Strategic fit": { zh: "战略契合", en: "Strategic fit", ja: "戦略フィット" },
  "Knowledge exchange": { zh: "知识交流", en: "Knowledge exchange", ja: "ナレッジ交換" },
  "Referral path": { zh: "引荐路径", en: "Referral path", ja: "紹介ルート" },
  "Community context": { zh: "社群资源", en: "Community context", ja: "コミュニティ文脈" },
  "Commercial opportunity": { zh: "商业机会", en: "Commercial opportunity", ja: "商業機会" },
};

function localizeCompany(company: string, language: OrbitLanguage): string {
  if (!company || language === "en") return company;
  const parts = company.trim().split(/\s+/);
  const type = parts[parts.length - 1];
  const prefix = parts.slice(0, -1).join(" ");
  const typeEntry = COMPANY_TYPE[type];
  const prefixEntry = COMPANY_PREFIX[prefix];
  if (!typeEntry || !prefixEntry) return company;
  return `${prefixEntry[language]}${typeEntry[language]}`;
}

// Recurring nextAction / prompt phrases that show verbatim on cards + detail.
const COMMON_PHRASE: Record<string, Tri> = {
  "review evidence before follow-up": { zh: "跟进前先核对证据", en: "review evidence before follow-up", ja: "フォローアップ前に証跡を確認" },
  "Review the matched contacts with source evidence before creating tasks.": { zh: "创建任务前，先核对匹配联系人的来源证据。", en: "Review the matched contacts with source evidence before creating tasks.", ja: "タスク作成前に、一致した連絡先のソース証跡を確認する。" },
};

function localizeNextActionText(text: string, language: OrbitLanguage): string {
  if (!text || language === "en") return text;
  if (COMMON_PHRASE[text]) return COMMON_PHRASE[text][language] ?? COMMON_PHRASE[text].zh;
  let match = text.match(/^Review (.+) with source evidence before agent use\.?$/);
  if (match) {
    const name = match[1];
    return language === "ja"
      ? `ソース証跡を確認してから ${name} に対応する。`
      : `先核对来源证据，再跟进 ${name}。`;
  }
  match = text.match(/^Review the next follow-up for (.+?)\.?$/);
  if (match) {
    const name = match[1];
    return language === "ja"
      ? `${name} の次のフォローアップを確認する。`
      : `跟进 ${name} 的下一步。`;
  }
  return text;
}

// Best-effort: swap any known value-tag phrases inside a reason string.
function localizeReason(reason: string, language: OrbitLanguage): string {
  if (!reason || language === "en") return reason;
  let out = localizeNextActionText(reason, language);
  for (const [en, tri] of Object.entries(VALUE_TAG)) {
    if (out.includes(en)) out = out.split(en).join(tri[language]);
  }
  return out;
}

function localizeContact(
  contact: OrbitContactView,
  language: OrbitLanguage,
): OrbitContactView {
  return {
    ...contact,
    company: localizeCompany(contact.company, language),
    title: tr(ROLE, contact.title, language),
    industry: tr(LOCATION, contact.industry, language),
    location: contact.location ? tr(LOCATION, contact.location, language) : contact.location,
    valueTags: contact.valueTags.map((tag) => tr(VALUE_TAG, tag, language)),
    nextAction: contact.nextAction
      ? {
          ...contact.nextAction,
          text: localizeNextActionText(contact.nextAction.text, language),
          reason: localizeReason(contact.nextAction.reason, language),
        }
      : contact.nextAction,
  };
}

/** Localize the identity / value-tag / nextAction fields of every contact. */
export function applyOrbitContactsPresentation(
  viewModel: OrbitContactsViewModel,
  language: OrbitLanguage,
): OrbitContactsViewModel {
  return {
    ...viewModel,
    connections: viewModel.connections.map((contact) =>
      localizeContact(contact, language),
    ),
  };
}
