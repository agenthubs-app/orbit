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

/**
 * Sprint 0112: one page of an opened AI session's messages, newest page first.
 * `nextCursor` loads the page just before this one (older messages); it is
 * bound to the account and the session and is null on the oldest page.
 */
export interface AiSessionMessagePageContract {
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
}
