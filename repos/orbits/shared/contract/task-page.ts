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
  relatedContact: { id: string; namePreview: string; organizationPreview: string } | null;
}

export interface TaskPageContract {
  actorId: string;
  status: "open" | "completed";
  scope: "all" | "relationship";
  query: string;
  items: TaskCardContract[];
  counts: { open: number; completed: number };
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  asOf: string;
}
