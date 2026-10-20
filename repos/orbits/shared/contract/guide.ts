export interface GuideProgressSnapshotContract {
  completedAt: string | null;
  confirmedContacts: number;
  currentStep: 1 | 2 | 3 | null;
  grandfathered: boolean;
  hasActivePlan: boolean;
  step1Skipped: boolean;
  contactSamples: readonly { displayName: string; organization: string | null; role: string | null }[];
}

export interface GuideProgressContract {
  snapshot: GuideProgressSnapshotContract;
  relationshipGoal: string;
  flags: { contacts: boolean; goal: boolean; plan: boolean };
  completed: number;
}
