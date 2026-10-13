/**
 * R12 像素门禁的只读演示（交接表 G08 / 决定表 Q4）：本机开 `ORBIT_REDESIGN_MOCK=add-scan` 时，
 * `/app/contacts/new/scan/design-<状态>` 用设计稿画板的示例数据渲染批次页（b11 A1 Web 读取中、
 * b12 W-R12-11 完成、W-R12-12a～c 异常），不读写库、不调 OCR；动作全部是空操作。生产环境永远关闭。
 */
"use client";

import { useMemo } from "react";

import { ScanBatchScreen } from "../../../orbit-2026/add/ScanBatchScreen";
import type { ScanBatchActions, ScanBatchView } from "../../../orbit-2026/add/scan-types";
import type { IngestItemDTO } from "../../../../../../features/acquisition/business-card-ingest-v2/contract";
import { groupIngestItemsByCardId, initialCardDraft } from "../../ingest-v2/ingest-v2-route-view-model";
import { SCAN_DESIGN_SAMPLE } from "../../../../../../features/acquisition/business-card-ingest-v2/design-fixtures";
import { buildScanBatchView } from "./scan-batch-view";

import type { ScanDesignFixture } from "./scan-design-fixture-gate";

function item(patch: Partial<IngestItemDTO> & { id: string; cardId: string }): IngestItemDTO {
  return {
    attemptCount: 1, batchId: "design", cardIdentityExplicit: true, clientDigest: `d-${patch.id}`, confirmedContactId: null, createdAt: "2026-10-07T10:00:00Z",
    derivativeObjectKey: "k", derivativeSize: 1, errorCode: null, errorStage: null, extraction: null, extractionSchemaVersion: 3, idempotencyKey: "",
    imageDigest: `sha256:${patch.id}`, leaseExpiresAt: null, nextRetryAt: null, rawMimeType: "image/jpeg", rawSize: 1, reviewIssues: [], seq: 1, side: "front",
    sourceFileName: `${patch.id}.jpg`, status: "extracted", updatedAt: "2026-10-07T10:00:00Z", usage: null, version: 1, ...patch,
  } as IngestItemDTO;
}

const extraction = (name: string, organization: string, title: string) => ({
  addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: ["ja"], emails: [], fullName: name, nativeFullName: name,
  organization, romanizedFullName: null, title, website: null,
});

/** b11 A1 Web「アップロード中 24枚 · 21枚 読み取り済み」: ✓ 高山 亮 / 推測あり 松本 千尋 / 22枚目 表＋裏 / IMG_2041.HEIC. */
function readingView(): ScanBatchView {
  const items = [
    item({ id: "takayama", cardId: "c1", seq: 1, status: "confirmed", confirmedContactId: "p1", extraction: extraction(SCAN_DESIGN_SAMPLE.reading.added.name, SCAN_DESIGN_SAMPLE.reading.added.organization, SCAN_DESIGN_SAMPLE.reading.added.title) }),
    item({ id: "matsumoto", cardId: "c2", seq: 2, extraction: extraction(SCAN_DESIGN_SAMPLE.reading.guess.name, SCAN_DESIGN_SAMPLE.reading.guess.organization, ""), reviewIssues: [{ code: "ORG_SUFFIX_MISSING", field: "organization" }] as never }),
    item({ id: "f22", cardId: "c3", seq: 22, status: "processing", leaseExpiresAt: "2026-10-07T10:05:00Z" }),
    item({ id: "b22", cardId: "c3", seq: 23, side: "back", status: "queued", nextRetryAt: "2026-10-07T10:00:00Z" }),
    item({ id: "fail", cardId: "c4", seq: 24, status: "terminal_failed", errorCode: "IMAGE_INVALID", sourceFileName: SCAN_DESIGN_SAMPLE.reading.failedFile }),
  ];
  const cards = groupIngestItemsByCardId(items);
  const view = buildScanBatchView({
    attributed: {}, attribution: { cards: {}, events: [] }, attributionDecisions: {}, autoCount: 1, autoPending: false, autoRunning: false, batchId: "design-reading", cards,
    detail: { batch: { createdAt: "2026-10-07T10:00:00Z" }, items } as never,
    drafts: Object.fromEntries(cards.filter((card) => card.reviewable).map((card) => [card.cardId, initialCardDraft(card)])),
    duplicates: new Set(), finished: false, loadFailed: false, matches: {}, mergedCount: 0, missing: 0, pending: cards, queue: cards, reviewing: false,
    settledCount: 3, stage: "processing", status: "processing", uploadFailed: false, userCount: 0,
  } as never);
  return { ...view, phase: "reading", photos: 24, uploaded: 24, settled: 21 };
}

/** b9 A3 ④ Web（统一）with cards: 重複 4 (北辰製作所 · Sakura Growth · Nexa Robotics · ハルモニア), 要確認 by reason. */
function reviewView(): ScanBatchView {
  const dup = (id: string, seq: number, name: string, org: string) => item({ id, cardId: `d-${id}`, seq, extraction: extraction(name, org, "") });
  const items = [
    ...SCAN_DESIGN_SAMPLE.review.duplicates.map((entry, index) => dup(entry.id, index + 1, entry.incoming[0], entry.incoming[1])),
    item({ id: "mori", cardId: "r-mori", seq: 5, extraction: extraction("", SCAN_DESIGN_SAMPLE.review.noName.organization, ""), reviewIssues: [{ code: "IDENTITY_MISSING", field: "displayName" }] as never }),
    item({ id: "self", cardId: "r-self", seq: 6, extraction: extraction(SCAN_DESIGN_SAMPLE.review.orgSuffix.name, SCAN_DESIGN_SAMPLE.review.orgSuffix.organization, ""), reviewIssues: [{ code: "ORG_SUFFIX_MISSING", field: "organization" }] as never }),
    item({ id: "ok", cardId: "ok-1", seq: 7, status: "confirmed", confirmedContactId: "p7", extraction: extraction(SCAN_DESIGN_SAMPLE.review.added.name, SCAN_DESIGN_SAMPLE.review.added.organization, SCAN_DESIGN_SAMPLE.review.added.title) }),
  ];
  const cards = groupIngestItemsByCardId(items);
  const pending = cards.filter((card) => card.cardId !== "ok-1");
  const candidate = (contactId: string, displayName: string, organization: string) => ({ address: "", contactId, displayName, email: "", identical: false, matchedOn: ["name_organization" as const], organization, phone: "", role: "" });
  const view = buildScanBatchView({
    attributed: {}, attribution: { cards: {}, events: [] }, attributionDecisions: {}, autoCount: 1, autoPending: false, autoRunning: false, batchId: "design-review", cards,
    detail: { batch: { createdAt: "2026-10-07T10:00:00Z" }, items } as never,
    drafts: Object.fromEntries(cards.filter((card) => card.reviewable).map((card) => [card.cardId, initialCardDraft(card)])),
    duplicates: new Set(SCAN_DESIGN_SAMPLE.review.duplicates.map((entry) => `d-${entry.id}`)), finished: false, loadFailed: false,
    matches: Object.fromEntries(SCAN_DESIGN_SAMPLE.review.duplicates.map((entry, index) => [`d-${entry.id}`, candidate(`p${index + 1}`, entry.existing[0], entry.existing[1])])),
    mergedCount: 5, missing: 0, pending, queue: pending, reviewing: true, settledCount: 7, stage: "review", status: "ready_for_review", uploadFailed: false, userCount: 0,
  } as never);
  return { ...view, phase: "review" };
}

function errorView(phase: "missing" | "expired" | "cancelled"): ScanBatchView {
  return { ...readingView(), batchId: `design-${phase}`, phase, cards: [] };
}

function doneView(): ScanBatchView {
  const base = readingView();
  return {
    ...base, batchId: "design-done", phase: "done", completed: true, photos: 17, uploaded: 17, settled: 17,
    cards: Array.from({ length: 17 }, (_, index) => ({ ...base.cards[0]!, cardId: `done-${index}`, kind: "added" as const, section: null })),
    counts: { ...base.counts, created: 14, merged: 2, unreadable: 1, failed: 1 },
    density: { 1: 2, 2: 13, 3: 1 },
    events: [{ eventId: "ev-cfo", title: SCAN_DESIGN_SAMPLE.done.event, startsAt: "2026-10-07T10:00:00Z" }],
    writtenEventIds: ["ev-cfo"], createdAt: "2026-10-07T10:00:00Z",
  };
}

const NOOP: ScanBatchActions = {
  setDraft: () => undefined,
  settle: async () => "skipped",
  refresh: async () => undefined,
  retryRecognition: async () => undefined,
  replace: async () => false,
  chooseEvent: () => undefined,
  retryUpload: () => undefined,
  reattach: () => undefined,
};

export function ScanDesignFixtureClient({ name }: { name: ScanDesignFixture }) {
  const view = useMemo(() => {
    if (name === "design-done") return doneView();
    if (name === "design-reading") return readingView();
    if (name === "design-review") return reviewView();
    return errorView(name.slice("design-".length) as "missing" | "expired" | "cancelled");
  }, [name]);
  return <ScanBatchScreen view={view} actions={NOOP} />;
}
