import { createMessageOutboxUploader } from "./message-outbox-upload";
import { createAiSessionOutboxUploader } from "./ai-session-outbox-upload";
import { createContactOutboxUploader } from "./contact-outbox-upload";
import { createNoteOutboxUploader } from "./note-outbox-upload";
import { MAX_ROUND_MS } from "./outbox-uploader";
import { createScheduleOutboxUploader } from "./schedule-outbox-upload";
import type { OutboxUploadScope } from "./sync-coordinator";
import { createTaskOutboxUploader } from "./task-outbox-upload";

/**
 * Sprint 0136: the App's one upload step, moved out of useSyncedCollection so the
 * acceptance tests run exactly this composition. Order matters: notes first (a
 * schedule linking an offline note needs the note's formal id), then tasks,
 * schedules, messages, iOrbit history edits and offline contact deletes (LF12). Abort cancels every uploader.
 * Sprint 0145: the 30 s budget covers the whole round, not each uploader; whatever is not reached
 * stays queued (no attempt spent) for the next trigger.
 */
export async function uploadAllOutboxes(
  { actorId, baseUrl, workspaceId, signal, repository, syncClient, writeClient }: OutboxUploadScope,
  { now = Date.now }: { now?: () => number } = {},
): Promise<void> {
  if (!writeClient) return;
  const deadline = now() + MAX_ROUND_MS;
  const common = { actorId, baseUrl, workspaceId, repository, syncClient, writeClient, now };
  const uploaders = [
    createNoteOutboxUploader(common),
    createTaskOutboxUploader(common),
    createScheduleOutboxUploader(common),
    createMessageOutboxUploader(common),
    createAiSessionOutboxUploader(common),
    createContactOutboxUploader(common),
  ];
  for (const uploader of uploaders) signal.addEventListener("abort", () => uploader.cancel(), { once: true });
  for (const uploader of uploaders) {
    if (signal.aborted || now() >= deadline) return;
    await uploader.run({ deadline });
  }
}
