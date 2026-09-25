import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../../../shared/domain/contracts";
import type { LiveFollowupTaskProvider } from "../../../../features/followups/live-service";
import {
  validateRelationshipLifecycleFacts,
  type RelationshipLifecycleFactsReader,
} from "../../../../features/followups/storage/relationship-lifecycle-facts-reader";
import {
  createConfiguredStorageFollowupTaskProvider,
} from "../../../../features/followups/storage/followup-live-record-provider";

export interface RelationshipLifecycleTaskView {
  id: string;
  title: string;
  status: TaskDTO["status"];
  dueAt?: string;
  contactId: string | null;
  connectionId: string | null;
  contactName: string;
  organization: string;
  relationshipStage: ConnectionDTO["stage"] | null;
  operationHref: string | null;
  issue?: string;
  updatedAt: string;
}

export interface RelationshipLifecycleTaskCollections {
  currentTasks: readonly RelationshipLifecycleTaskView[];
  historyTasks: readonly RelationshipLifecycleTaskView[];
  orphanTasks: readonly RelationshipLifecycleTaskView[];
  currentCount: number;
  historyCount: number;
  orphanCount: number;
  pagination?: Record<"current" | "history" | "orphan", { nextHref: string | null; firstHref: string | null }>;
}

export type RelationshipLifecycleTaskReadModel =
  | ({ state: "success"; sourceLabel: string } & RelationshipLifecycleTaskCollections)
  | ({ state: "empty" | "unavailable"; sourceLabel: string; reason?: string } & RelationshipLifecycleTaskCollections);

type RelationshipLifecycleTaskReaderOptions = {
  actorId: string;
  provider?: never;
  reader?: RelationshipLifecycleFactsReader | null;
};

type RelationshipLifecycleTaskProviderOptions = {
  actorId: string;
  provider?: LiveFollowupTaskProvider | null;
  reader?: never;
};

export type RelationshipLifecycleTaskReadOptions =
  | RelationshipLifecycleTaskReaderOptions
  | RelationshipLifecycleTaskProviderOptions;

type RelationshipLifecycleTaskInput = Pick<
  TaskDTO,
  "id" | "title" | "status" | "contactId" | "connectionId" | "dueAt" | "updatedAt"
>;
type RelationshipLifecycleContactInput = Pick<
  ContactDTO,
  "id" | "displayName" | "organization"
>;
type RelationshipLifecycleConnectionInput = Pick<
  ConnectionDTO,
  "id" | "contactId" | "stage"
>;
type RelationshipLifecycleTaskGraph = {
  tasks: readonly RelationshipLifecycleTaskInput[];
  contacts: readonly RelationshipLifecycleContactInput[];
  connections: readonly RelationshipLifecycleConnectionInput[];
};

function connectionForTask(
  task: RelationshipLifecycleTaskInput,
  connections: ReadonlyMap<string, RelationshipLifecycleConnectionInput>,
): RelationshipLifecycleConnectionInput | null {
  return task.connectionId ? connections.get(task.connectionId) ?? null : null;
}

function resolvedContactForTask(
  task: RelationshipLifecycleTaskInput,
  contacts: ReadonlyMap<string, RelationshipLifecycleContactInput>,
  connections: ReadonlyMap<string, RelationshipLifecycleConnectionInput>,
): { contact: RelationshipLifecycleContactInput | null; connection: RelationshipLifecycleConnectionInput | null; issue?: string } {
  const contact = task.contactId ? contacts.get(task.contactId) ?? null : null;
  const connection = task.connectionId ? connections.get(task.connectionId) ?? null : null;

  if (task.contactId && !contact) {
    return {
      contact: null,
      connection,
      issue: "联系人未在关系数据中找到。",
    };
  }

  if (task.connectionId && !connection) {
    return {
      contact,
      connection: null,
      issue: "关系连接未在关系数据中找到。",
    };
  }

  if (contact && connection && contact.id !== connection.contactId) {
    return {
      contact: null,
      connection,
      issue: "联系人与关系连接不一致。",
    };
  }

  const resolvedContact = contact ?? (connection ? contacts.get(connection.contactId) ?? null : null);

  if (!resolvedContact) {
    return {
      contact: null,
      connection,
      issue: "未找到可打开的联系人。",
    };
  }

  return { contact: resolvedContact, connection };
}

function operationHrefFor(
  contact: Pick<ContactDTO, "id"> | null,
  issue?: string,
): string | null {
  return contact && !issue
    ? `/app/contacts/${encodeURIComponent(contact.id)}`
    : null;
}

function compareTaskViews(
  left: RelationshipLifecycleTaskView,
  right: RelationshipLifecycleTaskView,
): number {
  const leftDue = left.dueAt ?? "9999-12-31T23:59:59.999Z";
  const rightDue = right.dueAt ?? "9999-12-31T23:59:59.999Z";
  const dueOrder = leftDue.localeCompare(rightDue);

  return dueOrder !== 0 ? dueOrder : left.id.localeCompare(right.id);
}

export function relationshipLifecycleTasksFromGraph(
  graph: RelationshipLifecycleTaskGraph,
): RelationshipLifecycleTaskCollections {
  const connections = new Map(graph.connections.map((connection) => [connection.id, connection]));
  const contacts = new Map(graph.contacts.map((contact) => [contact.id, contact]));

  const tasks = graph.tasks.map((task) => {
      const connection = connectionForTask(task, connections);
      const resolved = resolvedContactForTask(task, contacts, connections);
      const contactId = resolved.contact?.id ?? null;

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        ...(task.dueAt ? { dueAt: task.dueAt } : {}),
        contactId,
        connectionId: task.connectionId ?? connection?.id ?? null,
        contactName: resolved.contact?.displayName ?? "未关联联系人",
        organization: resolved.contact?.organization ?? "",
        relationshipStage: resolved.connection?.stage ?? null,
        operationHref: operationHrefFor(resolved.contact, resolved.issue),
        ...(resolved.issue ? { issue: resolved.issue } : {}),
        updatedAt: task.updatedAt,
      } satisfies RelationshipLifecycleTaskView;
    })
    .sort(compareTaskViews);
  const currentTasks = tasks.filter(
    (task) => !task.issue && (task.status === "open" || task.status === "scheduled"),
  );
  const historyTasks = tasks.filter(
    (task) => !task.issue && (task.status === "completed" || task.status === "dismissed"),
  );
  const orphanTasks = tasks.filter((task) => Boolean(task.issue));

  return {
    currentTasks,
    historyTasks,
    orphanTasks,
    currentCount: currentTasks.length,
    historyCount: historyTasks.length,
    orphanCount: orphanTasks.length,
  };
}

function emptyCollections(): RelationshipLifecycleTaskCollections {
  return {
    currentTasks: [],
    historyTasks: [],
    orphanTasks: [],
    currentCount: 0,
    historyCount: 0,
    orphanCount: 0,
  };
}

export async function loadRelationshipLifecycleTasks(
  input: RelationshipLifecycleTaskReadOptions,
): Promise<RelationshipLifecycleTaskReadModel> {
  const actorId = input.actorId.trim();
  const hasReader = Object.hasOwn(input, "reader");
  const hasProvider = Object.hasOwn(input, "provider");
  const sourceLabel =
    (hasReader && input.reader && typeof input.reader.sourceLabel === "string"
      ? input.reader.sourceLabel
      : undefined) ??
    (hasProvider ? input.provider?.sourceLabel : undefined) ??
    "Relationship lifecycle records";

  if (!actorId) {
    return {
      state: "unavailable",
      sourceLabel,
      ...emptyCollections(),
      reason: "An authenticated actor is required before reading relationship lifecycle tasks.",
    };
  }

  if (hasReader && hasProvider) {
    return {
      state: "unavailable",
      sourceLabel,
      ...emptyCollections(),
      reason: "Relationship lifecycle reader and provider are mutually exclusive.",
    };
  }

  if (hasReader) {
    const reader = input.reader;
    if (!reader || typeof reader.readRelationshipLifecycleFacts !== "function") {
      return {
        state: "unavailable",
        sourceLabel,
        ...emptyCollections(),
        reason: "Relationship lifecycle facts reader is not configured.",
      };
    }
    try {
      const facts = validateRelationshipLifecycleFacts(
        await reader.readRelationshipLifecycleFacts(actorId),
      );
      const collections = relationshipLifecycleTasksFromGraph(facts);
      const total = collections.currentCount + collections.historyCount + collections.orphanCount;
      return total > 0
        ? { state: "success", sourceLabel: reader.sourceLabel, ...collections }
        : {
            state: "empty",
            sourceLabel: reader.sourceLabel,
            ...collections,
            reason: "No actor-scoped relationship lifecycle task has a contact or connection target.",
          };
    } catch {
      return {
        state: "unavailable",
        sourceLabel: reader.sourceLabel,
        ...emptyCollections(),
        reason: "Relationship lifecycle records could not be read.",
      };
    }
  }

  const provider = input.provider === undefined
    ? createConfiguredStorageFollowupTaskProvider()
    : input.provider;

  if (!provider) {
    return {
      state: "unavailable",
      sourceLabel,
      ...emptyCollections(),
      reason: "Relationship lifecycle storage is not configured.",
    };
  }

  try {
    const graph = await provider.readFollowupGraph(actorId);
    const collections = relationshipLifecycleTasksFromGraph(graph);
    const total = collections.currentCount + collections.historyCount + collections.orphanCount;

    return total > 0
      ? { state: "success", sourceLabel: provider.sourceLabel, ...collections }
      : {
          state: "empty",
          sourceLabel: provider.sourceLabel,
          ...collections,
          reason: "No actor-scoped relationship lifecycle task has a contact or connection target.",
        };
  } catch {
    return {
      state: "unavailable",
      sourceLabel: provider.sourceLabel,
      ...emptyCollections(),
      reason: "Relationship lifecycle records could not be read.",
    };
  }
}
