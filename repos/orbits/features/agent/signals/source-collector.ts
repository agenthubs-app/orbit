import type { LiveEventStoreProvider } from "../../events/event-crud-and-import/live-service";
import type { LiveFollowupTaskProvider } from "../../followups/live-service";
import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import type {
  AgentSignalCandidate,
  AgentSignalSeverity,
  AgentSignalSource,
} from "./contract";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface AgentSignalSourceCollectorOptions {
  actorId: string;
  eventProvider?: LiveEventStoreProvider | null;
  followupProvider?: LiveFollowupTaskProvider | null;
  now?: () => string;
}

function timestamp(value: string | undefined | null): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function severityFor(importance: number): AgentSignalSeverity {
  if (importance >= 90) return "critical";
  if (importance >= 75) return "high";
  if (importance >= 55) return "medium";
  return "low";
}

function compactMaterial(material: Readonly<Record<string, string>>): string {
  return Object.entries(material)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function candidate(
  input: Omit<AgentSignalCandidate, "materialHash">,
): AgentSignalCandidate {
  return {
    ...input,
    materialHash: hash(compactMaterial(input.material)),
  };
}

function contactFor(
  contacts: readonly ContactDTO[],
  contactId?: string,
): ContactDTO | null {
  if (!contactId) return null;
  return contacts.find((contact) => contact.id === contactId) ?? null;
}

function evidenceFor(
  evidence: readonly RelationshipEvidenceDTO[],
  ids: readonly string[],
): readonly RelationshipEvidenceDTO[] {
  const accepted = new Set(ids);
  return evidence.filter((item) => accepted.has(item.id));
}

function relationshipSource(
  source: ContactDTO["source"],
  capturedAt: string,
  evidenceIds: readonly string[],
): AgentSignalSource {
  return {
    capturedAt,
    evidenceIds,
    sourceId: source.id,
    sourceLabel: source.label ?? "Orbit relationship graph",
    sourceType: source.type,
  };
}

export function createAgentSignalSourceCollector({
  actorId,
  eventProvider,
  followupProvider,
  now = () => new Date().toISOString(),
}: AgentSignalSourceCollectorOptions) {
  return {
    async collect(): Promise<readonly AgentSignalCandidate[]> {
      const currentIso = now();
      const current = timestamp(currentIso) ?? Date.now();
      const [graph, events] = await Promise.all([
        followupProvider?.readFollowupGraph(actorId) ?? null,
        eventProvider?.listEvents() ?? [],
      ]);
      const candidates: AgentSignalCandidate[] = [];

      if (graph) {
        for (const task of graph.tasks) {
          if (
            (task.status !== "open" && task.status !== "scheduled") ||
            !task.dueAt
          ) {
            continue;
          }
          const due = timestamp(task.dueAt);
          if (due === null || due > current + 7 * DAY_MS) continue;
          const daysUntil = Math.ceil((due - current) / DAY_MS);
          const contact = contactFor(graph.contacts, task.contactId);
          const connection =
            graph.connections.find(
              (item) =>
                (task.connectionId && item.id === task.connectionId) ||
                (!task.connectionId && item.contactId === task.contactId),
            ) ?? null;
          const supportingEvidence = evidenceFor(graph.evidence, task.evidenceIds);
          const importance = bounded(
            daysUntil < 0 ? 96 : daysUntil === 0 ? 90 : 84 - daysUntil * 4,
          );
          const subject = contact?.displayName ?? task.title;
          const agentPrompt = contact
            ? [
                `帮我准备并推进与 ${contact.displayName} 的跟进：${task.title}。`,
                `请以任务 ${task.id}、联系人 ${contact.id}`,
                connection ? `、关系 ${connection.id}` : "",
                " 为准，不要按姓名重新匹配其他记录。",
                connection?.summary
                  ? ` 已知关系背景：${connection.summary}`
                  : "",
                " 请给出明确的下一步和一条可直接使用的消息草稿。",
              ].join("")
            : `帮我准备并推进这条跟进：${task.title}。请先总结现有背景，再给出下一步和可直接使用的消息草稿。`;
          const material = {
            contact: contact?.displayName ?? "",
            dueAt: task.dueAt,
            status: task.status,
            title: task.title,
          };
          candidates.push(
            candidate({
              actions: [
                {
                  actionId: "open",
                  href: "/app/followups",
                  label: "查看跟进",
                },
                {
                  actionId: "ask_agent",
                  href: `/app/agent?q=${encodeURIComponent(agentPrompt)}`,
                  label: "让 Agent 准备",
                  prompt: agentPrompt,
                },
              ],
              confidence:
                supportingEvidence.length > 0
                  ? Math.max(
                      ...supportingEvidence.map((item) => item.confidence),
                    )
                  : 0.78,
              fingerprint: `followup_due:${task.id}`,
              importance,
              material,
              occurredAt: task.dueAt,
              reason:
                daysUntil < 0
                  ? `已逾期 ${Math.abs(daysUntil)} 天，继续等待会降低关系推进概率。`
                  : daysUntil === 0
                    ? "今天到期，适合现在处理。"
                    : `${daysUntil} 天内到期，建议提前准备。`,
              severity: severityFor(importance),
              sources: [
                {
                  capturedAt: task.updatedAt,
                  evidenceIds: task.evidenceIds,
                  sourceId: task.source.id,
                  sourceLabel: task.source.label ?? "Orbit follow-up task",
                  sourceType: task.source.type,
                },
              ],
              summary: connection?.summary ?? task.title,
              targetId: task.id,
              targetType: "task",
              title: `跟进 ${subject}`,
              type: "followup_due",
            }),
          );
        }

        for (const connection of graph.connections) {
          if (connection.stage === "archived") continue;
          const latestEvidence = evidenceFor(
            graph.evidence,
            connection.evidenceIds,
          )
            .slice()
            .sort((left, right) =>
              right.occurredAt.localeCompare(left.occurredAt),
            )[0];
          const lastTouchAt = latestEvidence?.occurredAt ?? connection.updatedAt;
          const lastTouch = timestamp(lastTouchAt);
          if (lastTouch === null) continue;
          const staleDays = Math.floor((current - lastTouch) / DAY_MS);
          if (staleDays < 90) continue;
          const contact = contactFor(graph.contacts, connection.contactId);
          if (!contact) continue;
          const importance = bounded(
            56 +
              Math.min(24, Math.floor((staleDays - 90) / 15) * 3) +
              Math.round((connection.businessRelevanceScore ?? 0) / 10),
          );
          const material = {
            contact: contact.displayName,
            lastTouchAt,
            stage: connection.stage,
            staleDays: String(staleDays),
          };
          candidates.push(
            candidate({
              actions: [
                {
                  actionId: "open",
                  href: `/app/contacts/${encodeURIComponent(contact.id)}`,
                  label: "查看关系",
                },
                {
                  actionId: "ask_agent",
                  href: `/app/agent?q=${encodeURIComponent(`帮我重新联系 ${contact.displayName}，先总结关系背景并起草一条自然的消息`)}`,
                  label: "准备重联",
                  prompt: `帮我重新联系 ${contact.displayName}，先总结关系背景并起草一条自然的消息`,
                },
              ],
              confidence: latestEvidence?.confidence ?? 0.72,
              fingerprint: `relationship_stale:${connection.id}`,
              importance,
              material,
              occurredAt: lastTouchAt,
              reason: `已有 ${staleDays} 天没有新的关系证据。`,
              severity: severityFor(importance),
              sources: [
                relationshipSource(
                  contact.source,
                  contact.updatedAt,
                  connection.evidenceIds,
                ),
              ],
              summary:
                connection.summary ||
                `与 ${contact.displayName} 的关系长期没有更新。`,
              targetId: contact.id,
              targetType: "contact",
              title: `重新联系 ${contact.displayName}`,
              type: "relationship_stale",
            }),
          );
        }
      }

      for (const event of events) {
        const startsAt = timestamp(event.startsAt);
        if (
          startsAt === null ||
          startsAt < current ||
          startsAt > current + 7 * DAY_MS ||
          event.status === "cancelled"
        ) {
          continue;
        }
        const hoursUntil = Math.ceil((startsAt - current) / (60 * 60 * 1_000));
        const importance = bounded(hoursUntil <= 24 ? 91 : 82 - hoursUntil / 24);
        const evidenceIds =
          event.evidence?.map((item) => item.evidenceId) ?? [];
        const material = {
          startsAt: event.startsAt ?? "",
          status: event.status ?? "confirmed",
          title: event.title,
          venue: event.venue ?? "",
        };
        candidates.push(
          candidate({
            actions: [
              {
                actionId: "open",
                href: `/app/events/${encodeURIComponent(event.id)}`,
                label: "查看活动",
              },
              {
                actionId: "ask_agent",
                href: `/app/agent?q=${encodeURIComponent(`帮我准备活动「${event.title}」，重点给出值得见的人和开场方式`)}`,
                label: "生成会前准备",
                prompt: `帮我准备活动「${event.title}」，重点给出值得见的人和开场方式`,
              },
            ],
            confidence: evidenceIds.length > 0 ? 0.9 : 0.76,
            fingerprint: `event_upcoming:${event.id}`,
            importance,
            material,
            occurredAt: event.startsAt ?? currentIso,
            reason:
              hoursUntil <= 24
                ? `${hoursUntil} 小时内开始，需要完成会前准备。`
                : `${Math.ceil(hoursUntil / 24)} 天后开始，可以提前规划目标人脉。`,
            severity: severityFor(importance),
            sources: [
              {
                capturedAt: event.source.importedAt,
                evidenceIds,
                provider: event.source.provider,
                sourceId: event.source.id,
                sourceLabel: event.source.label ?? "Orbit event store",
                sourceType: event.source.type,
              },
            ],
            summary:
              event.recommendedPreparation ??
              event.relationshipContext ??
              event.description ??
              event.title,
            targetId: event.id,
            targetType: "event",
            title: `准备 ${event.title}`,
            type: "event_upcoming",
          }),
        );
      }

      return candidates.sort(
        (left, right) =>
          right.importance - left.importance ||
          left.occurredAt.localeCompare(right.occurredAt),
      );
    },
  };
}
