/**
 * W0036（RH-03「活动始终真实」）：示例期首页的「近期可报名」真实活动，服务端读取。
 *
 * 示例首页不读 snapshot、不读计划（W0004），所以示例期的活动池只有「近期」这一个来源：在 `/app/agent`
 * 示例分支提前返回之前读一次公开目录（`readRecords`：`listPublishedEvents` + 参会人数汇总）和一次本人报名
 * （`listCanonicalRegistrationsForUser`），与推荐服务同一套候选规则（排除已开始、已取消、本人主办、已报名，
 * 按开始时间升序），截到 `HOME_EVENT_POOL_LIMIT`（示例期没有计划与目标，不需要全量）。
 *
 * 任何读取失败都返回空数组：示例页照常渲染，只是活动池为空（如实）。
 *
 * `readHomePlanEventCandidates`：真实期 snapshot 的 `upcoming` 被截到前 12 场时（SC-07 备选约束），
 * 首页为计划点名、却不在前 12 场与目标匹配里的活动补查一次（同样是目录 1 次 + 报名 1 次）。
 */
import { createConfiguredCanonicalPublicEventCatalogue } from "../events/core/public-catalogue-runtime";
import { createConfiguredEventOperationsRepository } from "../events/event-operations/repository";
import { readPublicUpcomingEvents } from "../events/public-goal-recommendations";
import { HOME_EVENT_POOL_LIMIT, type HomeEventPoolCandidate } from "./home-event-pool";

async function readConfiguredUpcoming(accountId: string, now: Date) {
  return readPublicUpcomingEvents(
    {
      listMemberships: async ({ accountId: account, eventIds }) => {
        const repository = createConfiguredEventOperationsRepository();
        if (!repository) throw new Error("Canonical event operations are unavailable");
        return repository.listCanonicalRegistrationsForUser(account, eventIds);
      },
      readPublicCatalogue: async (at) => {
        const catalogue = createConfiguredCanonicalPublicEventCatalogue({ now: at });
        if (!catalogue) throw new Error("Canonical public event catalogue is unavailable");
        return catalogue.readRecords();
      },
    },
    accountId,
    now,
  );
}

function candidate(event: Awaited<ReturnType<typeof readConfiguredUpcoming>>[number]): HomeEventPoolCandidate {
  return {
    endsAt: event.endsAt,
    eventId: event.eventId,
    publicCode: event.publicCode,
    startsAt: event.startsAt,
    title: event.title,
    venue: event.venue,
  };
}

export async function readDemoHomeEventCandidates(input: {
  accountId: string;
  now?: Date;
}): Promise<HomeEventPoolCandidate[]> {
  try {
    const upcoming = await readConfiguredUpcoming(input.accountId, input.now ?? new Date());
    return upcoming.slice(0, HOME_EVENT_POOL_LIMIT).map(candidate);
  } catch {
    return [];
  }
}

/**
 * W0036 SC-07 备选约束：snapshot 只带前 12 场「近期可报名」时，计划点名却不在其中的活动由首页补查一次。
 * 同一套候选规则（仍可报名、本人未报名、非本人主办）校验，只返回点名的那几场；读取失败抛错。
 */
export async function readHomePlanEventCandidates(input: {
  accountId: string;
  eventIds: readonly string[];
  now?: Date;
}): Promise<HomeEventPoolCandidate[]> {
  const wanted = new Set(input.eventIds);
  const upcoming = await readConfiguredUpcoming(input.accountId, input.now ?? new Date());
  return upcoming.filter((event) => wanted.has(event.eventId)).map(candidate);
}
