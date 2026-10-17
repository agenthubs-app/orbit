// R18a owner: C line. Design data is imported only by non-production fixture routes.
import type { ManualProfileContract } from "../../contract/profile";
import { profileAccountSchema } from "../../api-schema/profile-account";
import { DEMO_ACCOUNT, DEMO_ACCOUNT_SUGGESTION_PEERS, DEMO_PLAN, demoPerson } from "./index";

const at = "2026-10-07T00:00:00.000Z";
const offering = ["工場 IoT・稼働データ可視化", "製造業 DX の導入事例", "中部の製造業ネットワーク"];
const seeking = ["シリーズA のリード投資家", "製造業の決裁者", "CFO 候補"];
const bio = "工場の稼働データを可視化する SaaS を運営しています。製造業の DX と、シリーズA の調達に取り組んでいます。";

function account(score: 25 | 50 | 100) {
  const profile: ManualProfileContract = {
    id: DEMO_ACCOUNT.id, displayName: DEMO_ACCOUNT.name, organization: DEMO_ACCOUNT.company, role: DEMO_ACCOUNT.role,
    headline: "製造業 × SaaS", homeMarket: "東京", relationshipGoal: DEMO_PLAN.goal,
    targetRelationshipTypes: ["投資家"], preferredFollowUpWindow: "48 hours", preferredLanguage: "ja", preferredIntroChannels: ["email"],
    handles: { email: DEMO_ACCOUNT.email }, bio: score === 100 ? bio : "", offering: score >= 50 ? offering : [], seeking: score === 100 ? seeking : [],
    publicFields: { companyRole: true, offeringSeeking: true, intro: true }, updatedAt: at,
  };
  return {
    ...profileAccountSchema.parse({
      state: "success", profile, sample: true,
      completeness: {
        score: 100, status: "ready", completedFields: ["displayName", "headline", "relationshipGoal", "homeMarket", "targetRelationshipTypes", "preferredIntroChannels"], missingFields: [], nextBestField: null,
        card: { score, items: [
          { key: "companyRole", weight: 25, done: true }, { key: "offering", weight: 25, done: score >= 50 },
          { key: "seeking", weight: 25, done: score === 100 }, { key: "intro", weight: 25, done: score === 100 },
        ] },
      },
      editor: { canSave: true, lastSavedAt: at, dirtyFields: [], validationMessages: [] }, nextAction: "",
    }),
    sample: true as const,
  };
}

export const demoAccountProfiles = { new: account(25), regular: account(50), complete: account(100) };
export const demoAccountSeekCandidates = seeking;
// b5 #16 / #20 and supplemental A/W-R18a-30/01: source-authored display counts, never live aggregation.
export const demoAccountEventSummary = { hosted: 2, active: 1, attending: 2 } as const;
export const demoAccountUnread = { new: 0, regular: 5, complete: 5 } as const;

export type AccountDesignSuggestion = {
  id: string; target: "self" | "contact"; name: string; company: string;
  source: "business-card" | "resume" | "conversation"; sourceLabel: string; createdAt: string;
  fields: { key: string; label: string; current: string; proposed: string }[]; sample: true;
};
const suzuki = demoPerson("demo-person-suzuki"), watanabe = demoPerson("demo-person-watanabe"), ito = demoPerson("demo-person-ito"), { kato, nakamura } = DEMO_ACCOUNT_SUGGESTION_PEERS;
export const demoAccountSuggestions: AccountDesignSuggestion[] = [
  { id: "account-design-suzuki", target: "contact", name: suzuki.name, company: suzuki.company, source: "business-card", sourceLabel: "新しい名刺", createdAt: "2026-10-07", fields: [{ key: "role", label: "役職", current: "DX 推進室 課長", proposed: "DX 推進室 室長" }, { key: "phone", label: "携帯", current: "（なし）", proposed: "090-5555-0263" }], sample: true },
  { id: "account-design-self", target: "self", name: "あなたのプロフィール", company: DEMO_ACCOUNT.name, source: "resume", sourceLabel: "職務経歴書", createdAt: "2026-10-05", fields: [{ key: "bio", label: "経歴", current: "（なし）", proposed: "2019–2022 テクノフォージ 事業開発部長" }, { key: "offering", label: "得意分野", current: "製造業 SaaS", proposed: "製造業 SaaS · 工場 DX の導入支援" }], sample: true },
  { id: "account-design-watanabe", target: "contact", name: watanabe.name, company: watanabe.company, source: "conversation", sourceLabel: "iOrbit との会話", createdAt: "2026-10-02", fields: [{ key: "employees", label: "従業員数", current: "約30名", proposed: "約55名" }, { key: "memo", label: "メモに追加", current: "—", proposed: "2026年9月にシリーズA 調達済み" }], sample: true },
  { id: "account-design-ito", target: "contact", name: ito.name, company: ito.company, source: "business-card", sourceLabel: "新しい名刺", createdAt: "2026-10-06", fields: [{ key: "organization", label: "会社", current: ito.company, proposed: "ハルモニア・ホールディングス株式会社" }, { key: "email", label: "メール", current: "n.ito@harmonia.example", proposed: "n.ito@harmonia-hd.example" }], sample: true },
  { id: "account-design-kato", target: "contact", name: kato.name, company: kato.company, source: "conversation", sourceLabel: "iOrbit との会話", createdAt: "2026-09-30", fields: [{ key: "role", label: "役職", current: kato.role, proposed: "執行役員 営業本部長" }], sample: true },
  { id: "account-design-nakamura", target: "contact", name: nakamura.name, company: nakamura.company, source: "business-card", sourceLabel: "新しい名刺", createdAt: "2026-09-28", fields: [{ key: "organization", label: "会社", current: nakamura.company, proposed: "光が丘・みなと法律事務所" }], sample: true },
];

const integration = (provider: "gmail" | "google_calendar", connected: boolean) => ({ authorizationId: "demo-" + provider, provider, scopes: [], capabilities: [], status: connected ? "active" as const : "pending" as const, healthStatus: connected ? "healthy" as const : "not_checked" as const, healthMessage: "", createdAt: at, updatedAt: at, sample: true as const });
export const demoAccountIntegrations = {
  empty: [integration("gmail", false), integration("google_calendar", false)],
  few: [integration("gmail", true), integration("google_calendar", false)],
  many: [integration("gmail", true), integration("google_calendar", true)],
};
export const demoAccountMemories = [
  { memoryId: "demo-memory-1", category: "goal", content: "中部の製造業に販路を広げたい", source: "manual", createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", sample: true },
  { memoryId: "demo-memory-2", category: "preference", content: "評価額より、リード投資家の業界理解を重視", source: "conversation", createdAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z", sample: true },
  { memoryId: "demo-memory-3", category: "constraint", content: "平日夜のイベントは月2回まで", source: "conversation", createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", sample: true },
] as const;
