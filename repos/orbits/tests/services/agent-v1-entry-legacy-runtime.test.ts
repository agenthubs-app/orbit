import assert from "node:assert/strict";
import test from "node:test";

import { cardsAsText } from "../../features/agent-v1/entry/legacy-runtime";
import type { OrbitAgentArtifactPayload } from "../../features/orbit-ai/artifact-contract";

/**
 * AG01 adapter: the existing runtime writes its reply on the assumption that the records it read
 * are shown as cards below it. The result document has no cards, so their content goes into the
 * delivered text (else "what is on my schedule" loses the schedule).
 */

const artifact = (items: { title: string; metadata?: { label: string; value: string }[] }[]): OrbitAgentArtifactPayload => ({
  result: { generatedView: { sections: [{ items: items.map((item, index) => ({ actions: [], evidenceIds: [], id: `i${index}`, metadata: item.metadata ?? [], title: item.title })), title: "日程" }], summary: "" } },
  task: { kind: "data_query" },
}) as unknown as OrbitAgentArtifactPayload;

test("cards are written out with their titles and fields, under a localized header", () => {
  const text = cardsAsText([artifact([{ metadata: [{ label: "时间", value: "11月19日 12:00–13:00" }], title: "和田中午餐" }])], "zh");
  assert.equal(text, "结果卡片：\n日程\n- 和田中午餐\n  时间: 11月19日 12:00–13:00");
  assert.match(cardsAsText([artifact([{ title: "Team weekly" }])], "en"), /^Result cards:\n/u);
  assert.match(cardsAsText([artifact([{ title: "週次定例" }])], "ja"), /^結果カード：\n/u);
});

test("no cards, or cards with no items, add nothing", () => {
  assert.equal(cardsAsText([], "zh"), "");
  assert.equal(cardsAsText([artifact([])], "zh"), "");
});
