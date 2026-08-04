import type {
  ConfigureEventAdmissionPolicyInput,
  DecideEventAdmissionApplicationInput,
  EventAdmissionApplication,
  EventAdmissionPolicy,
  SubmitEventAdmissionApplicationInput,
  WithdrawEventAdmissionApplicationInput,
} from "./contract";

export interface EventAdmissionRepository {
  configurePolicy(
    input: ConfigureEventAdmissionPolicyInput & { updatedByActorId: string },
  ): Promise<EventAdmissionPolicy>;
  decideApplication(
    input: DecideEventAdmissionApplicationInput,
  ): Promise<EventAdmissionApplication>;
  getApplication(
    eventId: string,
    actorId: string,
  ): Promise<EventAdmissionApplication | null>;
  getPolicy(eventId: string): Promise<EventAdmissionPolicy | null>;
  submitApplication(
    input: SubmitEventAdmissionApplicationInput,
  ): Promise<EventAdmissionApplication>;
  withdrawApplication(
    input: WithdrawEventAdmissionApplicationInput,
  ): Promise<EventAdmissionApplication>;
}
