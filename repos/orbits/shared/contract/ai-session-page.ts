import type { AiSessionOrganizationContract } from "./ai-sessions";

export interface AiSessionSummaryItemContract {
  id: string;
  title: string;
  firstUserText: string;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
  messageRevision: number;
  organization: AiSessionOrganizationContract;
}

export interface AiSessionSummaryPageContract {
  items: AiSessionSummaryItemContract[];
  nextCursor: string | null;
  hasMore: boolean;
  storage: {
    configured: boolean;
    persisted: boolean;
    source?: string;
  };
}
