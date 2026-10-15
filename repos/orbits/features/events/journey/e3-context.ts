/**
 * R27 E3：入队时给会後任务补的上下文（名字、计划人物类型、活动日期、语言）。Owner: 甲 (R27).
 * 只读本人的联系人与当前计划；读不到时返回 null（任务照旧走 v2 的一段 summary，界面走规则退路）。
 */
import type { AttendeePostEventAiContext } from "../post-event-artifact/e3";
import { getConfiguredEventAssessmentRuntime, listContactsForAssessment } from "../assessment/configured";

export async function readPostEventAiContext(input: { actorId: string; eventTitle: string; eventStartsAt: string; contactIds: readonly string[]; language: "ja" | "zh" | "en" }): Promise<AttendeePostEventAiContext | null> {
  const runtime = getConfiguredEventAssessmentRuntime();
  if (!runtime) return null;
  try {
    const query = (sql: string, values?: readonly unknown[]) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
    const [contacts, plan] = await Promise.all([listContactsForAssessment(query, runtime.workspaceId, input.actorId), runtime.plan.context(input.actorId, input.language)]);
    const wanted = new Set(input.contactIds);
    const people = contacts.filter((contact) => wanted.has(contact.id)).map((contact) => ({ contactId: contact.id, name: contact.name }));
    if (people.length === 0) return null;
    return {
      eventDate: new Date(Date.parse(input.eventStartsAt) + 9 * 3_600_000).toISOString().slice(0, 10),
      eventTitle: input.eventTitle,
      language: input.language,
      people,
      planTypes: plan.types.filter((type) => !type.skipped).map((type) => ({ key: type.key, label: type.shortLabel })),
    };
  } catch (error) {
    console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "post_event_ai_context_failed" }));
    return null;
  }
}
