/** Bounded list previews, not contact details or an offline contact replica. */
export interface ContactCardDTO {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  sourceType: string;
  status: "active" | "needs_follow_up" | "nurture" | "archived";
  pendingInitialization: boolean;
  nextActionPreview: string;
  /** Bounded distinct labels; older page deployments may omit this field. */
  valueTypes?: ("strategic_fit" | "commercial_opportunity" | "knowledge_exchange" | "referral_path" | "community_context")[];
  updatedAt: string;
}

export interface ContactCardPageDTO {
  items: ContactCardDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  asOf: string;
}

export interface ContactCardSummaryDTO {
  total: number;
  sources: Record<string, number>;
  statuses: Record<string, number>;
  values: Record<string, number>;
  /** First 50 global tags; never infer a complete tag catalogue from this. */
  tags: { value: string; count: number }[];
  hasMoreTags: boolean;
  asOf: string;
}
