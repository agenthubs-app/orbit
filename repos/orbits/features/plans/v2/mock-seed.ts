/**
 * R22：mock 模式下的计划 v2 —— 把演示世界的「シリーズA 資金調達」装进内存仓储，
 * 这样 mock 下所有 v2 接口（首页、概要、计分）读写的是同一份示例计划（`sample: true`，不写库）。
 */
import { PLAN_EVENT_SEGMENT_KEY } from "../../../shared/compute/plan-score";
import { DEMO_PEOPLE, DEMO_PLAN } from "../../../shared/mock/demo-world";
import { demoPlanAwards, demoPlanDetail } from "../../../shared/mock/demo-world/fixtures";
import type { MemoryPlanV2State } from "./repository";
import type { PlanAwardPayload, PlanV2LogEntry, PlanV2TypeItem } from "./types";

export function demoPlanV2State(): Partial<MemoryPlanV2State> {
  const detail = demoPlanDetail;
  const at = "2026-09-15T09:00:00.000Z";
  const typeItems: PlanV2TypeItem[] = detail.content.personTypes.map((type, index) => {
    const source = DEMO_PLAN.personTypes.find((item) => item.key === type.key)!;
    return {
      allocation: type.allocation,
      contactLinks: source.personIds.map((contactId) => ({ contactId, establishedAt: at, linkedAt: at, state: "established" as const })),
      createdAt: at,
      id: type.itemId,
      personType: {
        countRule: type.countRule,
        emoji: type.emoji,
        introRoutes: [...type.introRoutes],
        key: type.key,
        opener: type.opener ?? null,
        persona: type.persona ?? null,
        questions: [...type.questions],
        recognizeHints: [...type.recognizeHints],
        shortLabelId: type.shortLabelId,
        why: type.why,
      },
      planId: detail.planId,
      primaryIndustryId: type.key === "vc_partner" || type.key === "cvc" || type.key === "angel" ? "finance_investment" : null,
      roleSituation: type.roleSituation,
      secondaryIndustryId: type.key === "vc_partner" ? "finance_investment.venture_capital" : null,
      shortLabel: type.shortLabel,
      skippedAt: type.skipped ? "2026-09-20T00:00:00.000Z" : null,
      slot: type.slot,
      sortKey: index + 1,
      targetCount: type.targetCount,
      updatedAt: at,
    };
  });
  const log: PlanV2LogEntry[] = demoPlanAwards.map((award) => {
    const item = typeItems.find((type) => type.personType.key === award.typeKey);
    const contactId = award.id.startsWith(`demo-award-${award.typeKey}-demo-person`) ? award.id.slice(`demo-award-${award.typeKey}-`.length) : null;
    const eventId = award.typeKey === PLAN_EVENT_SEGMENT_KEY ? award.id.slice("demo-award-event-".length) : null;
    const payload: PlanAwardPayload = { anonymous: false, basis: award.basis, contactId, eventId, part: award.part, points: award.points, typeKey: award.typeKey };
    return {
      author: "user",
      body: `${item?.shortLabel ?? "イベント"}：+${award.points}`,
      createdAt: award.at,
      event: "score_awarded",
      id: award.id,
      idempotencyKey: `demo:${award.id}`,
      itemId: item?.id ?? null,
      linkedContactIds: contactId ? [contactId] : [],
      linkedEventId: eventId,
      payload: payload as unknown as Record<string, unknown>,
      planId: detail.planId,
    };
  });
  return {
    eventItems: DEMO_PLAN.event.attendedEventIds.map((eventId, index) => ({ createdAt: at, eventId, id: `demo-plan-event-${eventId}`, planId: detail.planId, sortKey: 1000 + index, status: "attended", title: "CFO Night Tokyo vol.18", updatedAt: at })),
    log,
    maxVersion: 1,
    plans: [{
      achievedAt: null,
      analysis: {
        allocationReasons: [...detail.content.allocationReasons],
        basis: [...detail.content.basis],
        citations: [...detail.content.citations],
        conclusion: detail.content.conclusion,
        diagnosis: detail.content.diagnosis,
        schemaVersion: 2,
        sample: true,
      },
      archivedAt: null,
      createdAt: at,
      creationKey: "demo-plan-draft",
      eventAllocation: detail.content.event.allocation,
      eventTargetCount: detail.content.event.targetCount,
      goalId: "demo-plan-goal",
      goalKind: "fundraising",
      goalText: detail.goal,
      id: detail.planId,
      lastOpenedAt: "2026-10-07T08:30:00+09:00",
      manualEditAvailable: detail.quota.manualEditAvailable,
      premise: [...detail.premise],
      purposeLevel: 3,
      purposeText: detail.purposeText,
      revision: detail.revision,
      startsOn: detail.startsOn,
      status: "active",
      steps: detail.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title, why: step.why })),
      updatedAt: at,
      version: 1,
    }],
    typeItems,
    // R24：演示世界的人（联系人投影）与几位候补（人物タイプ詳細的候补表）。
    contacts: DEMO_PEOPLE.map((person) => ({ id: person.id, isOrbitUser: person.id === "demo-person-aoki", lastInteractionAt: person.density === 3 ? "2026-10-01T10:00:00+09:00" : null, name: person.name, organization: person.company, role: person.role })),
    candidates: [
      { contactId: "demo-person-ito", needItemId: itemIdFor("cfo"), reason: null, strength: "candidate" as const, tier: "rule" as const },
      { contactId: "demo-person-kobayashi", needItemId: itemIdFor("angel"), reason: "起業家コミュニティを主宰し、エンジェル投資の経験がある", strength: "strong" as const, tier: "ai" as const },
      { contactId: "demo-person-sasaki", needItemId: itemIdFor("cvc"), reason: null, strength: "strong" as const, tier: "rule" as const },
      { contactId: "demo-person-okada", needItemId: itemIdFor("vc_partner"), reason: "VC でシリーズ A の案件を担当している", strength: "candidate" as const, tier: "ai" as const },
    ].map((candidate, index) => ({ ...candidate, createdAt: "2026-10-05T09:00:00+09:00", id: `demo-candidate-${index + 1}`, status: "pending" as const })),
  };

  function itemIdFor(key: string): string {
    return typeItems.find((type) => type.personType.key === key)!.id;
  }
}
