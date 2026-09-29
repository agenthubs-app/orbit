/**
 * 引导页 `/app/start` route adapter（W0006，RW-04 / RW-05 第 3 步）。
 *
 * - 开关 `ORBIT_GUIDE_DEMO` 关闭（D1）：直接重定向到 `/app/agent`，不做任何读取；
 * - 资料门禁豁免这一条路径（`profile-onboarding-route-policy.ts`），资料未完成的新用户也能进；
 * - 进度由服务端从真实数据推导（`features/guide/progress.ts` 的 `readStartGuideForActor`），
 *   第 4 步另读社群加入记录与本人的报名事实；客户端只拿到可序列化的快照。
 * - W0022：`?step=3`／`?step=4` 只解析成合法的单个步骤交给客户端壳，壳按硬顺序决定能否打开，
 *   加载时不写引导记录；
 * - 所有按人的读取都用服务端解析出的 canonical actor id（不是 Auth.js 的 session.user.id）；
 *   session.user.id 只用于读账号创建时间（D2 判定）。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../features/acquisition/business-card-capture-availability";
import { readCommunityJoinedForActor } from "../../../../features/community/service-factory";
import { createConfiguredCanonicalPublicEventCatalogue } from "../../../../features/events/core/public-catalogue-runtime";
import { hasAnyActiveRegistration } from "../../../../features/events/registration/active-registration";
import { readRuntimeEventRegistrationStates } from "../../../../features/events/registration/runtime";
import { readStartGuideForActor } from "../../../../features/guide/progress";
import { parseStartStepParam } from "../../../../features/guide/start-steps";
import { createProfileService } from "../../../../features/profile/service-factory";
import { readGuideDemoConfig } from "../../../../shared/config/guide-demo";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { applyOrbitEventPresentation } from "../orbit-event-presentation";
import { getOrbitLandingViewModelFromCatalogue } from "../orbit-landing-route-view-model";
import { getOrbitServerLanguage } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StartGuide, StartGuideUnavailable, type StartEventView } from "./start-guide";

export const dynamic = "force-dynamic";

/** 第 4 步最多展示的推荐活动数。 */
const START_EVENT_LIMIT = 2;

async function readProfileGoal(actorId: string): Promise<{ relationshipGoal: string; updatedAt: string | null } | null> {
  try {
    const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
    if (result.success === false) return null;
    return {
      relationshipGoal: result.data.profile?.relationshipGoal ?? "",
      updatedAt: result.data.profile?.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * 第 4 步的推荐活动：公开目录里还没开始、本人未报名的活动按时间取前两场。报名状态按
 * canonical actor id 读（报名接口写入时用的同一个 id）。目录或报名读不到时不显示推荐。
 */
async function readStartEvents(actorId: string): Promise<StartEventView[]> {
  try {
    const catalogue = createConfiguredCanonicalPublicEventCatalogue();
    if (!catalogue) return [];
    const language = await getOrbitServerLanguage();
    const viewModel = applyOrbitEventPresentation(getOrbitLandingViewModelFromCatalogue(await catalogue.read()), language);
    const registration = await readRuntimeEventRegistrationStates({
      eventIds: viewModel.events.map((event) => event.id),
      userId: actorId,
    });
    const now = Date.now();
    return viewModel.events
      .filter((event) => {
        const startsAt = Date.parse(event.startsAt);
        return Number.isFinite(startsAt) && startsAt > now && registration[event.id]?.registered !== true;
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, START_EVENT_LIMIT)
      .map((event) => ({
        code: event.code || event.id,
        id: event.id,
        name: event.name,
        place: event.place || event.venue || event.address || "",
        startsAt: event.startsAt,
      }));
  } catch {
    return [];
  }
}

/**
 * 第 4 步是否已报名过任意活动：直接读本人的报名事实（不限于当前公开目录，活动下架后仍算）。
 * 读不到时按未报名处理（社群加入仍可完成这一步）。
 */
async function readRegisteredAny(actorId: string): Promise<boolean> {
  try {
    return await hasAnyActiveRegistration(actorId);
  } catch {
    return false;
  }
}

export type AppStartSearchParams = {
  /** W0022：`?step=3`／`?step=4` 请求直接打开某一步；能不能打开由客户端壳按硬顺序判定。 */
  step?: string | string[];
};

export default async function AppStartPage({
  searchParams,
}: {
  searchParams?: Promise<AppStartSearchParams>;
} = {}) {
  if (!readGuideDemoConfig().enabled) redirect("/app/agent");

  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fstart");
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");

  const profile = await readProfileGoal(actor.id);
  const guide = profile
    ? await readStartGuideForActor({
        actorId: actor.id,
        relationshipGoal: profile.relationshipGoal,
        userId: session.user.id,
      })
    : ({ kind: "unavailable" } as const);
  if (guide.kind === "disabled") redirect("/app/agent");

  const requestedStep = parseStartStepParam((await searchParams)?.step);

  let body;
  if (guide.kind === "ready" && profile) {
    const [communityJoined, events, registeredAny] = await Promise.all([
      readCommunityJoinedForActor({ actorId: actor.id }),
      readStartEvents(actor.id),
      readRegisteredAny(actor.id),
    ]);
    body = (
      <StartGuide
        cardScanAvailable={resolveBusinessCardCaptureAvailability().available}
        communityJoined={communityJoined}
        events={events}
        profileUpdatedAt={profile.updatedAt}
        registeredAnyEvent={registeredAny}
        relationshipGoal={profile.relationshipGoal}
        requestedStep={requestedStep}
        snapshot={guide.snapshot}
      />
    );
  } else {
    body = <StartGuideUnavailable />;
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-real-page="start-guide" data-orbit-route="app-start-guide-route">
        {body}
      </div>
    </>
  );
}
