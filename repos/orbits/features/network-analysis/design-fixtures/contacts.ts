/** PX1: R11a's local-only contact projection of the R11b four-state people. */
import type { ContactCardDTO, ContactCardSourceChip } from "../../../shared/contract/contact-card-page";
import type { ContactSyncPayload } from "../../../shared/contract/contact-local-directory";
import type { InviteConnectionView } from "../../../shared/contract/invite-codes";
import type { PlanContactFit } from "../../../shared/contract/plan-v2";
import type { NetworkDesignVariant } from "../analysis-fixtures";
import { designNetworkPeople } from "./index";

const HOUR = 3_600_000;
/** R11a's contact boards include the 10/8 connection and 10/12 profile update. */
export const CONTACT_FIXTURE_NOW = new Date("2026-10-19T03:00:00.000Z");
const MANY_ORDER = [0, 2, 31, 150, 120, 220, 152, 151, 260] as const;
const FEW_ORDER = [2, 0, 120, 190, 260] as const;
const MANY_GOAL = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
const MANY_FOLLOW_UP = new Set([0, 1, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
const MANY_LEVEL_THREE = new Set([...MANY_GOAL, ...Array.from({ length: 32 }, (_, index) => index + 30)]);
const MANY_LEVEL_ONE = new Set([150, 151, 152, 220, 260]);
for (let index = 9; MANY_LEVEL_ONE.size < 74; index += 1) {
  if (!MANY_LEVEL_THREE.has(index) && index !== 120 && index !== 190) MANY_LEVEL_ONE.add(index);
}

export interface DesignNetworkContactFixture {
  variant: NetworkDesignVariant;
  rows: ContactSyncPayload[];
  goalRelatedIds: string[];
  followUpContactIds: string[];
  links: { contactId: string; label: string; talked: boolean }[];
  fits: Record<string, PlanContactFit>;
  connections: Record<string, InviteConnectionView>;
  valueLines: Record<string, { relation: string; evidence: string[]; meetingCount?: number }>;
}

const personIndex = (id: string) => Number(id.slice("design-person-".length)) - 1;
const iso = (hoursAgo: number) => new Date(CONTACT_FIXTURE_NOW.getTime() - hoursAgo * HOUR).toISOString();
const source = (index: number, variant: NetworkDesignVariant): ContactCardSourceChip => {
  if (variant === "locked5") return index === 260 ? "manual" : "meishi";
  if (index === 120 || index === 31 || index === 32) return "self";
  if (index >= 150 && index <= 171) return "linkedin";
  if (index >= 172 && index <= 179) return "event";
  if (index >= 205 && index <= 245) return "phone";
  if ((index >= 254 && index <= 260) || index === 261) return "manual";
  return "meishi";
};
const sourceType = (chip: ContactCardSourceChip): string => chip === "meishi" ? "business_card_ocr"
  : chip === "event" ? "event_import" : chip === "self" ? "referral"
    : chip === "manual" ? "manual" : "external_contacts";
const density = (index: number, variant: NetworkDesignVariant): 1 | 2 | 3 => {
  if (variant === "locked5") return index === 0 || index === 2 ? 3 : index === 260 ? 1 : 2;
  if (variant === "many286") return MANY_LEVEL_THREE.has(index) ? 3 : MANY_LEVEL_ONE.has(index) ? 1 : 2;
  return index < 2 ? 3 : index % 3 === 0 ? 1 : 2;
};
const industryLabel = (id: string | null | undefined) => ({
  finance_investment: "投資・金融", retail_consumer: "小売・消費財", education_research: "教育・研究", trade_logistics: "商社・物流",
} as Record<string, string>)[id ?? ""] ?? "";

/** The same id, name, organization, industry, stage and join date feed R11a and R11b. */
export function designNetworkContactFixture(variant: NetworkDesignVariant): DesignNetworkContactFixture {
  const people = designNetworkPeople(variant);
  const goalIndexes = variant === "locked5" ? new Set([0, 2]) : variant === "few14" ? new Set([0, 1]) : MANY_GOAL;
  const followUpIndexes = variant === "many286" ? MANY_FOLLOW_UP : new Set<number>();
  const order = variant === "locked5" ? FEW_ORDER : MANY_ORDER;
  const rows = people.map((person) => {
    const index = personIndex(person.id);
    const chip = source(index, variant);
    const rank = (order as readonly number[]).indexOf(index);
    const desiredUpdatedAt = CONTACT_FIXTURE_NOW.getTime() - (rank >= 0 ? rank + 1 : 240 + index) * HOUR;
    const updatedAt = new Date(Math.max(desiredUpdatedAt, Date.parse(person.addedAt ?? "") || 0)).toISOString();
    const card: ContactCardDTO = {
      id: person.id, displayName: person.name, organization: person.organization, role: person.role,
      status: person.status === "nurture" ? "nurture" : "active", sourceType: sourceType(chip), sourceChip: chip,
      pendingInitialization: false, nextActionPreview: index === 0 ? "昨日の面談のお礼と、事業計画書 v3 の送付" : index === 31 ? "つながったお礼と、来週のお茶のお誘い" : person.nextActionPreview, valueTypes: [], updatedAt,
      density: density(index, variant), primaryIndustryId: person.primaryIndustryId ?? undefined,
      region: person.city ? { countryCode: "JP", city: person.city } : undefined,
      metKind: person.metKind === "event" || person.metKind === "referral" || person.metKind === "visit" ? person.metKind : "other",
      addedAt: person.addedAt ?? undefined, lastInteractionAt: person.lastInteractionAt ?? undefined,
      goalRelated: goalIndexes.has(index),
    };
    const detail: Record<string, unknown> = {
      id: person.id, displayName: person.name, organization: person.organization, role: person.role, status: card.status,
      primaryIndustryId: person.primaryIndustryId, primaryIndustryLabel: industryLabel(person.primaryIndustryId),
      seniorityLevel: person.seniorityLevel, region: card.region, primaryEmail: index === 0 ? "m.takahashi@aoba-vc.example" : index === 31 ? "h.matsui@solanote.co.jp" : "",
      primaryPhone: "", nextAction: card.nextActionPreview, tags: index === 0 ? ["リード候補", "SaaS"] : [],
      cardNotes: index === 0 ? "出会い：9/18 Japan Startup Night" : null, updatedAt,
      publicProfile: { offering: index === 0 ? ["VC の紹介", "資本政策の助言"] : index === 31 ? ["製造業の現場ネットワーク", "補助金申請の知見"] : [],
        seeking: index === 0 ? ["製造業 SaaS の案件"] : index === 31 ? ["SaaS の販路", "資金調達の相談相手"] : [] },
      notes: index === 0 ? [
        { noteId: "px1-t1", title: "2回目の面談", body: "DD の資料リストを受領。11月に IC 予定", createdAt: iso(24) },
        { noteId: "px1-t2", title: "メール", body: "事業計画書 v2 を送付", createdAt: iso(240) },
      ] : [],
      lastInteraction: person.lastInteractionAt ? { occurredAt: person.lastInteractionAt, summary: "面談" } : null,
      fieldHistory: index === 260 ? [{ field: "role", previous: "デザイナー", next: person.role, source: "本人", at: iso(720) }]
        : index === 31 ? [
          { field: "role", previous: "取締役 COO", next: "代表取締役", source: "invite_sync", at: "2026-10-12T03:00:00.000Z" },
          { field: "offering", previous: null, next: "製造業向けの PoC 先の紹介", source: "invite_sync", at: "2026-10-12T03:00:00.000Z" },
        ] : [],
    };
    return {
      id: person.id, card, tags: index === 0 ? ["リード候補", "SaaS"] : [], detail,
      search: { text: [person.name, person.organization, person.role, person.primaryIndustryId, person.nextActionPreview].filter(Boolean).join(" "),
        occurredAt: updatedAt.replace(/Z$/, "000Z"), updatedAt: updatedAt.replace(/Z$/, "000Z"), error: null },
    } satisfies ContactSyncPayload;
  });
  return {
    variant, rows,
    goalRelatedIds: people.filter((person) => goalIndexes.has(personIndex(person.id))).map((person) => person.id),
    followUpContactIds: people.filter((person) => followUpIndexes.has(personIndex(person.id))).map((person) => person.id),
    links: people.filter((person) => goalIndexes.has(personIndex(person.id))).map((person) => ({
      contactId: person.id, label: personIndex(person.id) === 2 ? "CFO 経験者" : "VC パートナー", talked: true,
    })),
    fits: variant === "empty" ? {} : {
      "design-person-003": { contactId: "design-person-003", fits: [{ planId: "design-plan", goal: "シリーズA", itemId: "cfo", shortLabel: "CFO 経験者", emoji: "📊", status: "candidate", reason: "役職が CFO" }] },
      "design-person-032": { contactId: "design-person-032", fits: [{ planId: "design-plan", goal: "シリーズA", itemId: "fundraising", shortLabel: "調達経験のある起業家", emoji: "🚀", status: "candidate", reason: "資金調達を経験した起業家" }] },
      "design-person-151": { contactId: "design-person-151", fits: [{ planId: "design-plan", goal: "シリーズA", itemId: "vc", shortLabel: "VC パートナー", emoji: "💼", status: "candidate", reason: "VC の投資担当" }] },
    },
    connections: variant === "many286" ? {
      "design-person-032": { contactId: "design-person-032", connectedAt: "2026-10-08T03:00:00.000Z", via: { code: "7Q2K-8M4P" },
        sharedByMe: ["organization", "offering", "seeking"], sharedByPeer: ["organization", "email", "offering", "seeking"], pausedFields: ["email"] },
    } : {},
    valueLines: variant === "empty" ? {} : {
      "design-person-003": { relation: "資本政策と資金調達の経験があります。", evidence: ["card", "memo:面談メモ"] },
      "design-person-001": { relation: "シリーズAのリード投資家候補。SaaS 領域に年8社出資しており、あなたの調達規模と合います。", evidence: ["card", "memo:面談メモ"], meetingCount: 2 },
    },
  };
}
