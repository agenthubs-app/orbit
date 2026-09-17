import type { InboxNotificationSource } from '../../../shared/contract/inbox-notifications';

export const DISCOVERY_POLICY_VERSION = '2026-09-16-v1';
export const DISCOVERY_LIMITS = { page: 50, pagesPerRound: 4, sourcesPerRound: 200, requestsPerRound: 2, packagesPerRequest: 20, attempts: 3, suggestionsPerDay: 3, excerptCharacters: 2_000 } as const;
export interface DiscoveryEvidence {
  key: string;
  source: InboxNotificationSource;
  actorId: string;
  authorId: string;
  text: string;
  objects: { id: string; name: string }[];
  links: string[];
  status: 'active' | 'completed' | 'cancelled';
  href: string;
  explicitDueAt?: string;
  plannedDate?: string;
}
export interface DiscoveryCandidate {
  sourceKeys: string[];
  action: string;
  actionQuote: string;
  factQuote: string;
  objectId: string;
  responsibleActorId: string;
  mode: 'commitment' | 'suggestion';
  timeQuote: string | null;
  inference: string;
  goalKey: string | null;
  goalQuote: string | null;
}
export interface DiscoveryCursor { at: string; key: string }
export interface DiscoverySourceRef { kind: InboxNotificationSource['sourceKind']; id: string; revision: string; at: string; key: string }
export interface DiscoveryPreferences {
  actorId: string;
  enabled: boolean;
  messageAnalysisEnabled: boolean;
  timeZone: string;
  language: 'zh' | 'en' | 'ja';
  revision: number;
  generation: number;
  enabledSince: string;
  messageEnabledSince: string;
  updatedAt: string;
}
export interface DiscoveryJob {
  id: string;
  actorId: string;
  source: DiscoverySourceRef;
  generation: number;
  state: 'queued' | 'running' | 'done' | 'rejected' | 'failed' | 'cancelled';
  attempts: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  leaseToken: string | null;
  reason: string | null;
  notificationId: string | null;
}
export interface QualifiedDiscovery {
  eligible: true;
  kind: 'reminder' | 'suggestion';
  action: string;
  object: { id: string; name: string };
  facts: string;
  inference: string;
  evidence: DiscoveryEvidence[];
  dueAt?: string;
  scheduledFor?: string;
  expiresAt: string;
}
export type DiscoveryQualification = QualifiedDiscovery | { eligible: false; reason: string };
