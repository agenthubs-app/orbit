import { z, type ZodType } from "zod";

import type { OrbitApiClient } from "../api/client";
import { contactCardPageSchema, contactCardSummarySchema } from "../api/schema/contact-card-page";
import { myEventsResponseSchema } from "../api/schema/events-mine";
import { planV2SummaryResponseSchema } from "../api/schema/plan-v2";
import { parseSecretaryPreviewForActor } from "../api/schema/secretary-preview";
import { todoPageSchema } from "../api/schema/todo-page";
import type { HomeWidgetSources } from "./project-home";

const scheduleSchema = z.object({ scheduleItems: z.array(z.unknown()) });

function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(now);
  const part = (kind: string) => parts.find(item => item.type === kind)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Only server-confirmed GETs extend a WidgetKit snapshot's freshness. */
export async function readHomeWidgetSources(client: OrbitApiClient, actorId: string, timeZone: string, now: Date): Promise<HomeWidgetSources> {
  const day = localDay(now, timeZone);
  const todoRequest = client.get<unknown>(`/api/todo/page?date=${encodeURIComponent(day)}&timeZone=${encodeURIComponent(timeZone)}`)
    .then(result => result.success ? result.data : undefined).catch(() => undefined);
  const paths = [
    "/api/schedule-items", "/api/contacts/summary", "/api/contacts/page?sort=added&limit=4",
    "/api/inbox/secretary/preview", "/api/agent/plans/v2/summary", "/api/events/mine?range=upcoming",
  ] as const;
  const values = await Promise.all([todoRequest, ...paths.map(async path => {
    try { const result = await client.get<unknown>(path); return result.success ? result.data : undefined; }
    catch { return undefined; }
  })]);
  const parse = <T>(index: number, schema: ZodType<T>): T | undefined => {
    const result = schema.safeParse(values[index]);
    return result.success ? result.data : undefined;
  };
  let secretary: HomeWidgetSources["secretary"];
  try { secretary = parseSecretaryPreviewForActor(values[4], actorId); } catch { secretary = undefined; }
  return { actorId, now,
    todo: parse(0, todoPageSchema), schedule: parse(1, scheduleSchema),
    networkSummary: parse(2, contactCardSummarySchema), networkPage: parse(3, contactCardPageSchema),
    secretary, plan: parse(5, planV2SummaryResponseSchema), events: parse(6, myEventsResponseSchema),
  };
}
