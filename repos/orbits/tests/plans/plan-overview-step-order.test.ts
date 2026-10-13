/**
 * 390「話すべき人 · ステップ順」（用户 2026-10-13）：类型行按 Step 顺序排（不是按配点），挂在两个 Step 下的类型只在第一个出现，
 * 不属于任何 Step 的类型排在最后；名字用短名（PersonRow 读 shortLabel）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { stepOrderedCards } from "../../app/(app)/app/orbit-2026/plan/overview-model";
import { fixturesA } from "../../features/plans/v2/design-fixtures/a";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";

const SCOPE = { actorId: "step-order", workspaceId: "w" };

test("390 people list: step order, each type once, short labels (b8 plan390 sample)", async () => {
  const repository = createMemoryPlanV2Repository();
  repository.seed(SCOPE, fixturesA["b8-overview-many"]!());
  const service = createPlanV2Service({ createContact: async () => "x", events: async () => [], now: () => new Date("2026-10-12T03:00:00Z"), repository, sample: true, scope: SCOPE });
  const overview = await service.overview("demo-plan-series-a");
  assert.ok(overview);
  const cards = stepOrderedCards(overview);
  assert.deepEqual(cards.map((card) => card.type.key), ["cfo", "funded_founder", "angel", "vc_partner", "cvc", "lawyer"], "Step 1 CFO · Step 2 起業家 / エンジェル · Step 3 VC / CVC · Step 4 弁護士 — not by points (VC 30 first)");
  assert.equal(new Set(cards.map((card) => card.type.key)).size, cards.length, "a type under two steps appears once");
  assert.equal(cards.find((card) => card.type.key === "vc_partner")?.type.shortLabel, "VC");
});
