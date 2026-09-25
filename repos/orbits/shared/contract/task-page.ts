export interface TaskCardContract {
  id: string;
  titlePreview: string;
  locationPreview: string | null;
  status: "open" | "completed";
  category: "relationship" | "meeting" | "event" | "work" | "personal" | "other";
  priority: "normal" | "high";
  plannedDate: string | null;
  dueAt: string | null;
  updatedAt: string;
  /** Older page deployments may omit this; never infer it from updatedAt. */
  completedAt?: string | null;
  relatedContact: { id: string; namePreview: string; organizationPreview: string } | null;
}

export interface TaskPageContract {
  actorId: string;
  status: "open" | "completed";
  scope: "all" | "relationship";
  query: string;
  /** When requested: planned on/before this date OR due before this UTC instant. */
  dueWindow?: { plannedThrough: string; dueBefore: string };
  items: TaskCardContract[];
  counts: { open: number; completed: number };
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  asOf: string;
}
