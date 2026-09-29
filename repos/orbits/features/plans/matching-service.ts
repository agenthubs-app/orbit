/**
 * 人脉需求匹配的读写服务（RW-11，Sprint W0010）：候选列表、确认／忽略、手动关联、审阅页触发。
 * API route 只通过这里（及 `matching-runtime.ts` 的装配）访问匹配数据；UI 只见下面的视图形状。
 *
 * 候选只在读取时对照当前生效计划：需求不在生效计划里（换了版本）、联系人已经关联在这条需求上、
 * 联系人已删除或不属于本人的候选一律不显示。确认／忽略走计划服务的 `decideMatchCandidate`：
 * 一个按 actor 串行的事务里对候选做严格 CAS，接受时同一事务关联联系人、生成本周「约 TA」行动、写进展记录
 * （W0023：计划已到期时不生成行动，`link.action` 为 null）。
 * 候选列表按新到旧排列；W0015：联系人在与需求关联的活动上认识的候选排在最前。
 */
import { industryLabel, secondaryIndustryLabel } from "../../shared/domain/industries";
import { PLAN_MATCH_ACTION_SOURCE, type LinkNeedContactResult, type PlanService } from "./contract";
import { resolvePlanEmailDraftProvider, type PlanEmailDraft, type PlanEmailDraftProvider } from "./email-draft";
import { eventLinked } from "./matching";
import type { PlanMatchContactView, PlanMatchNeedView, PlanMatchPendingCandidate, PlanMatchRepository } from "./matching-repository";
import { runMatchJobForBatch, type PlanMatchBatchRun, type PlanMatchWorkerDeps } from "./match-worker";
import { PlanServiceError } from "./validators";

export interface PlanMatchCandidateView {
  id: string;
  contactId: string;
  contactName: string;
  /** 公司 · 职位。 */
  contactSubtitle: string | null;
  needId: string;
  needTitle: string;
  strength: "strong" | "candidate";
  tier: "rule" | "ai";
  /** 规则层：同属哪个行业（二级强候选 / 一级候选）；AI 层为 null。 */
  industry: { zh: string; en: string } | null;
  /** AI 层给出的一句话理由（模型原文）；规则层为 null。 */
  aiReason: string | null;
}

export interface PlanMatchCandidatesView {
  candidates: PlanMatchCandidateView[];
  /** 需求 id → 待确认数（计划页「待确认 N」角标）。 */
  pendingByNeed: Record<string, number>;
  /** 有待确认候选的不同联系人数（今日要事「N 位新联系人可能对应你的计划」）。 */
  contactCount: number;
}

export interface PlanMatchingService {
  listPending(input: { actorId: string; batchId?: string | null }): Promise<PlanMatchCandidatesView>;
  runForBatch(input: { actorId: string; batchId: string }): Promise<{ run: PlanMatchBatchRun; view: PlanMatchCandidatesView }>;
  decide(input: {
    actorId: string;
    candidateId: string;
    decision: "accept" | "dismiss";
  }): Promise<{ candidateId: string; status: "accepted" | "dismissed"; link: LinkNeedContactResult | null; replayed: boolean }>;
  linkManually(input: { actorId: string; needItemId: string; contactId: string; idempotencyKey?: string | null }): Promise<LinkNeedContactResult>;
  /** 「起草邮件」：只在点击时调用，返回可编辑的草稿（不保存、不发送）。只认本人生效计划里的「约 TA」行动。 */
  draftEmail(input: { actorId: string; actionItemId: string; language: "zh" | "en" }): Promise<PlanEmailDraft>;
}

function subtitle(contact: PlanMatchContactView): string | null {
  const value = [contact.organization, contact.role].filter(Boolean).join(" · ");
  return value || null;
}

function industryOf(need: PlanMatchNeedView, candidate: PlanMatchPendingCandidate): PlanMatchCandidateView["industry"] {
  if (candidate.tier !== "rule") return null;
  if (candidate.strength === "strong" && need.secondaryIndustryId) {
    const id = need.secondaryIndustryId;
    return { en: secondaryIndustryLabel(id, "en"), zh: secondaryIndustryLabel(id, "zh") };
  }
  const primary = need.primaryIndustryId;
  return primary ? { en: industryLabel(primary, "en"), zh: industryLabel(primary, "zh") } : null;
}

export function createPlanMatchingService(deps: {
  repository: PlanMatchRepository;
  worker: PlanMatchWorkerDeps;
  planServiceFor: (actorId: string) => PlanService;
  draftProvider?: PlanEmailDraftProvider;
}): PlanMatchingService {
  const { repository } = deps;

  async function listPending({ actorId, batchId = null }: { actorId: string; batchId?: string | null }) {
    // W0021：三条读取都只取渲染所需的列（候选、需求的行业 id、联系人的名字／公司／职位／认识的活动）。
    const [pending, needs] = await Promise.all([
      repository.listPendingCandidates({ actorId, batchId }),
      repository.readActiveNeedViews(actorId),
    ]);
    const needsById = new Map(needs.map((need) => [need.id, need]));
    const live = pending.filter((candidate) => {
      const need = needsById.get(candidate.needItemId);
      return need !== undefined && !need.linkedContactIds.includes(candidate.contactId);
    });
    const contacts = await repository.readContactViews(actorId, [...new Set(live.map((candidate) => candidate.contactId))]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const candidates: PlanMatchCandidateView[] = [];
    for (const candidate of live) {
      const need = needsById.get(candidate.needItemId)!;
      const contact = contactsById.get(candidate.contactId);
      if (!contact) continue;
      candidates.push({
        aiReason: candidate.tier === "ai" ? candidate.reason : null,
        contactId: contact.id,
        contactName: contact.displayName || "—",
        contactSubtitle: subtitle(contact),
        id: candidate.id,
        industry: industryOf(need, candidate),
        needId: need.id,
        needTitle: need.title,
        strength: candidate.strength,
        tier: candidate.tier,
      });
    }
    // W0015：在与需求关联的活动上认识的人排在前面（稳定排序，其余保持新到旧）。
    const eventFirst = (candidate: PlanMatchCandidateView) =>
      eventLinked(contactsById.get(candidate.contactId), needsById.get(candidate.needId));
    candidates.sort((a, b) => Number(eventFirst(b)) - Number(eventFirst(a)));
    const pendingByNeed: Record<string, number> = {};
    for (const candidate of candidates) pendingByNeed[candidate.needId] = (pendingByNeed[candidate.needId] ?? 0) + 1;
    return { candidates, contactCount: new Set(candidates.map((candidate) => candidate.contactId)).size, pendingByNeed };
  }

  async function contactNameFor(actorId: string, contactId: string): Promise<string> {
    const [contact] = await repository.readContacts(actorId, [contactId]);
    // 找不到（他人的、已删除的）联系人对外一律 404，与计划服务的引用校验一致。
    if (!contact) throw new PlanServiceError("REFERENCE_NOT_FOUND", "A referenced contact was not found.");
    return contact.displayName;
  }

  return {
    listPending,

    async runForBatch({ actorId, batchId }) {
      const run = await runMatchJobForBatch(deps.worker, { actorId, batchId });
      return { run, view: await listPending({ actorId, batchId }) };
    },

    async decide({ actorId, candidateId, decision }) {
      const candidate = await repository.getCandidate({ actorId, candidateId });
      if (!candidate) throw new PlanServiceError("ITEM_NOT_FOUND", "Match candidate not found.");
      // 名字只用于行动标题，事务外读取；决定本身（CAS + 关联 + 行动 + 记录）在计划服务的一个事务里。
      const contactName = decision === "accept" ? await contactNameFor(actorId, candidate.contactId) : null;
      const result = await deps.planServiceFor(actorId).decideMatchCandidate({ candidateId, contactName, decision });
      return { candidateId, link: result.link, replayed: result.replayed, status: result.status };
    },

    async draftEmail({ actionItemId, actorId, language }) {
      const snapshot = await deps.planServiceFor(actorId).getCurrent();
      const items = snapshot?.items ?? [];
      const action = items.find((item) => item.id === actionItemId);
      const contactId = action?.meta.contactId;
      // 他人的、已归档版本里的、不是「约 TA」的行动对外一律 404。
      if (!snapshot || !action || action.kind !== "action" || action.meta.source !== PLAN_MATCH_ACTION_SOURCE || typeof contactId !== "string") {
        throw new PlanServiceError("ITEM_NOT_FOUND", "Plan action not found.");
      }
      const needs = items.filter((item) => item.kind === "network_need");
      const need =
        needs.find((item) => item.id === action.meta.needItemId) ??
        needs.find((item) => item.carriedFromItemId === action.meta.needItemId) ??
        needs.find((item) => item.linkedContactIds.includes(contactId)) ??
        null;
      const [contact] = await repository.readContacts(actorId, [contactId]);
      if (!contact) throw new PlanServiceError("REFERENCE_NOT_FOUND", "A referenced contact was not found.");
      return (deps.draftProvider ?? resolvePlanEmailDraftProvider()).draft({
        contactName: contact.displayName,
        goal: snapshot.plan.goalSnapshot,
        language,
        needDescription: need?.criteria?.description ?? null,
        needTitle: need?.title ?? action.title,
        organization: contact.organization,
        role: contact.role,
      });
    },

    async linkManually({ actorId, contactId, idempotencyKey, needItemId }) {
      const link = await deps.planServiceFor(actorId).linkNeedContact({
        contactId,
        contactName: await contactNameFor(actorId, contactId),
        idempotencyKey: idempotencyKey ?? null,
        needItemId,
      });
      await repository.acceptPendingPair({ actorId, contactId, needItemId: link.need.id });
      return link;
    },
  };
}
