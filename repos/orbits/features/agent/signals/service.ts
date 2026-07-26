import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  AgentSignal,
  AgentSignalCandidate,
  AgentSignalChange,
  AgentSignalRecordPayload,
  AgentSignalService,
} from "./contract";

export const AGENT_SIGNAL_COLLECTION = "agentSignals" as const;

export interface StorageAgentSignalServiceOptions {
  actorId: string;
  collect: () => Promise<readonly AgentSignalCandidate[]>;
  now?: () => string;
  store: LiveRecordStoreLike<AgentSignalRecordPayload>;
  workspaceId: string;
}

function actorWorkspaceId(workspaceId: string, actorId: string): string {
  const normalized = actorId.trim();
  if (!normalized) {
    throw new Error("Authenticated actor is required for Agent signals.");
  }
  return `${workspaceId}:agent-actor:${normalized}`;
}

function safeSignalId(fingerprint: string): string {
  return `signal:${encodeURIComponent(fingerprint).slice(0, 160)}`;
}

function changesFor(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): readonly AgentSignalChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys)
    .sort()
    .flatMap((field) =>
      before[field] === after[field]
        ? []
        : [{ after: after[field], before: before[field], field }],
    );
}

function recordFor(
  workspaceId: string,
  signal: AgentSignal,
  material: Readonly<Record<string, string>>,
): LiveRecord<AgentSignalRecordPayload> {
  return {
    collectionName: AGENT_SIGNAL_COLLECTION,
    createdAt: signal.firstObservedAt,
    evidenceIds: signal.sources.flatMap((source) => source.evidenceIds),
    lifecycleState: "active",
    occurredAt: signal.occurredAt,
    payload: { kind: "signal", material, signal },
    recordId: signal.signalId,
    searchText: `${signal.type} ${signal.title} ${signal.summary}`,
    sourceId: signal.sources[0]?.sourceId ?? signal.fingerprint,
    sourceLabel: signal.sources[0]?.sourceLabel ?? "Orbit signal engine",
    sourceType: signal.sources[0]?.sourceType ?? "agent_action",
    targetId: signal.targetId,
    targetType: signal.targetType,
    updatedAt: signal.lastObservedAt,
    workspaceId,
  };
}

function activeStatusAt(signal: AgentSignal, current: string): AgentSignal {
  if (
    signal.status === "snoozed" &&
    signal.snoozedUntil &&
    signal.snoozedUntil <= current
  ) {
    return {
      ...signal,
      snoozedUntil: undefined,
      status: "new",
    };
  }
  return signal;
}

export function createStorageAgentSignalService({
  actorId,
  collect,
  now = () => new Date().toISOString(),
  store,
  workspaceId,
}: StorageAgentSignalServiceOptions): AgentSignalService {
  const scopedWorkspaceId = actorWorkspaceId(workspaceId, actorId);
  let mutationQueue: Promise<void> = Promise.resolve();

  async function serial<T>(operation: () => Promise<T>): Promise<T> {
    const previous = mutationQueue;
    let release: () => void = () => undefined;
    mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function records(): Promise<
    readonly LiveRecord<AgentSignalRecordPayload>[]
  > {
    return store.listRecords({
      collectionName: AGENT_SIGNAL_COLLECTION,
      workspaceId: scopedWorkspaceId,
    });
  }

  async function required(signalId: string) {
    const record = await store.getRecord({
      collectionName: AGENT_SIGNAL_COLLECTION,
      recordId: signalId.trim(),
      workspaceId: scopedWorkspaceId,
    });
    if (!record) throw new Error(`Agent signal ${signalId} was not found.`);
    return record;
  }

  return {
    async list(input = {}) {
      const current = now();
      return (await records())
        .map((record) => activeStatusAt(record.payload.signal, current))
        .filter(
          (signal) => input.includeResolved || signal.status !== "resolved",
        )
        .sort(
          (left, right) =>
            right.importance - left.importance ||
            right.lastMeaningfulChangeAt.localeCompare(
              left.lastMeaningfulChangeAt,
            ),
        )
        .slice(0, Math.max(1, Math.min(100, input.limit ?? 30)));
    },
    async refresh() {
      return serial(async () => {
        const refreshedAt = now();
        const candidates = await collect();
        const existingRecords = await records();
        const existingByFingerprint = new Map(
          existingRecords.map((record) => [
            record.payload.signal.fingerprint,
            record,
          ]),
        );
        const observedFingerprints = new Set<string>();
        let created = 0;
        let changed = 0;
        let resolved = 0;

        for (const candidate of candidates) {
          observedFingerprints.add(candidate.fingerprint);
          const existing = existingByFingerprint.get(candidate.fingerprint);
          if (!existing) {
            const signal: AgentSignal = {
              ...candidate,
              changes: [],
              firstObservedAt: refreshedAt,
              lastMeaningfulChangeAt: refreshedAt,
              lastObservedAt: refreshedAt,
              signalId: safeSignalId(candidate.fingerprint),
              status: "new",
            };
            await store.upsertRecord(
              recordFor(scopedWorkspaceId, signal, candidate.material),
            );
            created += 1;
            continue;
          }

          const previous = activeStatusAt(existing.payload.signal, refreshedAt);
          const materiallyChanged =
            previous.materialHash !== candidate.materialHash;
          const signal: AgentSignal = {
            ...previous,
            ...candidate,
            changes: materiallyChanged
              ? changesFor(existing.payload.material, candidate.material)
              : previous.changes,
            firstObservedAt: previous.firstObservedAt,
            lastMeaningfulChangeAt: materiallyChanged
              ? refreshedAt
              : previous.lastMeaningfulChangeAt,
            lastObservedAt: refreshedAt,
            signalId: previous.signalId,
            status: materiallyChanged ? "new" : previous.status,
            snoozedUntil: materiallyChanged
              ? undefined
              : previous.snoozedUntil,
            resolvedAt: undefined,
          };
          await store.upsertRecord(
            recordFor(scopedWorkspaceId, signal, candidate.material),
          );
          if (materiallyChanged) changed += 1;
        }

        for (const record of existingRecords) {
          const signal = record.payload.signal;
          if (
            observedFingerprints.has(signal.fingerprint) ||
            signal.status === "resolved"
          ) {
            continue;
          }
          const nextSignal: AgentSignal = {
            ...signal,
            lastObservedAt: refreshedAt,
            resolvedAt: refreshedAt,
            status: "resolved",
          };
          await store.upsertRecord(
            recordFor(
              scopedWorkspaceId,
              nextSignal,
              record.payload.material,
            ),
          );
          resolved += 1;
        }

        return {
          changed,
          created,
          observed: candidates.length,
          refreshedAt,
          resolved,
          signals: await this.list(),
        };
      });
    },
    async updateStatus(signalId, input) {
      return serial(async () => {
        const existing = await required(signalId);
        const updatedAt = now();
        if (input.status === "snoozed") {
          if (
            !input.snoozedUntil ||
            input.snoozedUntil <= updatedAt
          ) {
            throw new Error("A future snoozedUntil is required.");
          }
        }
        const signal: AgentSignal = {
          ...existing.payload.signal,
          lastObservedAt: updatedAt,
          snoozedUntil:
            input.status === "snoozed"
              ? input.snoozedUntil
              : undefined,
          status: input.status,
        };
        await store.upsertRecord(
          recordFor(
            scopedWorkspaceId,
            signal,
            existing.payload.material,
          ),
        );
        return signal;
      });
    },
  };
}
