// R12 像素门禁的只读演示（同 Web `contacts/new/scan/design-<状态>`，交接表 G08 / 决定表 Q4）：开发包里
// Metro 带 EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=add-scan 时，`contacts/new/scan/design-<状态>` 用设计稿画板上的
// 示例人名渲染批次页（b11 A1 ③ 読み取り中、④ 完成），不读写服务器、不调 OCR；正式包永远关闭。
import type { IngestItemContract } from "../../api/contract/business-card-batch";
import type { IngestCard } from "../../view-models/business-card-ingest";
import { addDesignMock } from "./add-design-mock";
import type { ScanBatchView, ScanCardKind, ScanCardView } from "./scan-batch-model";

export const SCAN_DESIGN_FIXTURES = ["design-reading", "design-done"] as const;
export type ScanDesignFixture = (typeof SCAN_DESIGN_FIXTURES)[number];
/** `total`: the card count the page states (the board lists only some of the read cards). */
export interface ScanDesign { view: ScanBatchView; eventTitle: string | null; dateLabel: string; total: number }

/** The fixture for this batch id, or null (not a design id, or the switch is off). */
export function scanDesignFor(batchId: string, enabled: boolean = addDesignMock("add-scan")): ScanDesign | null {
  if (!enabled || !(SCAN_DESIGN_FIXTURES as readonly string[]).includes(batchId)) return null;
  return batchId === "design-reading" ? readingDesign() : doneDesign();
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
    card(1, "added", "高山 亮", "ミライ精機", "経営企画部 部長"),
    card(2, "added", "伊達 修平", "北辰製作所", "経営企画"),
    card(3, "guess", "松本 千尋", "関西テクノ電機", "役職を推測"),
    card(4, "duplicate", "高橋 美咲", "青葉ベンチャーズ"),
    card(12, "reading", "", "", "", true),
    ...[13, 14, 15, 16, 17].map((seq) => card(seq, "queued")),
  ];
  return { dateLabel: "", eventTitle: null, total: 17, view: { cards, completed: false, counts: COUNTS, createdAt: null, density: null, events: [], phase: "reading", photos: 17, settled: 12, uploaded: 17 } };
}

/** b11 A1 ④：17人を人脈に追加しました · 名刺 17枚 · 10月7日 CFO Night Tokyo · 14 / 2 / 1 · 濃さ 2 / 13 / 1. */
function doneDesign(): ScanDesign {
  const cards = Array.from({ length: 17 }, (_, index) => card(index + 1, index === 16 ? "skipped" : "added"));
  return {
    dateLabel: "10月7日", eventTitle: "CFO Night Tokyo", total: 17,
    view: { cards, completed: true, counts: { ...COUNTS, created: 14, merged: 2, unreadable: 1 }, createdAt: "2026-10-07T10:00:00+09:00", density: { 1: 2, 2: 13, 3: 1 }, events: [], phase: "done", photos: 17, settled: 17, uploaded: 17 },
  };
}
