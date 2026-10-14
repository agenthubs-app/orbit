/**
 * R26 计划 live 事实的来源（`plans/v2/event-facts.ts` 的 `LivePlanEventSources`；DESIGN §6.2-1）。Owner: 甲 (R26).
 * - 我的外部评估：只读本人 `user_decision = 'added'` 的评估（外部活动只对本人可见，复核 S1）；事实就是评估记录的事实。
 * - 我的库内活动：报名 / 审核 / 加入计划（`events/mine` 的同一读取）。
 * - 库内活动事实：`orbit-event-facts`（活动级缓存，人级现算）。
 * service-factory 用动态 import 接进来，计划模块不直接依赖本模块。
 */
import { toEventScoreFacts } from "../../../shared/compute/event-score-input";
import { estimateTravelMinutes } from "../../../shared/compute/event-travel-estimate";
import { connectionCounts } from "../../../shared/compute/event-facts-derive";
import { eventEmoji } from "../../../shared/compute/event-emoji";
import type { LivePlanEventSources } from "../../plans/v2/event-facts";
import type { PlanEventFact } from "../../plans/v2/overview";
import { createPostgresMyEventsReader } from "../mine/service";
import { getConfiguredEventAssessmentRuntime, listContactsForAssessment, readPreferencesForAssessment } from "./configured";

export async function createLivePlanEventSources(actorId: string): Promise<LivePlanEventSources | null> {
  const runtime = getConfiguredEventAssessmentRuntime();
  if (!runtime) return null;
  const query = (sql: string, values?: readonly unknown[]) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
  let person: { contacts: { id: string; name: string }[]; homeArea: string | null } | null = null;
  const personFacts = async () => {
    if (person) return person;
    const [contacts, prefs] = await Promise.all([listContactsForAssessment(query, runtime.workspaceId, actorId), readPreferencesForAssessment(query, runtime.workspaceId, actorId)]);
    person = { contacts, homeArea: prefs.homeArea };
    return person;
  };
  return {
    async myExternal(window) {
      const rows = await runtime.repository.listAddedExternal(actorId, window).catch(() => []);
      if (rows.length === 0) return [];
      const { contacts, homeArea } = await personFacts();
      return rows.flatMap((row): PlanEventFact[] => {
        const facts = row.facts;
        if (!facts.startsAt) return [];
        const connections = connectionCounts({ myContacts: contacts, speakerNames: (facts.speakers ?? []).map((speaker) => speaker.name) });
        const travel = estimateTravelMinutes({ event: facts.area ?? facts.venue ?? null, home: homeArea });
        return [{
          assessmentId: row.id,
          emoji: eventEmoji({ title: facts.title }),
          eventId: `assessment:${row.id}`,
          facts: toEventScoreFacts(facts, { attendeeSource: "none", expected: {}, firstDegree: connections.firstDegree, secondDegree: connections.secondDegree, travelMinutes: travel?.minutes ?? null }),
          startsAt: facts.startsAt,
          title: facts.title ?? "",
          typing: { exhibitorCount: facts.exhibitorCount ?? null, speakers: facts.speakers ?? [], text: [facts.title, facts.organizer, ...(facts.agenda ?? []).map((item) => item.title)].filter(Boolean).join(" ") },
          venue: facts.venue ?? null,
        }];
      });
    },
    async myEventIds(window) {
      const reader = createPostgresMyEventsReader({ query, workspaceId: runtime.workspaceId });
      const rows = await reader.rows(actorId, window).catch(() => []);
      return [...new Set(rows.filter((row) => !row.external && row.status !== "cancelled" && row.status !== "rejected").map((row) => row.eventId))];
    },
    async orbitFacts(events) {
      const person = await personFacts();
      const out: PlanEventFact[] = [];
      for (const event of events) {
        const fact = await runtime.orbitEvents.planEventFact(event.eventId, person).catch(() => null);
        if (fact) out.push(fact);
      }
      // 评估过的库内活动带评估链接。
      const ids = out.map((fact) => fact.eventId);
      if (ids.length) {
        const rows = await query(`select id, event_id from event_assessments where workspace_id = $1 and actor_id = $2 and event_id = any($3::text[])`, [runtime.workspaceId, actorId, ids]).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
        const byEvent = new Map(rows.rows.map((row) => [String(row.event_id), String(row.id)]));
        for (const fact of out) fact.assessmentId = byEvent.get(fact.eventId) ?? null;
      }
      return out;
    },
  };
}
