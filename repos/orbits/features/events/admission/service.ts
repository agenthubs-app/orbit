import {
  EventAdmissionError,
  type ConfigureEventAdmissionPolicyInput,
  type DecideEventAdmissionApplicationInput,
  type EventAdmissionApplication,
  type EventAdmissionPolicy,
  type SubmitEventAdmissionApplicationInput,
} from "./contract";
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
  getPolicy(eventId: string): Promise<EventAdmissionPolicy | null>;
  submitApplication(
    actingActorId: string,
    input: Omit<SubmitEventAdmissionApplicationInput, "actorId">,
  ): Promise<EventAdmissionApplication>;
  withdrawApplication(
    actingActorId: string,
    eventId: string,
  ): Promise<EventAdmissionApplication>;
}

export function createEventAdmissionService(input: {
  canManageEvent(actorId: string, eventId: string): Promise<boolean>;
  repository: EventAdmissionRepository;
}): EventAdmissionService {
  const requireManager = async (actorId: string, eventId: string) => {
    if (!(await input.canManageEvent(actorId, eventId))) {
      throw new EventAdmissionError(
        "FORBIDDEN",
        `Actor ${actorId} cannot manage admission for event ${eventId}.`,
      );
    }
  };
  return {
    async configurePolicy(actingActorId, policy) {
      await requireManager(actingActorId, policy.eventId);
      return input.repository.configurePolicy({
        ...policy,
        updatedByActorId: actingActorId,
      });
    },
    async decideApplication(actingActorId, decision) {
      await requireManager(actingActorId, decision.eventId);
      return input.repository.decideApplication({
        ...decision,
        decisionActorId: actingActorId,
      });
    },
    async getApplication(actingActorId, eventId) {
      return input.repository.getApplication(eventId, actingActorId);
    },
    getPolicy: (eventId) => input.repository.getPolicy(eventId),
    submitApplication(actingActorId, application) {
      return input.repository.submitApplication({
        ...application,
        actorId: actingActorId,
      });
    },
    withdrawApplication(actingActorId, eventId) {
      return input.repository.withdrawApplication({
        actorId: actingActorId,
        eventId,
      });
    },
  };
}
