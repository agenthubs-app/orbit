import {
  type ConfigureEventAdmissionPolicyInput,
  type DecideEventAdmissionApplicationInput,
  type EventAdmissionApplication,
  type EventAdmissionPolicy,
  type EventAdmissionReviewPage,
  type ListEventAdmissionReviewsInput,
  type SubmitEventAdmissionApplicationInput,
} from "./contract";
import type { EventAccessCapability } from "../event-access/contract";
import type { EventAdmissionRepository } from "./repository";

export interface EventAdmissionService {
  configurePolicy(
    actingActorId: string,
    input: ConfigureEventAdmissionPolicyInput,
  ): Promise<EventAdmissionPolicy>;
  decideApplication(
    actingActorId: string,
    input: Omit<DecideEventAdmissionApplicationInput, "decisionActorId">,
  ): Promise<EventAdmissionApplication>;
  getApplication(
    actingActorId: string,
    eventId: string,
  ): Promise<EventAdmissionApplication | null>;
  getApplicationForReview(
    actingActorId: string,
    eventId: string,
    applicantActorId: string,
  ): Promise<EventAdmissionApplication | null>;
  getPolicy(eventId: string): Promise<EventAdmissionPolicy | null>;
  listApplications(
    actingActorId: string,
    input: ListEventAdmissionReviewsInput,
  ): Promise<EventAdmissionReviewPage>;
  submitApplication(
    actingActorId: string,
    input: Omit<SubmitEventAdmissionApplicationInput, "actorId">,
  ): Promise<EventAdmissionApplication>;
  withdrawApplication(
    actingActorId: string,
    eventId: string,
    expectedApplicationVersion: number,
  ): Promise<EventAdmissionApplication>;
}

export function createEventAdmissionService(input: {
  requireCapability(
    actorId: string,
    eventId: string,
    capability: EventAccessCapability,
  ): Promise<void>;
  repository: EventAdmissionRepository;
}): EventAdmissionService {
  return {
    async configurePolicy(actingActorId, policy) {
      await input.requireCapability(
        actingActorId,
        policy.eventId,
        "operations.configure",
      );
      return input.repository.configurePolicy({
        ...policy,
        updatedByActorId: actingActorId,
      });
    },
    async decideApplication(actingActorId, decision) {
      await input.requireCapability(
        actingActorId,
        decision.eventId,
        "admission.decide",
      );
      return input.repository.decideApplication({
        ...decision,
        decisionActorId: actingActorId,
      });
    },
    async getApplication(actingActorId, eventId) {
      return input.repository.getApplication(eventId, actingActorId);
    },
    async getApplicationForReview(actingActorId, eventId, applicantActorId) {
      await input.requireCapability(
        actingActorId,
        eventId,
        "admission.read",
      );
      return input.repository.getApplication(eventId, applicantActorId);
    },
    getPolicy: (eventId) => input.repository.getPolicy(eventId),
    async listApplications(actingActorId, reviewInput) {
      await input.requireCapability(
        actingActorId,
        reviewInput.eventId,
        "admission.read",
      );
      return input.repository.listApplications(reviewInput);
    },
    submitApplication(actingActorId, application) {
      return input.repository.submitApplication({
        ...application,
        actorId: actingActorId,
      });
    },
    withdrawApplication(actingActorId, eventId, expectedApplicationVersion) {
      return input.repository.withdrawApplication({
        actorId: actingActorId,
        eventId,
        expectedApplicationVersion,
      });
    },
  };
}
