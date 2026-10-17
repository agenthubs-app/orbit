// R12 像素门禁的只读演示（同 Web `contacts/new/scan/design-<状态>`，交接表 G08 / 决定表 Q4）：开发包里
// Metro 带 EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=add-scan 时，`contacts/new/scan/design-<状态>` 用设计稿画板上的
// 示例人名渲染批次页（b11 A1 ③ 読み取り中、④ 完成），不读写服务器、不调 OCR；正式包永远关闭。
import type { IngestItemContract } from "../../api/contract/business-card-batch";
import type { IngestCard } from "../../view-models/business-card-ingest";
import type { ContactDraftRow } from "./add-read";
import { addDesignMock } from "./add-design-mock";
import samples from "./scan-design-samples.json";

// The board names (data, not copy) live in scan-design-samples.json.
const S = samples as unknown as { drafts: [string, string, string][]; draftsEvent: string } & Record<"takayama" | "date" | "matsumoto" | "takahashi" | "morita" | "suzuki" | "suzukiExisting" | "watanabe" | "watanabeExisting" | "aoki" | "shinonome" | "partial", [string, string, string]> & { doneDate: string };
import type { IngestContactCandidateContract } from "../../api/contract/business-card-batch";
import type { ScanBatchView, ScanCardKind, ScanCardView, ScanIssueGroup, ScanSection } from "./scan-batch-model";

export const SCAN_DESIGN_FIXTURES = ["design-reading", "design-done", "design-bridge", "design-review", "design-failed", "design-stopped"] as const;
export type ScanDesignFixture = (typeof SCAN_DESIGN_FIXTURES)[number];
/** `total`: the card count the page states (the board lists only some of the read cards). */
export interface ScanDesign { view: ScanBatchView; eventTitle: string | null; dateLabel: string; total: number; selectedEventId?: string }

/** The fixture for this batch id, or null (not a design id, or the switch is off). */
export function scanDesignFor(batchId: string, enabled: boolean = addDesignMock("add-scan")): ScanDesign | null {
  if (!enabled || !(SCAN_DESIGN_FIXTURES as readonly string[]).includes(batchId)) return null;
  if (batchId === "design-reading") return readingDesign();
  if (batchId === "design-done") return doneDesign();
  if (batchId === "design-stopped") return stoppedDesign();
  return reviewDesign(batchId === "design-bridge" ? "bridge" : batchId === "design-review" ? "review" : "failed");
}

function card(seq: number, kind: ScanCardKind, name = "", organization = "", role = "", twoSided = false): ScanCardView {
  const item = { id: `item-${seq}`, cardId: `card-${seq}`, seq, side: "front", status: "extracted", reviewIssues: [] } as unknown as IngestItemContract;
  const ingest: IngestCard = { cardId: `card-${seq}`, front: item, back: null, items: [item] };
  return {
    candidate: null, card: ingest, cardId: ingest.cardId, draft: null, enrichment: null, failure: null, fileName: `IMG_${2000 + seq}.HEIC`, flagged: [],
    issueGroup: null, kind, name, organization, role, section: null, twoSided,
  };
}

const COUNTS = { asIs: 0, autoAdded: 0, created: 0, duplicate: 0, failed: 0, held: 0, merged: 0, review: 0, unreadable: 0 };

/** b11 A1 ③：17枚、12枚 読み取り済み · 高山 亮 ✓ / 伊達 修平 ✓ / 松本 千尋 推測あり / 高橋 美咲 重複 / 12枚目 表＋裏 / 残り 5枚. */
function readingDesign(): ScanDesign {
  const cards = [
    card(1, "added", ...S.takayama),
    card(2, "added", ...S.date),
    card(3, "guess", ...S.matsumoto),
    card(4, "duplicate", ...S.takahashi),
    card(12, "reading", "", "", "", true),
    ...[13, 14, 15, 16, 17].map((seq) => card(seq, "queued")),
  ];
  return { dateLabel: "", eventTitle: null, total: 17, view: { cards, completed: false, counts: COUNTS, createdAt: null, density: null, events: [], phase: "reading", photos: 17, settled: 12, uploaded: 17 } };
}

/** b11 A1 ④：17人を人脈に追加しました · 名刺 17枚 · 10月7日 CFO Night Tokyo · 14 / 2 / 1 · 濃さ 2 / 13 / 1. */
function doneDesign(): ScanDesign {
  const cards = Array.from({ length: 17 }, (_, index) => card(index + 1, index === 16 ? "skipped" : "added"));
  return {
    dateLabel: S.doneDate, eventTitle: "CFO Night Tokyo", total: 17,
    view: { cards, completed: true, counts: { ...COUNTS, created: 14, merged: 2, unreadable: 1 }, createdAt: "2026-10-07T10:00:00+09:00", density: { 1: 2, 2: 13, 3: 1 }, events: [], phase: "done", photos: 17, settled: 17, uploaded: 17 },
  };
}

function pending(seq: number, section: ScanSection, name: string, organization: string, extra: Partial<ScanCardView> = {}): ScanCardView {
  return { ...card(seq, section === "failed" ? "failed" : section === "duplicate" ? "duplicate" : section === "review" ? "guess" : "ready", name, organization), section, ...extra };
}

function candidate(displayName: string, organization: string): IngestContactCandidateContract {
  return { address: "", contactId: `contact-${displayName}`, displayName, email: "", identical: false, matchedOn: ["name"], organization, phone: "", role: "" } as unknown as IngestContactCandidateContract;
}

const CFO_NIGHT = { eventId: "event-cfo", startsAt: "2026-10-07T19:00:00+09:00", title: "CFO Night Tokyo vol.18" };

/**
 * まとめて確認 (b9 A1 ① 衔接 12枚 · 重複 1 / 要確認 2 / そのまま追加 9; b9 A2 ④ 統一 · 鈴木 大輔 / 渡辺 翔 + 4件 自動統合;
 * b11 A1 ⑤ 読み取れなかった 1枚). Names from the boards (Web design-fixtures の名刺版と同じ人).
 */
function reviewDesign(kind: "bridge" | "review" | "failed"): ScanDesign {
  const issue = (group: ScanIssueGroup) => ({ issueGroup: group });
  const cards = kind === "bridge" ? [
    pending(1, "duplicate", S.suzuki[0], S.suzuki[1], { candidate: candidate(S.suzukiExisting[0], S.suzukiExisting[1]) }),
    pending(2, "review", S.aoki[0], S.aoki[1], issue("orgSuffix")),
    pending(3, "review", S.shinonome[0], S.shinonome[1], issue("name")),
    ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((seq) => pending(seq, "ready", "", "")),
  ] : kind === "review" ? [
    pending(1, "duplicate", S.suzuki[0], S.suzuki[1], { candidate: candidate(S.suzukiExisting[0], S.suzukiExisting[1]) }),
    pending(2, "duplicate", S.watanabe[0], S.watanabe[1], { candidate: candidate(S.watanabeExisting[0], S.watanabeExisting[1]) }),
    pending(3, "review", S.aoki[0], S.aoki[1], issue("orgSuffix")),
    pending(4, "review", S.shinonome[0], S.shinonome[1], issue("name")),
    ...[5, 6, 7, 8, 9, 10].map((seq) => pending(seq, "ready", "", "")),
  ] : [
    // b11 #4 background = top of the unified page (名刺 · 17件: 重複 2 / 要確認 1 / そのまま追加 13) with the unreadable card's sheet open.
    pending(1, "duplicate", S.takahashi[0], S.takahashi[1], { candidate: candidate(S.takahashi[0], S.takahashi[1]) }),
    pending(2, "duplicate", S.suzuki[0], S.suzuki[1], { candidate: candidate(S.suzukiExisting[0], S.suzukiExisting[1]) }),
    pending(3, "review", S.aoki[0], S.aoki[1], issue("orgSuffix")),
    ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17].map((seq) => pending(seq, "ready", "", "")),
    pending(16, "failed", S.partial[0], S.partial[1], { failure: "image" }),
  ];
  const count = (section: ScanSection) => cards.filter((entry) => entry.section === section).length;
  return {
    dateLabel: "", eventTitle: null, selectedEventId: CFO_NIGHT.eventId, total: cards.length,
    view: {
      cards, completed: false, counts: { ...COUNTS, asIs: count("ready"), duplicate: count("duplicate"), failed: count("failed"), merged: kind === "review" ? 4 : 0, review: count("review") },
      createdAt: CFO_NIGHT.startsAt, density: null, events: [CFO_NIGHT], phase: "review", photos: cards.length, settled: cards.length, uploaded: cards.length,
    },
  };
}

/** b12 N11：12枚 · アップロードが途中で止まりました（写真が端末に残っていない）. */
function stoppedDesign(): ScanDesign {
  const cards = Array.from({ length: 12 }, (_, index) => card(index + 1, "uploading"));
  return { dateLabel: "", eventTitle: null, total: 12, view: { cards, completed: false, counts: COUNTS, createdAt: null, density: null, events: [], phase: "uploading", photos: 12, settled: 0, uploaded: 3 } };
}

/** R12-13 · b12 #112 N08b 確認待ちの下書き：`contacts/new/drafts?eventId=…&design=n08b` 时用画板的 3 条草稿与活动名（不读服务器）。 */
export function draftsDesignFor(design: string | null, enabled: boolean = addDesignMock("add-scan")): { eventTitle: string; drafts: ContactDraftRow[] } | null {
  if (!enabled || design !== "n08b") return null;
  return {
    drafts: S.drafts.map(([displayName, organization, role], index) => ({ createdAt: "2026-10-07T12:00:00.000Z", displayName, id: `design-draft-${index + 1}`, organization, role, sourceLabel: S.draftsEvent })),
    eventTitle: S.draftsEvent,
  };
}
