/**
 * W0008 计划生成测试共用的输入：本人的已确认联系人、真实活动目录、生成器输入。
 */
import { createPlanBootstrapService } from "../../features/plans/bootstrap";
import type { PlanHorizon, PlanSnapshot } from "../../features/plans/contract";
import type { PlanGeneratorInput, PlanInputContact, PlanInputEvent } from "../../features/plans/generator";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { steppingClock } from "./plan-fixture";

export const ME = "actor:me";
export const OTHER = "actor:other";
export const STARTS_ON = "2026-09-28";
export const NOW = new Date("2026-09-28T03:00:00.000Z");

export function contact(overrides: Partial<PlanInputContact> & { id: string }): PlanInputContact {
  return {
    createdAt: "2026-01-10T00:00:00.000Z",
    displayName: overrides.id.replace(/^contact:/, ""),
    lastInteractionAt: null,
    organization: null,
    ownerId: ME,
    primaryIndustryId: null,
    role: null,
    secondaryIndustryId: null,
    ...overrides,
  };
}

export const CONTACTS: PlanInputContact[] = [
  contact({
    createdAt: "2026-09-01T00:00:00.000Z",
    displayName: "王砚",
    id: "contact:wang",
    lastInteractionAt: "2026-09-20T00:00:00.000Z",
    organization: "北辰精工",
    primaryIndustryId: "manufacturing_supply_chain",
    role: "采购部长",
  }),
  contact({
    createdAt: "2026-09-10T00:00:00.000Z",
    displayName: "佐藤美咲",
    id: "contact:sato",
    organization: "丸和工业",
    primaryIndustryId: "manufacturing_supply_chain",
    role: "情报系统课长",
  }),
  contact({
    createdAt: "2026-08-10T00:00:00.000Z",
    displayName: "林志远",
    id: "contact:lin",
    organization: "Cloudia",
    primaryIndustryId: "technology_internet",
    role: "合作伙伴营业",
  }),
];

export const EVENTS: PlanInputEvent[] = [
  { id: "event:jetro-1008", startsAt: "2026-10-08T09:00:00.000Z", title: "JETRO 外资企业商务交流会", venue: "赤坂" },
  { id: "event:dx-1030", startsAt: "2026-10-30T09:00:00.000Z", title: "中小企业 DX 推进研讨会", venue: null },
  { id: "event:far-2027", startsAt: "2027-03-01T09:00:00.000Z", title: "春季出海峰会", venue: null },
];

export function generatorInput(overrides: Partial<PlanGeneratorInput> & { horizon?: PlanHorizon } = {}): PlanGeneratorInput {
  const { horizon = "quarter", ...rest } = overrides;
  return {
    actorId: ME,
    contacts: CONTACTS,
    contactsTotal: CONTACTS.length,
    events: EVENTS,
    goal: { horizon, snapshot: "三个月内拿到 10 家企业客户的试用（3 个月内）", text: "三个月内拿到 10 家企业客户的试用" },
    locale: "zh",
    question: "根据我的目标和人脉信息，我该如何实现目标？",
    startsOn: STARTS_ON,
    supplement: "我更想先从制造业客户开始",
    ...rest,
  };
}

/** 用 mock 生成器真实走一遍 bootstrap，得到一份已保存的第一份计划（内存仓储）。 */
export async function savedBootstrapPlan(horizon: PlanHorizon = "quarter"): Promise<PlanSnapshot> {
  const references = createAllowListPlanReferenceValidator({ actorId: ME, allowList: { contactsByActor: "any", eventIds: "any" } });
  const plans = createPlanService({ now: steppingClock(), references, repository: createMemoryPlanRepository(), scope: { actorId: ME, workspaceId: "w" } });
  const service = createPlanBootstrapService({
    actorId: ME,
    generator: createMockPlanGenerator(),
    now: () => NOW,
    plans,
    references,
    source: { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => EVENTS },
  });
  const result = await service.bootstrap({
    goal: { horizon, snapshot: "三个月内拿到 10 家企业客户的试用", text: "三个月内拿到 10 家企业客户的试用" },
    idempotencyKey: "plan-card-test",
    locale: "zh",
    supplement: "我更想先从制造业客户开始",
  });
  return result.snapshot;
}
