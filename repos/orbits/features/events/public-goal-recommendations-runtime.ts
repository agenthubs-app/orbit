import { createConfiguredCanonicalPublicEventCatalogue } from "./core/public-catalogue-runtime";
import { createConfiguredEventOperationsRepository } from "./event-operations/repository";
import {
  createPublicGoalRecommendationsService,
  type PublicGoalRecommendationsService,
} from "./public-goal-recommendations";
import { createProfileService } from "../profile/service-factory";

export interface ConfiguredPublicGoalRecommendationsRuntimeOptions {
  now?: () => Date;
}

export function createConfiguredPublicGoalRecommendationsRuntime(
  input: ConfiguredPublicGoalRecommendationsRuntimeOptions = {},
): PublicGoalRecommendationsService {
  return createPublicGoalRecommendationsService({
    listMemberships: async ({ accountId, eventIds }) => {
      const repository = createConfiguredEventOperationsRepository();
      if (!repository) {
        throw new Error("Canonical event operations are unavailable");
      }
      return repository.listCanonicalRegistrationsForUser(accountId, eventIds);
    },
    now: input.now,
    readPublicCatalogue: async (now) => {
      const catalogue = createConfiguredCanonicalPublicEventCatalogue({ now });
      if (!catalogue) {
        throw new Error("Canonical public event catalogue is unavailable");
      }
      return catalogue.readRecords();
    },
    readRelationshipGoal: async (accountId) => {
      const profileService = createProfileService("live");
      const profileResult = await profileService.getProfile({ actorId: accountId });
      if (!profileResult || profileResult.success !== true) {
        throw new Error("Canonical live profile is unavailable");
      }
      if (!profileResult.data.profile) return null;
      if (typeof profileResult.data.profile.relationshipGoal !== "string") {
        throw new Error("Canonical live profile goal is invalid");
      }
      return profileResult.data.profile.relationshipGoal;
    },
  });
}
