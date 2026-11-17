// R27 イベント詳細 read model — GET (public part for signed-out visitors).
import { anonymousMicrocache } from "../../../../../features/events/journey/anonymous-microcache";
import { createEventJourneyRoutes, JOURNEY_SAMPLE_HEADER } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";

const overview = createEventJourneyRoutes().overview;

// 分享出去的活动链接多是未登录访问，内容对所有匿名访客相同：同一实例里 60 秒内复用一次查库结果，
// 并把同时到达的请求合并成一次。带登录 cookie / Authorization / 示例头的请求原样直通。
const cached = anonymousMicrocache({ ttlMs: 60_000, sampleHeader: JOURNEY_SAMPLE_HEADER });

export function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return cached(request, () => overview(request, context));
}
