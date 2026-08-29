import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import type {
  OpportunityActionBrief,
  OpportunityActionBriefPriority,
} from "./opportunity-contract";

const dayMs = 86_400_000;

export interface CreateOpportunityActionBriefInput {
  connection: ConnectionDTO;
  contact: ContactDTO;
  now: string;
  task: TaskDTO;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function utcDay(value: string): number | null {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysUntil(dueAt: string | undefined, now: string): number | null {
  if (!dueAt) {
    return null;
  }

  const dueDay = utcDay(dueAt);
  const nowDay = utcDay(now);

  if (dueDay === null || nowDay === null) {
    return null;
  }

  return Math.round((dueDay - nowDay) / dayMs);
}

function urgencyScore(days: number | null): number {
  if (days === null) return 5;
  if (days <= 0) return 30;
  if (days === 1) return 25;
  if (days <= 3) return 22;
  if (days <= 7) return 18;
  return 10;
}

function goalRelevanceScore(connection: ConnectionDTO): number {
  const valueScore = connection.valueTypes.length > 0 ? 12 : 0;
  const actionScore = (connection.suggestedActions?.length ?? 0) > 0 ? 8 : 0;

  return valueScore + actionScore;
}

function evidenceCompletenessScore(input: CreateOpportunityActionBriefInput): number {
  return [
    input.task.evidenceIds.length > 0,
    input.connection.evidenceIds.length > 0,
    input.contact.evidenceIds.length > 0,
  ].filter(Boolean).length * 5;
}

function priorityFor(
  input: CreateOpportunityActionBriefInput,
  days: number | null,
): OpportunityActionBriefPriority {
  const relationshipScore =
    input.connection.businessRelevanceScore ??
    input.connection.relationshipStrength ??
    50;
  const priority = {
    urgency: urgencyScore(days),
    relationshipValue: Math.round(clamp(relationshipScore, 0, 100) * 0.25),
    goalRelevance: goalRelevanceScore(input.connection),
    evidenceCompleteness: evidenceCompletenessScore(input),
    dormantRisk: input.connection.stage === "nurture" ? 10 : 0,
  };

  return {
    total: clamp(
      priority.urgency +
        priority.relationshipValue +
        priority.goalRelevance +
        priority.evidenceCompleteness +
        priority.dormantRisk,
      0,
      100,
    ),
    ...priority,
  };
}

function dueEvidence(days: number | null): string {
  if (days === null) return "还没有设置跟进时间";
  if (days < 0) return `跟进已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天需要处理";
  if (days === 1) return "计划明天处理";
  return `计划在 ${days} 天内处理`;
}

function judgmentFor(contactName: string, days: number | null): string {
  if (days === null) {
    return `${contactName}的下一步还没有设置时间，先确认是否继续推进。`;
  }

  if (days < 0) {
    return `${contactName}的跟进已经逾期，建议今天处理。`;
  }

  if (days === 0) {
    return `${contactName}的跟进今天到期，建议今天处理。`;
  }

  return `${contactName}已有明确的下一步，按计划推进即可。`;
}

function evidenceFor(
  input: CreateOpportunityActionBriefInput,
  days: number | null,
): readonly string[] {
  const relationshipScore =
    input.connection.businessRelevanceScore ??
    input.connection.relationshipStrength;
  const contactContext = [
    input.contact.organization?.trim(),
    input.contact.role?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    dueEvidence(days),
    relationshipScore === undefined
      ? "关系价值还没有评分"
      : `关系价值评分为 ${Math.round(clamp(relationshipScore, 0, 100))} 分`,
    contactContext,
  ]
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

function stepsFor(input: CreateOpportunityActionBriefInput): readonly string[] {
  const nextAction =
    input.connection.suggestedActions?.find((item) => item.trim()) ??
    input.task.title.trim();

  return uniqueStrings([
    "查看最近一次互动记录",
    nextAction || "确认本次联系目标",
    `联系${input.contact.displayName}`,
  ]).slice(0, 3);
}

export function createOpportunityActionBrief(
  input: CreateOpportunityActionBriefInput,
): OpportunityActionBrief {
  const days = daysUntil(input.task.dueAt, input.now);
  const evidenceIds = uniqueStrings([
    ...input.task.evidenceIds,
    ...input.connection.evidenceIds,
    ...input.contact.evidenceIds,
  ]);

  return {
    ruleVersion: "opportunity-brief-v1",
    type: "follow_up",
    title: input.task.title.trim() || `联系${input.contact.displayName}`,
    judgment: judgmentFor(input.contact.displayName, days),
    evidence: evidenceFor(input, days),
    steps: stepsFor(input),
    primaryAction: {
      kind: "open_contact",
      label: "开始联系",
      contactId: input.contact.id,
    },
    secondaryAction: {
      kind: "open_contact",
      label: "查看联系人",
      contactId: input.contact.id,
    },
    evaluatedAt: input.now,
    evidenceIds,
    priority: priorityFor(input, days),
  };
}
