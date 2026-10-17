import { relationshipLifecycleReadSchema, relationshipTaskPageItemSchema } from "../../../../../shared/api-schema/relationship-lifecycle";
import type { RelationshipLifecycleSnapshotDTO } from "../../../../../shared/contract/relationship-lifecycle";

const mappingSchema = relationshipTaskPageItemSchema.pick({ taskId: true, connectionId: true, contactId: true });
export interface RelationshipFollowupRead {
  mapping: { taskId: string; connectionId: string; contactId: string };
  snapshot: RelationshipLifecycleSnapshotDTO;
}

export function createRelationshipFollowupClient(options: { fetch?: typeof fetch; actorId?: string } = {}) {
  const request = options.fetch ?? globalThis.fetch;
  async function readJson(path: string, signal?: AbortSignal) {
    if (signal?.aborted) throw Error("ABORTED");
    const response = await request(path, { cache: "no-store", credentials: "same-origin", signal });
    if (signal?.aborted) throw Error("ABORTED");
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : response.status === 404 ? "NOT_FOUND" : response.status === 409 ? "CONFLICT" : "UNAVAILABLE");
    const maximum = 1024 * 1024;
    if (Number(response.headers.get("content-length")) > maximum) throw Error("INVALID_RESPONSE");
    const body = await response.text();
    if (signal?.aborted) throw Error("ABORTED");
    if (new TextEncoder().encode(body).byteLength > maximum) throw Error("INVALID_RESPONSE");
    const envelope = JSON.parse(body);
    if (!envelope?.success) throw Error("INVALID_RESPONSE");
    return envelope.data;
  }
  return { async read(taskId: string, signal?: AbortSignal): Promise<RelationshipFollowupRead> {
    try {
      if (!taskId || taskId.length > 256 || taskId.trim() !== taskId || /[\u0000-\u001f\u007f]/u.test(taskId)) throw Error("INVALID_RESPONSE");
      const mapping = mappingSchema.parse(await readJson(`/api/relationship-tasks/${encodeURIComponent(taskId)}/resolve`, signal));
      if (mapping.taskId !== taskId) throw Error("INVALID_RESPONSE");
      const { snapshot } = relationshipLifecycleReadSchema.parse(await readJson(`/api/connections/${encodeURIComponent(mapping.connectionId)}/lifecycle`, signal));
      const task = snapshot.tasks.find(item => item.taskId === taskId);
      if ((options.actorId && snapshot.connection.actorId !== options.actorId) || snapshot.connection.connectionId !== mapping.connectionId || snapshot.connection.contactId !== mapping.contactId || !task
        || task.actorId !== snapshot.connection.actorId || task.connectionId !== mapping.connectionId || task.contactId !== mapping.contactId
        || snapshot.tasks.filter(item => item.taskId === taskId).length !== 1) throw Error("INVALID_RESPONSE");
      return { mapping, snapshot: snapshot as RelationshipLifecycleSnapshotDTO };
    } catch (error) {
      if (signal?.aborted) throw Error("ABORTED");
      if (error instanceof Error && ["UNAUTHORIZED", "NOT_FOUND", "CONFLICT", "UNAVAILABLE", "ABORTED"].includes(error.message)) throw error;
      throw Error("INVALID_RESPONSE");
    }
  } };
}
