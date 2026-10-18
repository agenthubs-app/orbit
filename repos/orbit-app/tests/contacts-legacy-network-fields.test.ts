import assert from "node:assert/strict";
import test from "node:test";

import { withLegacyNetworkFields } from "../src/view-models/contacts-local";

// R11a REVIEW S1：旧镜像兜底读同步详情的 `contact`（服务端 `features/contacts/live-detail-service.ts` 写的是
// `{ state: "success", contact, editableTagOptions, … }`），名片备注是 `note:business-card-notes:` 那条笔记。
const card = { id: "c-old", displayName: "前田 隼人", organization: "", role: "", sourceType: "event_import", status: "active",
  pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z" };
const source = { type: "event_import", id: "src-1", label: "イベント名簿", evidenceId: "ev-1" };
const note = (noteId: string, body: string) => ({ noteId, body, authorLabel: "x", createdAt: "2026-10-01T00:00:00.000Z", source, evidenceIds: [], noteWriteExecuted: false, productionAuditLogWriteExecuted: false });
const syncedRow = (contact: Record<string, unknown>) => ({
  id: "rec-old", card, tags: [], search: { text: "前田", occurredAt: "2026-10-01T00:00:00.000000Z", updatedAt: "2026-10-01T00:00:00.000000Z", error: null },
  detail: { state: "success", contact: { id: "c-old", displayName: "前田 隼人", source, tags: [], status: "active", ...contact }, editableTagOptions: [], editableStatusOptions: [] },
}) as never;

test("a real legacy sync row: phone + 出会い in the business-card note → ●●○, met = イベント (event import wins), chip = イベント", () => {
  const filled = withLegacyNetworkFields(syncedRow({
    primaryPhone: "090-0000-0000",
    notes: [note("note:business-card-notes:c-old", "出会い：紹介（田中さん）"), note("note:relationship-evidence:c-old:ev-1", "名簿から追加")],
  })) as unknown as { card: { density: number; metKind: string; sourceChip: string } };
  assert.equal(filled.card.density, 2);
  assert.equal(filled.card.metKind, "event");
  assert.equal(filled.card.sourceChip, "event");
});

test("only notes the user wrote count as 往来 (the generated / evidence notes do not)", () => {
  const generatedOnly = withLegacyNetworkFields(syncedRow({ notes: [note("note:live-contact-detail:c-old", "自動の文脈"), note("note:relationship-evidence:c-old:ev-1", "名簿")] })) as unknown as { card: { density: number } };
  assert.equal(generatedOnly.card.density, 1);
  const written = withLegacyNetworkFields(syncedRow({ notes: [note("note:live-contact-detail-update:c-old:1", "ランチで近況")] })) as unknown as { card: { density: number } };
  assert.equal(written.card.density, 3);
});

test("a row that already carries the R11a fields is returned unchanged", () => {
  const row = { ...(syncedRow({}) as object), card: { ...card, density: 1, sourceChip: "manual", metKind: "other" } } as never;
  assert.equal(withLegacyNetworkFields(row), row);
});
