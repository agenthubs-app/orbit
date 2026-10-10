/**
 * R22 测试夹具：一份可确定的 v2 方案（资金调达模板，配点合计 100）与带固定时钟的服务。
 */
import type { PlanV2Repository } from "../../features/plans/v2/types";
import { createPlanV2Service, type CreatePlanFromDraftInput } from "../../features/plans/v2/service";
import type { PlanReferenceValidator } from "../../features/plans/contract";

export const SCOPE = { actorId: "actor:alice", workspaceId: "workspace:plans-v2" };

export function draftInput(overrides: Partial<CreatePlanFromDraftInput> = {}): CreatePlanFromDraftInput {
  const type = (key: string, allocation: number, targetCount: number, label: string) => ({
    allocation,
    countRule: "3 問のうち 2 問以上を聞けたら「話せた」です。",
    emoji: "🏦",
    introRoutes: [],
    key,
    questions: ["q1", "q2", "q3"],
    recognizeHints: [],
    roleSituation: `${label}の人`,
    shortLabel: label,
    shortLabelId: key,
    slot: key,
    targetCount,
    why: "why",
  });
  return {
    content: {
      allocationReasons: [],
      basis: [],
      citations: [],
      conclusion: "結論",
      diagnosis: "見立て",
      event: { allocation: 10, targetCount: 2 },
      personTypes: [
        type("cfo", 10, 1, "CFO 経験者"),
        type("funded_founder", 15, 2, "調達経験のある起業家"),
        type("angel", 10, 2, "エンジェル投資家"),
        type("vc_partner", 30, 3, "VC パートナー"),
        type("cvc", 15, 3, "CVC 担当者"),
        type("lawyer", 10, 1, "弁護士"),
      ],
      steps: [
        { doneCriteria: "CFO に見てもらう", key: "s1", personTypeKeys: ["cfo"], title: "数字を固める", why: null },
        { doneCriteria: "VC 3 人と話す", key: "s2", personTypeKeys: ["vc_partner"], title: "VC と話す", why: null },
      ],
    },
    creationKey: "draft-1",
    goalId: "intake-1",
    goalKind: "fundraising",
    goalText: "シリーズA 資金調達",
    manualEditAvailable: true,
    premise: [{ guessed: false, key: "purpose", label: "目的", source: "background", value: "伸ばす" }],
    purposeLevel: 3,
    purposeText: "伸ばす",
    ...overrides,
  };
}

export function steppingClock(start = "2026-10-07T01:00:00.000Z") {
  let time = Date.parse(start);
  return () => new Date((time += 1000));
}

export const ANY_REFERENCES: PlanReferenceValidator = {
  findMissingContactIds: async (ids) => ids.filter((id) => id.startsWith("missing")),
  findMissingEventIds: async (ids) => ids.filter((id) => id.startsWith("missing")),
};

export function serviceFor(repository: PlanV2Repository, scope = SCOPE, now = steppingClock()) {
  let n = 0;
  return createPlanV2Service({ newId: () => `id${(n += 1)}`, now, references: ANY_REFERENCES, repository, scope });
}
