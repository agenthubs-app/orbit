/** Read-only previews, not full suggestions or confirmation receipts. */
export interface TaskSuggestionCardContract {
  id: string;
  titlePreview: string;
  reasonPreview: string;
  category: "relationship" | "meeting" | "event" | "work" | "personal" | "other";
  updatedAt: string;
}

export interface TaskSuggestionPageContract {
  actorId: string;
  scope: "all" | "relationship";
  items: TaskSuggestionCardContract[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  asOf: string;
}
