import type { PortraitGeneration, PortraitSaveBody, PortraitSaveResult, SavedPortrait } from "../../../../shared/contract/event-registration-portrait";
import type { TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import type { EventAccessPrincipalFacts } from "../../event-access/capability-policy";
import type { EventParticipantProfile } from "../contract";

export class PortraitError extends Error {
  constructor(readonly status: 403 | 404 | 409 | 422 | 503, readonly code: string, message: string) {
    super(message);
    this.name = "PortraitError";
  }
}

export interface PortraitSnapshot {
  eventExists: boolean;
  access: EventAccessPrincipalFacts;
  sourceRegistrationVersion: string | null;
  sourceRegistrationFingerprint?: string | null;
  registrationProfile?: EventParticipantProfile | null;
  eventSourceVersion?: string;
  eventVersion?: number;
  questionSetHash?: string | null;
  questionSetVersion?: number | null;
}
export type PortraitSnapshotReader = (transaction: TransactionalSqlExecutor, input: { workspaceId: string; eventId: string; actorId: string; subjectId: string }) => Promise<PortraitSnapshot>;
export interface PortraitRepository {
  readSources(input: { actorId: string; eventId: string }): Promise<{ snapshot: PortraitSnapshot; portrait: SavedPortrait | null }>;
  read(input: { actorId: string; eventId: string; subjectId?: string }): Promise<SavedPortrait | null>;
  save(input: { actorId: string; eventId: string; mutation: PortraitSaveBody; generation: PortraitGeneration; updatedAt: string }): Promise<PortraitSaveResult>;
}
