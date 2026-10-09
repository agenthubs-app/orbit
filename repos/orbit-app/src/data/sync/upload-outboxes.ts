import { createMessageOutboxUploader } from "./message-outbox-upload";
import { createNoteOutboxUploader } from "./note-outbox-upload";
import { createScheduleOutboxUploader } from "./schedule-outbox-upload";
import type { OutboxUploadScope } from "./sync-coordinator";
import { createTaskOutboxUploader } from "./task-outbox-upload";

/**
 * Sprint 0136: the App's one upload step, moved out of useSyncedCollection so the
 * acceptance tests run exactly this composition. Order matters: notes first (a
 * schedule linking an offline note needs the note's formal id), then tasks,
 * schedules and messages. Abort cancels every uploader.
 */
export async function uploadAllOutboxes({ actorId, baseUrl, workspaceId, signal, repository, syncClient, writeClient }: OutboxUploadScope): Promise<void> {
  if (!writeClient) return;
  const common = { actorId, baseUrl, workspaceId, repository, syncClient, writeClient };
  const uploaders = [
    createNoteOutboxUploader(common),
    createTaskOutboxUploader(common),
    createScheduleOutboxUploader(common),
    createMessageOutboxUploader(common),
  ];
  for (const uploader of uploaders) signal.addEventListener("abort", () => uploader.cancel(), { once: true });
  for (const uploader of uploaders) {
    if (signal.aborted) return;
    await uploader.run();
  }
}
