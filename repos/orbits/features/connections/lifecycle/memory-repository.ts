import {
  RelationshipLifecycleError,
  type RelationshipConnectionAggregate,
  type RelationshipLifecycleAudit,
  type RelationshipLifecycleMutationPlan,
  type RelationshipLifecycleSnapshot,
  type RelationshipLifecycleTask,
} from "./contract";
import {
  applyLifecycleMutationPlan,
  validateLifecycleMutationInput,
  type RelationshipLifecycleMutationInput,
  type RelationshipLifecycleMutationResult,
  type RelationshipLifecycleRepository,
} from "./repository";

interface MemoryLifecycleSeed {
  connections: RelationshipConnectionAggregate[];
  contacts: { actorId: string; contactId: string }[];
  tasks?: RelationshipLifecycleTask[];
}

interface MemoryReceipt {
  requestHash: string;
  command: RelationshipLifecycleMutationInput["command"];
  connectionId: string;
  snapshot: RelationshipLifecycleSnapshot;
}

function key(actorId: string, id: string): string {
  if (!actorId || !id || actorId.includes("\0") || id.includes("\0")) {
    throw new RelationshipLifecycleError("INVALID_TRANSITION", "Invalid actor-scoped identity.");
  }
  return `${actorId}\0${id}`;
}

export class MemoryRelationshipLifecycleRepository implements RelationshipLifecycleRepository {
  private mutationInProgress = false;
  private state: {
    connections: Map<string, RelationshipConnectionAggregate>;
    contacts: Set<string>;
    tasks: Map<string, RelationshipLifecycleTask>;
    audits: Map<string, RelationshipLifecycleAudit>;
    receipts: Map<string, MemoryReceipt>;
  };

  constructor(seed: MemoryLifecycleSeed) {
    const copy = structuredClone(seed);
    this.state = {
      connections: new Map(copy.connections.map((connection) => [key(connection.actorId, connection.connectionId), connection])),
      contacts: new Set(copy.contacts.map((contact) => key(contact.actorId, contact.contactId))),
      tasks: new Map((copy.tasks ?? []).map((task) => [key(task.actorId, task.taskId), task])),
      audits: new Map<string, RelationshipLifecycleAudit>(),
      receipts: new Map<string, MemoryReceipt>(),
    };
  }

  private snapshot(actorId: string, connectionId: string): RelationshipLifecycleSnapshot | null {
    const connection = this.state.connections.get(key(actorId, connectionId));
    if (!connection) return null;
    if (!this.state.contacts.has(key(actorId, connection.contactId))) {
      throw new RelationshipLifecycleError("FORBIDDEN", "Referenced contact is not owned by the actor.");
    }
    const tasks = [...this.state.tasks.values()].filter((task) => task.actorId === actorId && task.connectionId === connectionId);
    if (tasks.some((task) => task.contactId !== connection.contactId)) {
      throw new RelationshipLifecycleError("FORBIDDEN", "Task contact does not match the connection.");
    }
    return structuredClone({ connection, tasks });
  }

  async read(actorId: string, connectionId: string): Promise<RelationshipLifecycleSnapshot | null> {
    return this.snapshot(actorId, connectionId);
  }

  async mutate(
    input: RelationshipLifecycleMutationInput,
    operation: (snapshot: RelationshipLifecycleSnapshot) => RelationshipLifecycleMutationPlan,
  ): Promise<RelationshipLifecycleMutationResult> {
    // Keep the validated primitive fields independent of caller-owned state.
    input = { ...input };
    if (this.mutationInProgress) throw new RelationshipLifecycleError("CONFLICT", "A lifecycle mutation is already in progress.");
    this.mutationInProgress = true;
    try {
      validateLifecycleMutationInput(input);
      const receiptKey = key(input.actorId, input.idempotencyKey);
      const receipt = this.state.receipts.get(receiptKey);
      if (receipt) {
        if (receipt.requestHash !== input.requestHash || receipt.command !== input.command || receipt.connectionId !== input.connectionId) {
          throw new RelationshipLifecycleError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another command.");
        }
        return { snapshot: structuredClone(receipt.snapshot), replayed: true };
      }
      const before = this.snapshot(input.actorId, input.connectionId);
      if (!before) throw new RelationshipLifecycleError("NOT_FOUND", "Connection not found.");
      if (before.connection.version !== input.expectedVersion) throw new RelationshipLifecycleError("CONFLICT", "Connection version has changed.");
      const plan = operation(structuredClone(before));
      const snapshot = applyLifecycleMutationPlan(input, before, plan);
      const connections = new Map(this.state.connections);
      const tasks = new Map(this.state.tasks);
      const audits = new Map(this.state.audits);
      const receipts = new Map(this.state.receipts);
      for (const task of [...plan.upsertTasks, ...plan.dismissTasks]) {
        const taskKey = key(input.actorId, task.taskId);
        const existing = tasks.get(taskKey);
        if (existing && existing.connectionId !== input.connectionId) throw new RelationshipLifecycleError("INVALID_TASK", "Task identifier belongs to another connection.");
        tasks.set(taskKey, structuredClone(task));
      }
      const auditKey = key(input.actorId, plan.audit.auditId);
      if (audits.has(auditKey)) throw new RelationshipLifecycleError("CONFLICT", "Audit identifier already exists.");
      connections.set(key(input.actorId, input.connectionId), structuredClone(snapshot.connection));
      audits.set(auditKey, structuredClone(plan.audit));
      receipts.set(receiptKey, { requestHash: input.requestHash, command: input.command, connectionId: input.connectionId, snapshot: structuredClone(snapshot) });
      // The operation is synchronous: no observer can see a partial state swap.
      this.state = { ...this.state, connections, tasks, audits, receipts };
      return { snapshot, replayed: false };
    } finally {
      this.mutationInProgress = false;
    }
  }

  audits(actorId: string): RelationshipLifecycleAudit[] {
    return structuredClone([...this.state.audits.values()].filter((audit) => audit.actorId === actorId));
  }

  tasksForActor(actorId: string): RelationshipLifecycleTask[] {
    return structuredClone([...this.state.tasks.values()].filter((task) => task.actorId === actorId));
  }
}

export function createMemoryRelationshipLifecycleRepository(seed: MemoryLifecycleSeed): MemoryRelationshipLifecycleRepository {
  return new MemoryRelationshipLifecycleRepository(seed);
}
