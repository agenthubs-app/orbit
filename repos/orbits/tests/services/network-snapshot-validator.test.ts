/**
 * W0048a SC-W0048a-02：快照输出校验器（编造 id、单语、带分数、全无依据四组）与 mock 生成器同一出口。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMockSnapshotGenerator, buildMockSnapshotContent, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import { SnapshotValidationError, snapshotTextHasStatistics, snapshotTextLeaksIds, validateSnapshotOutput } from "../../features/network-analysis/snapshot-validator";
import { buildSnapshotPromptInput, restoreSnapshotAliases } from "../../features/network-analysis/deepseek-snapshot-generator";
import { createDeepseekSnapshotGenerator } from "../../features/network-analysis/deepseek-snapshot-generator";

const allowed = {
  contactIds: new Set(["c1", "c2", "c3", "c4"]),
  needIds: new Set(["need-1"]),
  recordIds: new Set(["memo:n1", "encounter:e1"]),
};

const block = (kind: string, extra: Record<string, unknown> = {}) => ({ contactIds: ["c1"], en: `${kind} en`, kind, recordIds: [], zh: `${kind} 中文`, ...extra });

test("SC-02 fabricated ids are dropped from evidence; a block left without evidence is dropped", () => {
  const result = validateSnapshotOutput(JSON.stringify({
    blocks: [
      block("diagnosis", { contactIds: ["c1", "ghost"], recordIds: ["memo:n1", "memo:fake"] }),
      block("insight", { contactIds: ["c2"] }),
      block("insight", { contactIds: ["c3", "c-invented"] }),
      block("insight", { contactIds: ["nobody"], recordIds: ["fake:1"] }),
      block("gap", { contactIds: ["c4"], needId: "need-invented" }),
      block("gap", { contactIds: ["c4"], needId: "need-1" }),
    ],
  }), allowed);
  assert.deepEqual(result.blocks.map((entry) => entry.key), ["diagnosis-1", "insight-1", "insight-2", "gap-1", "gap-2"]);
  assert.deepEqual(result.blocks[0]!.evidence, { contactIds: ["c1"], recordIds: ["memo:n1"] });
  assert.deepEqual(result.blocks[2]!.evidence.contactIds, ["c3"]);
  assert.equal(result.blocks[3]!.needId, undefined);
  assert.equal(result.blocks[4]!.needId, "need-1");
  assert.equal(result.dropped.blocks, 1);
  assert.ok(result.dropped.contactIds >= 3 && result.dropped.recordIds === 2 && result.dropped.needIds === 1);
});

test("SC-02 one call yields zh and en; a block with either language empty is dropped", () => {
  const result = validateSnapshotOutput({
    blocks: [
      block("diagnosis"),
      block("insight", { en: "" }),
      block("insight", { zh: "   " }),
      block("insight", { contactIds: ["c2"] }),
      { evidence: { contactIds: ["c3"], recordIds: [] }, kind: "insight", text: { en: "nested en", zh: "嵌套" } },
    ],
  }, allowed);
  assert.equal(result.blocks.filter((entry) => entry.kind === "insight").length, 2);
  for (const entry of result.blocks) assert.ok(entry.text.zh && entry.text.en);
});

test("SC-02 model scores and extra fields are discarded (no statistics in the snapshot)", () => {
  const result = validateSnapshotOutput({
    blocks: [
      block("diagnosis", { coverageScore: 87, score: 0.9 }),
      block("insight", { percentage: 40 }),
      block("insight", { contactIds: ["c2"], tierCounts: { core: 3 } }),
    ],
    coverageScore: 0.42,
  }, allowed);
  for (const entry of result.blocks) {
    assert.deepEqual(Object.keys(entry).sort(), ["evidence", "key", "kind", "text"]);
    assert.deepEqual(Object.keys(entry.text).sort(), ["en", "zh"]);
  }
});

test("SC-02 key blocks missing → the whole snapshot fails (no diagnosis, fewer than 2 insights, or no evidence at all)", () => {
  assert.throws(() => validateSnapshotOutput({ blocks: [block("insight"), block("insight", { contactIds: ["c2"] })] }, allowed), (error: unknown) =>
    error instanceof SnapshotValidationError && error.code === "MISSING_KEY_BLOCKS");
  assert.throws(() => validateSnapshotOutput({ blocks: [block("diagnosis"), block("insight")] }, allowed), SnapshotValidationError);
  // 全无依据：每一块的依据都是编造的 → 全部丢弃 → 整份失败。
  assert.throws(() => validateSnapshotOutput({
    blocks: [block("diagnosis", { contactIds: ["x"] }), block("insight", { contactIds: ["y"] }), block("insight", { contactIds: ["z"] })],
  }, allowed), (error: unknown) => error instanceof SnapshotValidationError && error.code === "MISSING_KEY_BLOCKS");
  assert.throws(() => validateSnapshotOutput("not json", allowed), (error: unknown) => error instanceof SnapshotValidationError && error.code === "INVALID_OUTPUT");
  assert.throws(() => validateSnapshotOutput({ items: [] }, allowed), (error: unknown) => error instanceof SnapshotValidationError && error.code === "INVALID_OUTPUT");
});

const INPUT: SnapshotInput = {
  contactTotal: 4,
  contacts: [
    { dormant: false, id: "c1", industry: "Software", name: "佐藤", organization: "Cloudline", records: [{ id: "memo:n1", occurredAt: "2026-09-30T00:00:00.000Z", source: "memo", title: "Wrote a memo" }], region: null, role: "CTO", seniorityGroup: "decision", tier: "active" },
    { dormant: false, id: "c2", industry: "Software", name: "田中", organization: "Nexa", records: [], region: null, role: "Engineer", seniorityGroup: "staff", tier: "new" },
    { dormant: true, id: "c3", industry: "Finance", name: "鈴木", organization: "Sakura", records: [], region: null, role: "Partner", seniorityGroup: "decision", tier: "core" },
    { dormant: false, id: "c4", industry: null, name: "高橋", organization: null, records: [], region: null, role: null, seniorityGroup: "other", tier: null },
  ],
  goal: "认识 SaaS 决策人",
  needs: [{ description: null, id: "need-1", industry: "Software", title: "SaaS 决策人" }],
};

test("SC-02 mock and DeepSeek share one interface; mock text is assembled only from the real input and passes the validator", async () => {
  const mock = createMockSnapshotGenerator();
  const deepseek = createDeepseekSnapshotGenerator({ apiKey: "test", fetchImplementation: (async () => { throw new Error("unused"); }) as typeof fetch });
  for (const generator of [mock, deepseek]) {
    assert.equal(typeof generator.generate, "function");
    assert.equal(typeof generator.billable, "boolean");
    assert.ok(generator.promptVersion && generator.model);
  }
  assert.equal(mock.billable, false);
  assert.equal(deepseek.billable, true);
  const { content, usage } = await mock.generate(INPUT);
  assert.equal(usage, null);
  assert.equal(content, buildMockSnapshotContent(INPUT));
  const result = validateSnapshotOutput(content, allowed);
  assert.equal(result.dropped.contactIds + result.dropped.recordIds, 0, "mock cites only input ids");
  const text = result.blocks.map((entry) => `${entry.text.zh} ${entry.text.en}`).join(" ");
  for (const fragment of ["佐藤", "Software"]) assert.ok(text.includes(fragment), `mock text uses real data: ${fragment}`);
  for (const entry of result.blocks) {
    assert.equal(snapshotTextHasStatistics(entry.text.zh, ["SaaS 决策人"]), false, entry.text.zh);
    assert.equal(snapshotTextHasStatistics(entry.text.en), false, entry.text.en);
    assert.doesNotMatch(`${entry.text.zh} ${entry.text.en}`, /\d/, "the mock narrative stores no counts");
  }
  assert.equal(result.blocks.find((entry) => entry.kind === "gap")?.needId, "need-1");
});

test("SC-02 P2-3 text that carries a raw id, a record reference, a UUID or a model alias is dropped", () => {
  const leaks = [
    "可以先跟进 c1 以外的人（plan:cf2cafad-a106-4b51-9697-f0923bdbc20b）。",
    "See note:note:w0047-c8 for details.",
    "Follow up with C3 first.",
    "联系人 contact:business-card:9fa66f 很关键。",
    "id 0f8fad5b-d9cb-469f-a165-70867728950e",
  ];
  for (const text of leaks) assert.equal(snapshotTextLeaksIds(text, allowed), true, text);
  assert.equal(snapshotTextLeaksIds("Note: meet at 10:30, see https://example.com", allowed), false);
  assert.equal(snapshotTextLeaksIds("林玫是当前最可推进的投资人线索。", allowed), false);
  const result = validateSnapshotOutput({ blocks: [block("diagnosis"), block("insight"), block("insight", { contactIds: ["c2"] }), block("insight", { contactIds: ["c3"], en: "Mentions memo:n1 here." })] }, allowed);
  assert.equal(result.blocks.filter((entry) => entry.kind === "insight").length, 2);
  assert.equal(result.dropped.unsafeText, 1);
});

test("SC-02 P2-4 statistics in text are rejected (percent, score, people counts) while the goal and need titles may contain numbers", () => {
  for (const text of ["覆盖率 45%", "百分之三十", "relationship score is high", "你有 12 位联系人", "3人来自金融", "You have 12 contacts in finance", "5 people are dormant"]) {
    assert.equal(snapshotTextHasStatistics(text), true, text);
  }
  for (const text of ["林玫在投资领域最活跃。", "Lin Mei is the most active investor.", "10月有一场活动。"]) assert.equal(snapshotTextHasStatistics(text), false, text);
  assert.equal(snapshotTextHasStatistics("「认识 2 位关注企业软件的早期投资人」可以先从林玫入手。", ["认识 2 位关注企业软件的早期投资人"]), false);
  const withPhrases = { ...allowed, phrases: ["认识 2 位投资人"] };
  const result = validateSnapshotOutput({ blocks: [
    block("diagnosis", { zh: "你有 20 位联系人。" }),
    block("diagnosis", { zh: "「认识 2 位投资人」还缺一位。" }),
    block("insight"), block("insight", { contactIds: ["c2"] }),
  ] }, withPhrases);
  assert.equal(result.blocks[0]!.text.zh, "「认识 2 位投资人」还缺一位。");
});

test("SC-02 P2-3 prompt input carries only aliases; the response maps back to the real ids", () => {
  const { aliases, payload } = buildSnapshotPromptInput(INPUT);
  const sent = JSON.stringify(payload);
  for (const id of ["c1", "c2", "memo:n1", "need-1"]) assert.ok(!sent.includes(`"${id}"`), id);
  assert.ok(sent.includes('"C1"') && sent.includes('"R1"') && sent.includes('"N1"'));
  const restored = JSON.parse(restoreSnapshotAliases(JSON.stringify({ blocks: [{ contactIds: ["C1", "C9"], kind: "gap", needId: "N1", recordIds: ["R1"], zh: "x", en: "y" }] }), aliases));
  assert.deepEqual(restored.blocks[0].contactIds, ["c1", "C9"]);
  assert.deepEqual(restored.blocks[0].recordIds, ["memo:n1"]);
  assert.equal(restored.blocks[0].needId, "need-1");
});
