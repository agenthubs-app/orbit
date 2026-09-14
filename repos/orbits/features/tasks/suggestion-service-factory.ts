import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createNoteRepository } from "../notes/repository";
import { createNoteService } from "../notes/service";
import { createTaskRepository } from "./repository";
import { createTaskService } from "./service";
import { createTaskSuggestionRepository } from "./suggestion-repository";
import { createTaskSuggestionService } from "./suggestion-service";

export function createConfiguredTaskSuggestionService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) {
    throw new Error("Task suggestion storage is not configured");
  }
  const taskService = createTaskService({
    repository: createTaskRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
  });
  const noteService = createNoteService({
    repository: createNoteRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
  });
  return createTaskSuggestionService({
    repository: createTaskSuggestionRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
    taskService,
    async validateSourceNote(input) {
      const note = await noteService.get({ actorId: input.actorId, noteId: input.noteId });
      return note?.version === input.version;
    },
  });
}
