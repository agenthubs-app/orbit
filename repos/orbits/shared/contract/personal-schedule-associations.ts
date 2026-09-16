export type PersonalScheduleAssociationKind = "note" | "contact";

export interface PersonalScheduleAssociationOption {
  id: string;
  title: string;
  avatarUrl?: string;
}

export interface PersonalScheduleAssociationOptionsPage {
  actorId: string;
  kind: PersonalScheduleAssociationKind;
  options: PersonalScheduleAssociationOption[];
  sourceVersion: string;
  nextCursor?: string;
  partial: boolean;
}
