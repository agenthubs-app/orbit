/**
 * W0011：今日要事「确认 N 张新名片」的计数口径（use-pending-cards 的纯函数）。
 * 只数识别已结束、未确认、未跳过、需要人看的卡；识别中与已取消 / 过期的批次记 0。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { EMPTY_CARD_BATCH_LEDGER, parseCardBatchLedger } from "../../app/(app)/app/contacts/card-batch-0918/card-batch-model";
import { countPendingCards } from "../../app/(app)/app/agent/iorbit-0918/use-pending-cards";

function item(cardId: string, seq: number, overrides: Partial<IngestItemDTO> = {}): IngestItemDTO {
  return {
    attemptCount: 1, batchId: "b1", cardId, clientDigest: `sha256:${cardId}`, confirmedContactId: null, createdAt: "",
    derivativeObjectKey: "k", derivativeSize: 1, errorCode: null, errorStage: null,
    extraction: { fullName: "山本 健一" } as unknown as IngestItemDTO["extraction"],
    extractionSchemaVersion: 1, id: `item-${cardId}`, imageDigest: "sha256:y", leaseExpiresAt: null, nextRetryAt: null,
    rawMimeType: "image/png", rawSize: 1, reviewIssues: [], seq, side: "front", sourceFileName: `IMG_${seq}.png`,
    status: "extracted", updatedAt: "", usage: null, version: 1,
    ...overrides,
  } as IngestItemDTO;
}

const detail = (status: string, items: IngestItemDTO[]) =>
  ({ batch: { createdAt: "2026-09-28T01:05:00.000Z", id: "b1", status }, items }) as unknown as Parameters<typeof countPendingCards>[0];

test("counts extracted and failed cards still waiting for the user, not confirmed or skipped ones", () => {
  const items = [
    item("c1", 1),
    item("c2", 2, { extraction: null, status: "terminal_failed" }),
    item("c3", 3, { confirmedContactId: "contact:1", status: "confirmed" }),
    item("c4", 4, { status: "skipped" }),
  ];
  assert.equal(countPendingCards(detail("ready_for_review", items), EMPTY_CARD_BATCH_LEDGER), 2);
});

test("batches still uploading / recognizing, or cancelled / expired, count as zero", () => {
  const items = [item("c1", 1)];
  for (const status of ["collecting", "processing", "cancelled", "expired"]) {
    assert.equal(countPendingCards(detail(status, items), EMPTY_CARD_BATCH_LEDGER), 0, status);
  }
});

test("same count rule as the host pill: cards deferred with 稍后处理 or auto-imported in the local ledger are not counted", () => {
  const items = [item("c1", 1), item("c2", 2), item("c3", 3)];
  const ledger = parseCardBatchLedger(JSON.stringify({ auto: ["c3"], later: ["c1"], merged: [], notified: true, user: [] }));
  assert.equal(countPendingCards(detail("ready_for_review", items), ledger), 1);
  // 损坏的账本退回空账本。
  assert.deepEqual(parseCardBatchLedger("{not json"), EMPTY_CARD_BATCH_LEDGER);
});

test("W0021: the lean ?view=cards rows give the same count as the full batch detail", () => {
  const cardState = (entry: IngestItemDTO) => ({
    cardId: entry.cardId, cardIdentityExplicit: entry.cardIdentityExplicit, confirmedContactId: entry.confirmedContactId,
    createdAt: entry.createdAt, id: entry.id, seq: entry.seq, side: entry.side, status: entry.status,
  });
  const fixtures: Array<[string, IngestItemDTO[], string]> = [
    ["ready_for_review", [item("c1", 1), item("c2", 2, { extraction: null, status: "terminal_failed" }), item("c3", 3, { confirmedContactId: "contact:1", status: "confirmed" }), item("c4", 4, { status: "skipped" })], "{}"],
    ["ready_for_review", [item("c1", 1), item("c2", 2), item("c3", 3)], JSON.stringify({ auto: ["c3"], later: ["c1"], merged: [], notified: true, user: [] })],
    // 正反面：同一张卡两面，其中一面还在识别中。
    ["ready_for_review", [item("c1", 1), item("c1", 2, { id: "item-c1-back", side: "back", status: "processing" })], "{}"],
    ["completed", [item("c1", 1, { confirmedContactId: "contact:1", status: "confirmed" })], "{}"],
    ["processing", [item("c1", 1)], "{}"],
  ];
  for (const [status, items, ledgerText] of fixtures) {
    const ledger = parseCardBatchLedger(ledgerText);
    const full = countPendingCards(detail(status, items), ledger);
    const lean = countPendingCards({ batch: { createdAt: "2026-09-28T01:05:00.000Z", id: "b1", status: status as never }, items: items.map(cardState) }, ledger);
    assert.equal(lean, full, `${status} ${ledgerText}`);
  }
});
