import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";

import type { AreaFile } from "./lib/cases";
import { loadAreaFile } from "./lib/cases";
import { checkAreaFiles, createCheckerContext } from "./lib/case-checker";
import { CHECKS, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";
import { casePatchDefinitions, patchSha256, replacingPatchOf, replacingSnapshots } from "./lib/patched-world";
import { isReplacingPatch, loadWorld, patchProblems, replaceRecords, snapshotKey, worldWithPatches, type FixtureRecord, type PatchDefinition, type WorldFixture } from "./lib/world";

/**
 * Patch keys that change the world wholesale (eval/README.md §3.4 「夹具增量的写法」): replace, replace_B,
 * replace_platform_events, and web_replay. Synthetic patches only.
 */

const record = (kind: FixtureRecord["kind"], id: string, account: string, data: Record<string, unknown> = {}): FixtureRecord => ({ account, data: { id, ...data }, id, kind, origin: "anchor" });

const BASE: FixtureRecord[] = [
  record("contact", "XC1", "A", { name: "甲的旧联系人" }),
  record("memo", "XM1", "A", { body: "甲的旧笔记" }),
  record("memory", "XMM1", "A", { content: "甲的旧记忆" }),
  record("rule", "XRU1", "A", { title: "甲的旧规则" }),
  record("contact", "XBC1", "B", { name: "乙的旧联系人" }),
  record("platform_event", "XE1", "platform", { title: "旧活动" }),
  record("contact", "XR1", "R", { name: "别的账号" }),
];

const WORLD: WorldFixture = {
  accounts: { A: { locale: "zh", name: "甲", workspace: "W1" }, B: { locale: "zh", name: "乙", workspace: "W2" } },
  anchors: BASE,
  bulkRanges: [{ account: "A", from: 1, kind: "contact", prefix: "XG", to: 9, width: 1 }, { account: "platform", from: 1, kind: "platform_event", prefix: "XP", to: 9, width: 1 }],
  clock: "2026-11-15T10:00:00+09:00",
  file: "synthetic.yaml",
  mainAccount: "A",
  patches: {},
  raw: {},
  timezone: "Asia/Tokyo",
  version: "synthetic",
  webReplay: { "world-fetch": { kind: "fetch", text: "世界自己的回放", url: "https://world.example.test/" } },
};

const ids = (records: readonly FixtureRecord[], account: string) => records.filter((item) => item.account === account).map((item) => item.id).sort();

test("replace: the main account holds exactly what the patch lists; other accounts and platform events stay", () => {
  const patch: PatchDefinition = { replace: { contacts: [{ id: "YC1", name: "新联系人" }], memos: [{ body: "新笔记", contactIds: ["YC1"], id: "YM1" }] } };
  const out = replaceRecords(BASE, patch, "A");
  assert.deepEqual(ids(out, "A"), ["YC1", "YM1"], "memory and rules the patch does not list are gone too");
  assert.deepEqual(ids(out, "B"), ["XBC1"]);
  assert.deepEqual(ids(out, "platform"), ["XE1"]);
  assert.deepEqual(ids(out, "R"), ["XR1"]);
  assert.equal(out.find((item) => item.id === "YC1")?.kind, "contact");
  assert.equal(out.find((item) => item.id === "YM1")?.origin, "patch");
});

test("replace with empty sections: the main account holds nothing", () => {
  const out = replaceRecords(BASE, { replace: { contacts: [], memory: [], rules: [] } }, "A");
  assert.deepEqual(ids(out, "A"), []);
  assert.deepEqual(ids(out, "B"), ["XBC1"]);
});

test("replace_B: account B is replaced, the main account is not", () => {
  const out = replaceRecords(BASE, { replace_B: { contacts: [{ id: "YBC1", name: "乙的新联系人" }], memory: [{ content: "乙的记忆", id: "YBM1" }] } }, "A");
  assert.deepEqual(ids(out, "B"), ["YBC1", "YBM1"]);
  assert.deepEqual(ids(out, "A"), ["XC1", "XM1", "XMM1", "XRU1"]);
  assert.equal(out.find((item) => item.id === "YBM1")?.kind, "memory");
});

test("replace_platform_events: the platform events are exactly the patch's", () => {
  const out = replaceRecords(BASE, { replace_platform_events: [{ id: "YE1", title: "新活动" }, { id: "YE2", startsAt: null, title: "未定时间" }] }, "A");
  assert.deepEqual(ids(out, "platform"), ["YE1", "YE2"]);
  assert.ok(out.filter((item) => item.account === "platform").every((item) => item.kind === "platform_event"));
  assert.deepEqual(ids(out, "A"), ["XC1", "XM1", "XMM1", "XRU1"]);
});

test("a patch without a replacing key leaves the records as they are", () => {
  const patch: PatchDefinition = { add: { contacts: [{ id: "YC9" }] } };
  assert.equal(isReplacingPatch(patch), false);
  assert.deepEqual(replaceRecords(BASE, patch, "A"), BASE);
});

test("worldWithPatches: the checks' world has the replacement, the replaced bulk ranges are gone, web_replay is added", () => {
  const replacing: PatchDefinition = { replace: { contacts: [{ id: "YC1" }] }, replace_platform_events: [{ id: "YE1" }], web_replay: { "patch-search": { kind: "search", match: "虚构公司", results: [{ title: "t", url: "https://p.example.test/" }] } } };
  const other: PatchDefinition = { web_replay: { "patch-fetch": { kind: "fetch", text: "页面", url: "https://p.example.test/a" } } };
  const world = worldWithPatches(WORLD, [replacing, other]);
  assert.deepEqual(ids(world.anchors, "A"), ["YC1"]);
  assert.deepEqual(ids(world.anchors, "platform"), ["YE1"]);
  assert.deepEqual(world.bulkRanges, [], "both ranges belong to replaced parts");
  assert.deepEqual(Object.keys(world.webReplay).sort(), ["patch-fetch", "patch-search", "world-fetch"]);
  assert.equal(world.webReplay["patch-fetch"].text, "页面");
  assert.deepEqual(WORLD.anchors, BASE, "the loaded world is not changed");
});

test("patchProblems: unknown keys and malformed replacing sections or replays are errors", () => {
  assert.deepEqual(patchProblems({ add: { contacts: [{ id: "YC1" }] }, replace: { memos: [{ id: "YM1" }] }, replace_B: {}, replace_platform_events: [{ id: "YE1" }], summary: "x", web_replay: { f: { kind: "fetch", url: "https://x.example.test/" }, s: { kind: "search", match: "x", results: [] } } }), []);
  assert.deepEqual(patchProblems({ replace_C: { contacts: [] } }), ['unknown patch key "replace_C"']);
  assert.ok(patchProblems({ replace: { platform_events: [] } }).some((problem) => /not a section an account holds/u.test(problem)));
  assert.ok(patchProblems({ replace: { gadgets: [] } }).some((problem) => /not a section/u.test(problem)));
  assert.ok(patchProblems({ replace: { contacts: [{ name: "无编号" }] } }).some((problem) => /needs an id/u.test(problem)));
  assert.ok(patchProblems({ replace: { contacts: { id: "YC1" } } }).some((problem) => /must be a list/u.test(problem)));
  assert.ok(patchProblems({ replace_platform_events: { id: "YE1" } }).some((problem) => /must be a list/u.test(problem)));
  assert.ok(patchProblems({ web_replay: { f: { kind: "fetch" } } }).some((problem) => /needs a url/u.test(problem)));
  assert.ok(patchProblems({ web_replay: { s: { kind: "search", results: [] } } }).some((problem) => /needs a match/u.test(problem)));
  assert.ok(patchProblems({ web_replay: { x: { kind: "crawl" } } }).some((problem) => /search or fetch/u.test(problem)));
});

test("a case may use one replacing patch; its snapshot key is <world>+<patch>", () => {
  const patches = { one: { replace: { contacts: [] } }, two: { replace_B: { contacts: [] } }, plain: { add: { contacts: [{ id: "YC1" }] } } };
  const definitions = casePatchDefinitions(["plain", "one"], WORLD, patches);
  assert.equal(replacingPatchOf(definitions)?.name, "one");
  assert.equal(snapshotKey("base-v1", "one"), "base-v1+one");
  assert.equal(snapshotKey("base-v1", null), "base-v1");
  assert.equal(replacingPatchOf(casePatchDefinitions(["plain"], WORLD, patches)), null);
  assert.throws(() => replacingPatchOf(casePatchDefinitions(["one", "two"], WORLD, patches)), /both replace the world/u);
  assert.notEqual(patchSha256(patches.one), patchSha256(patches.two));
});

const caseUsing = (patch: string, overrides: Record<string, unknown> = {}) => ({
  design: ["§9"], hard: [{ no_business_writes: true }], id: "AE-H-951", invariant: false, locale: "zh", patches: [patch], requirement: ["AG-R19"],
  rubric: [{ id: "R1", text: "回答说出了要点。" }], split: "dev", sprint: "AG00", steps: [{ user: "测试" }], title: "替换世界", world: "base-v1", ...overrides,
});

test("replacingSnapshots: the seed writes one snapshot per replacing patch the cases use", () => {
  const file = (cases: unknown[], newPatches: Record<string, unknown>) => ({ area: "H", cases, file: "H.yaml", new_patches: newPatches, proposed_checks: [], proposed_steps: [], raw: {}, sealed: false }) as unknown as AreaFile;
  const patch = { replace: { contacts: [{ id: "YC1", name: "新" }] } };
  const found = replacingSnapshots([file([caseUsing("whole"), caseUsing("whole", { id: "AE-H-952" })], { whole: patch })], ["base-v1"]);
  assert.deepEqual([...found.keys()], ["base-v1+whole"]);
  assert.equal(found.get("base-v1+whole")?.world, "base-v1");
  assert.equal(replacingSnapshots([file([caseUsing("whole")], { whole: patch })], ["regular-v1"]).size, 0, "only the worlds being seeded");
  assert.throws(() => replacingSnapshots([file([caseUsing("whole")], { whole: patch }), { ...file([caseUsing("whole", { id: "AE-H-953" })], { whole: { replace: { contacts: [] } } }), file: "X.yaml" } as AreaFile], ["base-v1"]), /two different patches/u);
});

function checkWith(testCase: Record<string, unknown>, newPatches: Record<string, unknown>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-patched-"));
  const file = path.join(dir, "H.yaml");
  fs.writeFileSync(file, yaml.dump({ area: "H", cases: [testCase], new_patches: newPatches, proposed_checks: [], proposed_steps: [] }));
  try {
    return checkAreaFiles([loadAreaFile(file)], createCheckerContext({ gateAreas: new Map(), worlds: new Map([["base-v1", loadWorld("base-v1")]]) }));
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

test("case checker: a replaced world's ids and replays are known, the replaced ids are not, unknown keys are errors", () => {
  const patch = {
    replace: { contacts: [{ id: "YC1", name: "新联系人" }], memos: [{ body: "x", id: "YM1" }] },
    replace_B: { contacts: [{ id: "YBC1", name: "乙" }] },
    replace_platform_events: [{ id: "YE1", title: "新活动" }],
    web_replay: { "patch-page": { kind: "fetch", text: "页面", url: "https://p.example.test/" } },
  };
  const good = caseUsing("whole", { hard: [{ private_reads_within: ["YC1", "YM1"] }, { no_business_writes: true }], settings: { web_replay: ["patch-page"] } });
  assert.deepEqual(checkWith(good, { whole: patch }), []);
  // C17 and M31 are base-v1's main account records, which the patch replaced.
  const stale = checkWith(caseUsing("whole", { hard: [{ private_reads_within: ["C17", "M31"] }] }), { whole: patch });
  assert.ok(stale.some((issue) => /references C17/u.test(issue.message)));
  assert.ok(stale.some((issue) => /references M31/u.test(issue.message)));
  const missingReplay = checkWith(caseUsing("whole", { settings: { web_replay: ["nowhere"] } }), { whole: patch });
  assert.ok(missingReplay.some((issue) => issue.field === "settings.web_replay"));
  const unknownKey = checkWith(caseUsing("whole"), { whole: { ...patch, swap: {} } });
  assert.ok(unknownKey.some((issue) => issue.field === "new_patches.whole" && /unknown patch key "swap"/u.test(issue.message)));
  const two = checkWith(caseUsing("whole", { patches: ["whole", "again"] }), { again: { replace_B: { contacts: [] } }, whole: patch });
  assert.ok(two.some((issue) => issue.field === "patches" && /both replace the world/u.test(issue.message)));
  // answer_excludes lists text fragments, not record ids.
  assert.deepEqual(checkWith(caseUsing("whole", { hard: [{ answer_excludes: ["IP67", "六周"] }] }), { whole: patch }), []);
});

test("answer_excludes also reads what the answer's blocks show", () => {
  const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
  const obs = (text: string, blocks: unknown[]): Observation => ({
    account: "A", accounts: { A: "user_a" }, answers: [{ citations: [], seq: 3, text }], businessChanges: [], cards: [], caseId: "AE-H-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
    entry: { acks: [], clients: {}, requests: [{ document: { answer: { blocks, sourceRefs: [], text } }, requestId: "agreq_1" }] } as never,
    fixtureIdOf: () => null, idMap: {}, reads: [], requests: [], unsupported: [],
  });
  const clean = obs("这篇笔记现在读不到了。", [{ text: "这篇笔记现在读不到了。", type: "paragraph" }]);
  assert.equal(CHECKS.answer_excludes(["秘密片段"], clean, context).status, "pass");
  assert.equal(CHECKS.answer_excludes(["秘密片段"], obs("含秘密片段", []), context).status, "fail");
  const onCard = obs("这篇笔记现在读不到了。", [{ items: [{ id: "memo:m1", kind: "memo", sub: "里面写着秘密片段", title: "规格" }], shown: 1, type: "records" }]);
  assert.equal(CHECKS.answer_excludes(["秘密片段"], onCard, context).status, "fail");
});
