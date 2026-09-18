import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import { createConfiguredNoteService } from "../../notes/service-factory";
import { createConfiguredPersonalScheduleService } from "../../personal-schedule/service-factory";
import { createConfiguredTaskService } from "../../tasks/service-factory";
import { createEventCrudAndImportService } from "../../events/service-factory";
import { createManualContactCreationServiceForActor } from "../../acquisition/service-factory";
import {
  createContactDraftAdapter,
  createEventDraftAdapter,
  createNoteDraftAdapter,
  createScheduleDraftAdapter,
  createTaskDraftAdapter,
  type ContactDraftCreatePort,
  type EventCreatePort,
  type NoteCreatePort,
  type ScheduleCreatePort,
  type TaskCreatePort,
} from "./adapters";
import { createLiveRecordEntityDraftRepository } from "./live-record-repository";
import { createEntityDraftService, type EntityDraftService } from "./service";

/**
 * Sprint 0085: wires the draft state machine to the real domain services.
 *
 * Adapters are built per actor because the contact path is actor-scoped.
 */
export function createConfiguredEntityDraftService(
  actorId: string,
): EntityDraftService | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;

  const repository = createLiveRecordEntityDraftRepository({
    store: createPostgresLiveRecordStore({ client: runtime.client }),
    workspaceId: runtime.workspaceId,
  });

  return createEntityDraftService({
    adapters: [
      createTaskDraftAdapter(createConfiguredTaskService() as unknown as TaskCreatePort),
      createNoteDraftAdapter(createConfiguredNoteService() as unknown as NoteCreatePort),
      createScheduleDraftAdapter(
        createConfiguredPersonalScheduleService() as unknown as ScheduleCreatePort,
      ),
      createEventDraftAdapter(
        createEventCrudAndImportService() as unknown as EventCreatePort,
      ),
      createContactDraftAdapter(
        createManualContactCreationServiceForActor(actorId) as unknown as ContactDraftCreatePort,
      ),
    ],
    repository,
  });
}
