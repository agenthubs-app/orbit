/**
 * W0048a SC-W0048a-02：快照输出校验器（编造 id、单语、带分数、全无依据四组）与 mock 生成器同一出口。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMockSnapshotGenerator, buildMockSnapshotContent, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import { SnapshotValidationError, validateSnapshotOutput } from "../../features/network-analysis/snapshot-validator";
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
  for (const fragment of ["佐藤", "Software", "4"]) assert.ok(text.includes(fragment), `mock text uses real data: ${fragment}`);
  assert.equal(result.blocks.find((entry) => entry.kind === "gap")?.needId, "need-1");
});
