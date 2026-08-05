import type {
  ConfigureEventAdmissionPolicyInput,
  DecideEventAdmissionApplicationInput,
  EventAdmissionApplication,
  EventAdmissionPolicy,
  EventAdmissionReviewPage,
  ListEventAdmissionReviewsInput,
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
  listApplications(
    input: ListEventAdmissionReviewsInput,
  ): Promise<EventAdmissionReviewPage>;
  submitApplication(
    input: SubmitEventAdmissionApplicationInput,
  ): Promise<EventAdmissionApplication>;
  withdrawApplication(
    input: WithdrawEventAdmissionApplicationInput,
  ): Promise<EventAdmissionApplication>;
}
