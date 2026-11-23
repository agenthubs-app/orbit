// 2026-11-23 探す 简介栏 — GET：只给栏里要显示、列表行里没有的字段（event-side-panel-proposal 字段表）。
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";

const summary = createEventJourneyRoutes().summary;

export function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return summary(request, context);
}
