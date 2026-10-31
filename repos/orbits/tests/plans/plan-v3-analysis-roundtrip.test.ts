/**
 * R33 SC-R33-01：`plans.analysis` 的 `schemaVersion: 3`（outcome / summary / verdict / confidence / orderReasons /
 * comparison / keyNumbers / risks / sources，sources 含 landscape 与 web 两种）经内存仓库与 PostgreSQL 仓库写入再读出字段一致；
 * `schemaVersion: 2` 的行读出时新字段为 undefined。PostgreSQL 用例只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryPlanV2Repository, createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import type { PlanV2Analysis, PlanV2Repository, PlanV2Row } from "../../features/plans/v2/types";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const SCOPE = { actorId: "actor:alice", workspaceId: WORKSPACE };

export const V3_ANALYSIS: PlanV2Analysis = {
  schemaVersion: 3,
  diagnosis: "見立て",
  conclusion: "結論",
  citations: [{ id: "L-101", version: 2 }],
  allocationReasons: ["VC を厚く"],
  basis: [{ kind: "landscape", label: "L-101", ref: "L-101@2" }],
  outcome: "年内にリードが決まる",
  summary: {
    text: "シード後の調達は VC が中心です。CVC は PoC 条件が合えば並行できます。",
    marks: [{ start: 7, end: 12 }],
    refs: [{ start: 0, end: 18, ref: { kind: "source", sourceId: "S1" } }, { start: 18, end: 38, ref: { kind: "answer", questionKey: "F3" } }],
  },
  verdict: "feasible",
  confidence: { level: "mid", reason: "リード候補が 1 社ある" },
  orderReasons: [{ text: "数字を固めてから投資家に会う", sourceIds: ["S1"] }, { text: "CVC は条件が見えてから", sourceIds: ["S2"] }],
  comparison: {
    title: "先に会う投資家",
    funnel: "7 類型を段階で絞って 5 類型",
    rows: [
      { label: "VC パートナー", score: 82, verdict: "preferred", sourceIds: ["S1"], typeKey: "vc_partner" },
      { label: "CVC", score: 55, verdict: "possible", sourceIds: ["S2"], typeKey: "cvc" },
      { label: "銀行", score: 20, verdict: "not_recommended", sourceIds: ["S2"], typeKey: null },
    ],
  },
  keyNumbers: [{ value: "3 社", label: "シリーズA のリード候補の目安", sourceIds: ["S1"] }],
  risks: [{ kind: "risk", text: "市況が悪化すると条件が変わる" }, { kind: "unverified", text: "CVC の PoC 予算" }],
  sources: [
    { id: "S1", kind: "landscape", landscapeId: "L-101", version: 2 },
    { id: "S2", kind: "web", url: "https://example.jp/cvc-2026", title: "CVC 動向 2026", fetchedAt: "2026-11-01T00:00:00.000Z", snippet: "CVC の投資件数は前年比 12% 増。", query: "CVC 投資 動向 2026" },
  ],
};

export function v3Row(id: string, analysis: PlanV2Analysis = V3_ANALYSIS): PlanV2Row {
  return {
    id,
    version: 1,
    status: "active",
    goalId: `goal:${id}`,
    goalText: "シリーズA を年内に",
    goalKind: "fundraising",
    purposeText: null,
    purposeLevel: null,
    premise: [],
    analysis,
    steps: [{ doneCriteria: "VC 3 人と話す", key: "step-1", personTypeKeys: ["vc_partner"], title: "VC と話す", why: null }],
    eventAllocation: 10,
    eventTargetCount: 2,
    revision: 1,
    manualEditAvailable: true,
    startsOn: "2026-11-01",
    creationKey: `create:${id}`,
    achievedAt: null,
    lastOpenedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    archivedAt: null,
  };
}

const V2_ANALYSIS: PlanV2Analysis = { schemaVersion: 2, diagnosis: "見立て", conclusion: "結論", citations: [], allocationReasons: [], basis: [] };
const V3_KEYS = ["outcome", "summary", "verdict", "confidence", "orderReasons", "comparison", "keyNumbers", "risks", "sources"] as const;

async function roundTrip(repository: PlanV2Repository) {
  await repository.transact(SCOPE, async (tx) => {
    await tx.insertPlan(v3Row("plan-v3"));
    await tx.insertPlan({ ...v3Row("plan-v2", V2_ANALYSIS), version: 2 });
  });
  const [v3, v2] = await repository.read(SCOPE, async (reader) => [await reader.plan("plan-v3"), await reader.plan("plan-v2")]);
  assert.deepEqual(v3?.analysis, V3_ANALYSIS, "v3 analysis comes back field for field");
  assert.equal(v3?.analysis.sources?.map((source) => source.kind).join(","), "landscape,web");
  assert.equal(v2?.analysis.schemaVersion, 2);
  for (const key of V3_KEYS) assert.equal(v2?.analysis[key], undefined, `a v2 row reads ${key} as undefined`);
  // 原地更新（revision 不变）也不丢字段。
  await repository.transact(SCOPE, async (tx) => {
    const plan = (await tx.plan("plan-v3"))!;
    await tx.updatePlan({ ...plan, analysis: { ...plan.analysis, outcome: "リード 1 社が決まる" }, updatedAt: "2026-11-02T00:00:00.000Z" });
  });
  const updated = await repository.read(SCOPE, (reader) => reader.plan("plan-v3"));
  assert.deepEqual(updated?.analysis, { ...V3_ANALYSIS, outcome: "リード 1 社が決まる" });
}

test("memory repository: a v3 analysis round-trips and a v2 row keeps its new fields undefined", async () => {
  await roundTrip(createMemoryPlanV2Repository());
});

test("PostgreSQL repository: a v3 analysis round-trips through the plans.analysis json column", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    await roundTrip(createPostgresPlanV2Repository({ pool }));
    const stored = (await pool.query("select analysis->>'schemaVersion' as v, analysis->'sources'->1->>'kind' as kind from plans where id = 'plan-v3'")).rows[0];
    assert.deepEqual(stored, { kind: "web", v: "3" });
  });
});
