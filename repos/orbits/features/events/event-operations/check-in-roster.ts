export interface EventOperationsLimitedCheckInRosterItem {
  readonly checkedIn: boolean;
  readonly checkedInAt: string | null;
  readonly displayName: string;
  readonly participantId: string;
}

export interface EventOperationsLimitedCheckInRoster {
  readonly eventId: string;
  readonly participants: readonly EventOperationsLimitedCheckInRosterItem[];
}
