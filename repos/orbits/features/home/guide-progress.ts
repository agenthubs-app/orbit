import { createConfiguredStorageAccountSessionProvider } from "../account/storage/account-live-record-provider";
import type { GuideStateService } from "../guide/guide-state";
import { createConfiguredConfirmedContactCounter, decideGrandfathered } from "../guide/progress";
import { resolveGuideStateService } from "../guide/service-factory";
import { resolvePlanService } from "../plans/service-factory";
import { resolvePlanV2Service } from "../plans/v2/service-factory";
import { createProfileService } from "../profile/service-factory";
import { computeGuideRealProgress, type GuideRealProgress } from "../../shared/compute/guide-real-progress";
import { readGuideDemoConfig } from "../../shared/config/guide-demo";

export interface HomeGuideProgressSources {
  countContacts?: (actorId: string) => Promise<number>;
  guideState?: (actorId: string) => GuideStateService | null;
  hasActivePlan?: (actorId: string) => Promise<boolean>;
  readAccountCreatedAt?: (actorId: string, userId: string | null) => Promise<string | null>;
  readGoal?: (actorId: string) => Promise<string | null>;
  /** D2 cutoff only. The demo enabled flag is deliberately absent. */
  since?: Date | null;
}

async function liveGoal(actorId: string): Promise<string | null> {
  const result = await createProfileService("live").getProfile({ actorId });
  if (result.success === false || !result.data.profile) throw new Error("HOME_GUIDE_PROFILE_UNAVAILABLE");
  return result.data.profile.relationshipGoal ?? null;
}

async function livePlan(actorId: string): Promise<boolean> {
  const v1 = resolvePlanService({ actorId, mode: "live" });
  const v2 = resolvePlanV2Service({ actorId, mode: "live" });
  if (v1.success === false || v2.success === false) throw new Error("HOME_GUIDE_PLAN_UNAVAILABLE");
  const [current, activeV2] = await Promise.all([v1.service.getCurrent(), v2.service.activeTypeNeeds()]);
  return current !== null || activeV2.plans.length > 0;
}

async function accountCreatedAt(actorId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const provider = createConfiguredStorageAccountSessionProvider();
  if (!provider) return null;
  const graph = await provider.readAccountSessionGraph({ userId });
  return graph.accounts.find((account) => account.id === actorId)?.createdAt ?? null;
}

/** Same actor facts as the start guide, with no dependency on its demo switch. */
export async function readHomeGuideProgress(
  input: { actorId: string; userId?: string | null },
  sources: HomeGuideProgressSources = {},
): Promise<GuideRealProgress> {
  const actorId = input.actorId.trim();
  if (!actorId) return { kind: "unavailable" };
  const resolution = sources.guideState
    ? sources.guideState(actorId)
    : (() => {
      const result = resolveGuideStateService({ actorId, mode: "live" });
      return result.success ? result.service : null;
    })();
  if (!resolution) return { kind: "unavailable" };

  try {
    const state = await resolution.get();
    if (state.completedAt || state.grandfathered === true) {
      return computeGuideRealProgress({
        completedAt: state.completedAt, confirmedContacts: 0, grandfathered: state.grandfathered,
        hasActivePlan: false, relationshipGoal: null, step1Skipped: state.step1Skipped,
      });
    }
    const confirmedContacts = await (sources.countContacts ?? createConfiguredConfirmedContactCounter())(actorId);
    let grandfathered: boolean | null = state.grandfathered;
    if (grandfathered === null) {
      const createdAt = confirmedContacts >= 3
        ? await (sources.readAccountCreatedAt ?? accountCreatedAt)(actorId, input.userId ?? null).catch(() => null)
        : null;
      const decided = decideGrandfathered({
        accountCreatedAt: createdAt, confirmedContacts,
        since: sources.since === undefined ? readGuideDemoConfig().since : sources.since,
      });
      grandfathered = (await resolution.recordGrandfathered(decided)).grandfathered;
      if (grandfathered === null) return { kind: "unavailable" };
    }
    if (grandfathered) return { kind: "hidden", reason: "grandfathered" };
    const [relationshipGoal, hasActivePlan] = await Promise.all([
      (sources.readGoal ?? liveGoal)(actorId),
      (sources.hasActivePlan ?? livePlan)(actorId),
    ]);
    const progress = computeGuideRealProgress({
      completedAt: state.completedAt, confirmedContacts, grandfathered, hasActivePlan,
      relationshipGoal, step1Skipped: state.step1Skipped,
    });
    if (progress.kind === "progress" && progress.completed === 3) await resolution.markCompleted();
    return progress;
  } catch {
    return { kind: "unavailable" };
  }
}
