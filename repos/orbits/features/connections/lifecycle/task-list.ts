import type { RelationshipTaskSummary } from "../../../shared/contract/relationship-lifecycle";
import { createConfiguredStorageFollowupTaskProvider, type LiveFollowupGraph } from "../../followups/storage/followup-live-record-provider";
import { AppError } from "../../../shared/errors/app-error";

export function relationshipTaskSummaries(graph: LiveFollowupGraph, actorId: string): RelationshipTaskSummary[] {
  const connections = new Map(graph.connections.filter(item => item.accountId === actorId).map(item => [item.id, item]));
  const contacts = new Map(graph.contacts.map(item => [item.id, item]));
  return graph.tasks.flatMap(task => {
    const connection = task.connectionId ? connections.get(task.connectionId) : null;
    const contact = connection ? contacts.get(connection.contactId) : null;
    if (!connection || !contact || (task.contactId && task.contactId !== contact.id)) return [];
    return [{ taskId: task.id, connectionId: connection.id, contactId: contact.id, contactName: contact.displayName, title: task.title, status: task.status, dueAt: task.dueAt ?? null }];
  }).sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.taskId.localeCompare(b.taskId));
}
export async function readRelationshipTaskSummaries(actorId: string): Promise<RelationshipTaskSummary[]> {
  const provider = createConfiguredStorageFollowupTaskProvider();
  if (!provider) throw new AppError("SERVICE_UNAVAILABLE", "Relationship storage is not configured.");
  return relationshipTaskSummaries(await provider.readFollowupGraph(actorId), actorId);
}
