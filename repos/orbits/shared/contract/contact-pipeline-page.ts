export type ContactPipelineStageCode =
  | "to_contact"
  | "in_progress"
  | "nurture"
  | "archived";

/** A display-only row for one page of a relationship stage. Contact details remain on the exact-id endpoint. */
export interface ContactPipelineItemContract {
  id: string;
  displayName: string;
  organization: string;
  role: string;
}

/** Top three scheduled actions, joined to actor-owned contact display fields in the read model. */
export interface ContactPipelineActionContract {
  taskId: string;
  contactId: string;
  contactName: string;
  organization: string;
  role: string;
  title: string;
  dueAt: string;
}

export interface ContactPipelineStageCountsContract {
  to_contact: number;
  in_progress: number;
  nurture: number;
  archived: number;
}

export interface ContactPipelinePageContract {
  asOf: string;
  stage: ContactPipelineStageCode;
  stageCounts: ContactPipelineStageCountsContract;
  items: ContactPipelineItemContract[];
  hasMore: boolean;
  nextCursor: string | null;
  actions: ContactPipelineActionContract[];
}
