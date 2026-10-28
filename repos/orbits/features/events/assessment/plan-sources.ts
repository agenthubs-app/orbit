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
import { getConfiguredEventAssessmentRuntime, listContactsForAssessment, readPreferencesForAssessment, type ConfiguredEventAssessmentRuntime } from "./configured";
import { createPostgresEventAssessmentRepository } from "./repository";
import { mapLimit } from "../../../shared/performance/map-limit";

/** 读失败时计划页少显示活动而不是报错；但要留日志（复核：不能静默）。 */
function logged<T>(event: string, fallback: T): (error: unknown) => T {
  return (error) => {
    console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event }));
    return fallback;
  };
}

export async function createLivePlanEventSources(actorId: string, options: { strict?: boolean; runtime?: ConfiguredEventAssessmentRuntime } = {}): Promise<LivePlanEventSources | null> {
  const runtime = options.runtime ?? getConfiguredEventAssessmentRuntime();
  if (!runtime) return null;
  const query = (sql: string, values?: readonly unknown[]) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
  // The configured repository runs schema migrations before reads. To-do's
  // strict source must remain read-only, including when the schema is absent.
  const externalRepository = options.strict ? createPostgresEventAssessmentRepository({ client: runtime.client, workspaceId: runtime.workspaceId }) : runtime.repository;
  let person: { contacts: { id: string; name: string }[]; homeArea: string | null } | null = null;
  const personFacts = async () => {
    if (person) return person;
    const [contacts, prefs] = await Promise.all([listContactsForAssessment(query, runtime.workspaceId, actorId), readPreferencesForAssessment(query, runtime.workspaceId, actorId, { strict: options.strict })]);
    person = { contacts, homeArea: prefs.homeArea };
    return person;
  };
  return {
    async myExternal(window) {
      const rows = options.strict ? await externalRepository.listAddedExternal(actorId, window) :
        await externalRepository.listAddedExternal(actorId, window).catch(logged("plan_event_sources_external_failed", [] as Awaited<ReturnType<typeof externalRepository.listAddedExternal>>));
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
      const reader = createPostgresMyEventsReader({ query, workspaceId: runtime.workspaceId, strict: options.strict });
      const rows = options.strict ? await reader.rows(actorId, window) :
        await reader.rows(actorId, window).catch(logged("plan_event_sources_mine_failed", [] as Awaited<ReturnType<typeof reader.rows>>));
      return [...new Set(rows.filter((row) => !row.external && row.status !== "cancelled" && row.status !== "rejected").map((row) => row.eventId))];
    },
    async orbitFacts(events) {
      const person = await personFacts();
      const out: PlanEventFact[] = [];
      // Each event's facts are two reads (enrollment, roster); four events at a time, as the journey
      // judge does, instead of one after another. Order and the strict failure rule are unchanged.
      const facts = await mapLimit(events, 4, (event) => options.strict ? runtime.orbitEvents.planEventFact(event.eventId, person) :
        runtime.orbitEvents.planEventFact(event.eventId, person).catch(logged("plan_event_sources_fact_failed", null)));
      for (const fact of facts) {
        if (options.strict && !fact) throw Error("EVENT_FACT_UNAVAILABLE");
        if (fact) out.push(fact);
      }
      // 评估过的库内活动带评估链接。
      const ids = out.map((fact) => fact.eventId);
      if (ids.length) {
        const rows = await query(`select id, event_id from event_assessments where workspace_id = $1 and actor_id = $2 and event_id = any($3::text[])`, [runtime.workspaceId, actorId, ids]).catch(logged("plan_event_sources_scores_failed", { rows: [] as Array<Record<string, unknown>> }));
        const byEvent = new Map(rows.rows.map((row) => [String(row.event_id), String(row.id)]));
        for (const fact of out) fact.assessmentId = byEvent.get(fact.eventId) ?? null;
      }
      return out;
    },
  };
}
