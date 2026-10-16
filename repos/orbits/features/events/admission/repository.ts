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
  /**
   * R17（host/DESIGN.md §2.6「当日枠で受付」）：キャンセル待ちの人を当日受付で admitted にする。
   * 满员时只有 `allowOverCapacity` 才放行，并记 `over_capacity`；受付番号同一事务分配，不发通知。可选：只有 Postgres 实现。
   */
  admitOnSite?(input: { actorId: string; decisionActorId: string; eventId: string; allowOverCapacity: boolean }): Promise<{ application: EventAdmissionApplication; overCapacity: boolean; receptionNumber: string | null }>;
}
