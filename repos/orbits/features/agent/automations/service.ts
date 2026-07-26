import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { createAgentCapabilityRegistry } from "../capabilities/registry";
import {
  type AgentAutomation,
  type AgentAutomationRevision,
  AGENT_AUTOMATION_LEASE_TIMEOUT_MS,
  type AgentAutomationRecordPayload,
  type AgentAutomationService,
  type AgentAutomationSchedule,
  type AgentAutomationTrigger,
  type CreateAgentAutomationInput,
  nextAgentAutomationRunAt,
  type UpdateAgentAutomationInput,
  validateAgentAutomationSchedule,
  validateAgentAutomationTrigger,
} from "./contract";

export const AGENT_AUTOMATION_COLLECTION = "agentAutomations" as const;

export interface StorageAgentAutomationServiceOptions {
  actorId: string;
  store: LiveRecordStoreLike<AgentAutomationRecordPayload>;
  workspaceId: string;
  now?: () => string;
  id?: () => string;
  leaseId?: () => string;
}

function actorWorkspaceId(workspaceId: string, actorId: string): string {
  const normalizedActor = actorId.trim();
  if (!normalizedActor) {
    throw new Error("Authenticated actor is required for Agent automations.");
  }
  return `${workspaceId}:agent-actor:${normalizedActor}`;
}

function text(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function requireDelivery(value: string): "in_app" | "push" {
  if (value !== "in_app" && value !== "push") {
    throw new Error("Automation delivery must be in_app or push.");
  }
  return value;
}

const capabilityRegistry = createAgentCapabilityRegistry();

function requireAutomationCapability(capabilityId: string): string {
  const capability = capabilityRegistry.get(capabilityId.trim());
  if (!capability) {
    throw new Error(`Unknown Agent capability: ${capabilityId}`);
  }
  if (!capability.userConfigurableAutomation) {
    throw new Error(
      `Agent capability ${capability.id} does not allow user-configurable automation.`,
    );
  }
  if (capability.kind !== "read") {
    throw new Error(
      `Agent Playbook capability ${capability.id} must be read-only; any proposed write still requires an Action confirmation.`,
    );
  }
  return capability.id;
}

function triggerFor(input: AgentAutomationTrigger): AgentAutomationTrigger {
  validateAgentAutomationTrigger(input);
  if (input.kind === "schedule") {
    return { kind: "schedule", schedule: scheduleFor(input.schedule) };
  }
  return {
    kind: "signal",
    minimumImportance: input.minimumImportance,
    signalTypes: [...new Set(input.signalTypes)].sort(),
  };
}

function nextRunFor(
  trigger: AgentAutomationTrigger,
  after: string,
): string | null {
  return trigger.kind === "schedule"
    ? nextAgentAutomationRunAt(trigger.schedule, after)
    : null;
}

function revisionFor(input: {
  automation: Pick<
    AgentAutomation,
    | "capabilityId"
    | "delivery"
    | "instruction"
    | "title"
    | "trigger"
    | "version"
  >;
  changeNote: string;
  createdAt: string;
  source: AgentAutomationRevision["source"];
}): AgentAutomationRevision {
  return {
    capabilityId: input.automation.capabilityId,
    changeNote: input.changeNote,
    createdAt: input.createdAt,
    delivery: input.automation.delivery,
    instruction: input.automation.instruction,
    source: input.source,
    title: input.automation.title,
    trigger: input.automation.trigger,
    version: input.automation.version,
  };
}

function normalizeStoredAutomation(
  value: AgentAutomation,
): AgentAutomation {
  const legacy = value as AgentAutomation & {
    schedule?: AgentAutomationSchedule;
  };
  const trigger = legacy.trigger
    ? triggerFor(legacy.trigger)
    : legacy.schedule
      ? triggerFor({ kind: "schedule", schedule: legacy.schedule })
      : null;
  if (!trigger) {
    throw new Error(
      `Agent automation ${value.automationId} does not have a valid trigger.`,
    );
  }
  const version =
    Number.isInteger(value.version) && value.version > 0 ? value.version : 1;
  const normalized: AgentAutomation = {
    ...value,
    handledEventIds: Array.isArray(value.handledEventIds)
      ? value.handledEventIds.filter(
          (eventId): eventId is string => typeof eventId === "string",
        )
      : [],
    revisions: Array.isArray(value.revisions) ? value.revisions : [],
    trigger,
    version,
  };
  if (normalized.revisions.length > 0) return normalized;
  return {
    ...normalized,
    revisions: [
      revisionFor({
        automation: normalized,
        changeNote: "Imported existing automation as version 1.",
        createdAt: normalized.createdAt,
        source: "manual",
      }),
    ],
  };
}

function configurationChanged(
  existing: AgentAutomation,
  candidate: Pick<
    AgentAutomation,
    "capabilityId" | "delivery" | "instruction" | "title" | "trigger"
  >,
): boolean {
  return (
    existing.capabilityId !== candidate.capabilityId ||
    existing.delivery !== candidate.delivery ||
    existing.instruction !== candidate.instruction ||
    existing.title !== candidate.title ||
    JSON.stringify(existing.trigger) !== JSON.stringify(candidate.trigger)
  );
}

function recordFor(
  workspaceId: string,
  automation: AgentAutomation,
): LiveRecord<AgentAutomationRecordPayload> {
  return {
    workspaceId,
    collectionName: AGENT_AUTOMATION_COLLECTION,
    recordId: automation.automationId,
    sourceType: "manual",
    sourceId: automation.automationId,
    sourceLabel: "Orbit Agent automation",
    evidenceIds: [],
    lifecycleState: "active",
    searchText: [
      automation.title,
      automation.instruction,
      automation.capabilityId,
      automation.status,
      automation.trigger.kind,
    ].join(" "),
    payload: { automation },
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  };
}

function scheduleFor(
  input: AgentAutomationSchedule,
): AgentAutomationSchedule {
  validateAgentAutomationSchedule(input);
  if (input.kind !== "weekly") return { ...input };
  return {
    ...input,
    daysOfWeek: [...new Set(input.daysOfWeek)].sort((left, right) => left - right),
  };
}

function hasExpiredLease(
  automation: AgentAutomation,
  now: string,
): boolean {
  if (automation.status !== "running" || !automation.lease) return false;
  const claimedAt = Date.parse(automation.lease.claimedAt);
  const comparisonTime = Date.parse(now);
  return (
    Number.isFinite(claimedAt) &&
    Number.isFinite(comparisonTime) &&
    claimedAt + AGENT_AUTOMATION_LEASE_TIMEOUT_MS <= comparisonTime
  );
}

export function createStorageAgentAutomationService({
  actorId,
  store,
  workspaceId,
  now = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
  leaseId = () => crypto.randomUUID(),
}: StorageAgentAutomationServiceOptions): AgentAutomationService {
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

  async function listRecords(): Promise<AgentAutomation[]> {
    const records = await store.listRecords({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_AUTOMATION_COLLECTION,
    });
    return records
      .map((record) =>
        normalizeStoredAutomation(record.payload.automation),
      )
      .sort((left, right) => {
        if (!left.nextRunAt && !right.nextRunAt) {
          return right.updatedAt.localeCompare(left.updatedAt);
        }
        if (!left.nextRunAt) return 1;
        if (!right.nextRunAt) return -1;
        return left.nextRunAt.localeCompare(right.nextRunAt);
      });
  }

  async function getRequired(automationId: string): Promise<AgentAutomation> {
    const normalizedId = text(automationId, "Automation id", 240);
    const record = await store.getRecord({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_AUTOMATION_COLLECTION,
      recordId: normalizedId,
    });
    if (!record) {
      throw new Error(`Agent automation ${normalizedId} was not found.`);
    }
    return normalizeStoredAutomation(record.payload.automation);
  }

  async function save(automation: AgentAutomation): Promise<AgentAutomation> {
    await store.upsertRecord(recordFor(scopedWorkspaceId, automation));
    return automation;
  }

  return {
    list: listRecords,
    async get(automationId) {
      const normalizedId = automationId.trim();
      if (!normalizedId) return null;
      const record = await store.getRecord({
        workspaceId: scopedWorkspaceId,
        collectionName: AGENT_AUTOMATION_COLLECTION,
        recordId: normalizedId,
      });
      return record
        ? normalizeStoredAutomation(record.payload.automation)
        : null;
    },
    async create(input: CreateAgentAutomationInput) {
      return serial(async () => {
        const createdAt = now();
        const trigger = triggerFor(input.trigger);
        const nextRunAt = nextRunFor(trigger, createdAt);
        if (trigger.kind === "schedule" && !nextRunAt) {
          throw new Error("Automation schedule must have a future run time.");
        }
        const base: Omit<AgentAutomation, "revisions"> = {
          automationId: id(),
          capabilityId: requireAutomationCapability(input.capabilityId),
          title: text(input.title, "Automation title", 120),
          instruction: text(input.instruction, "Automation instruction", 4_000),
          trigger,
          delivery: requireDelivery(input.delivery),
          status: "active",
          nextRunAt,
          lastRun: null,
          runCount: 0,
          version: 1,
          handledEventIds: [],
          createdAt,
          updatedAt: createdAt,
        };
        const automation: AgentAutomation = {
          ...base,
          revisions: [
            revisionFor({
              automation: base,
              changeNote: "Initial Playbook version.",
              createdAt,
              source: input.source ?? "manual",
            }),
          ],
        };
        return save(automation);
      });
    },
    async update(automationId, input: UpdateAgentAutomationInput) {
      return serial(async () => {
        const existing = await getRequired(automationId);
        if (
          existing.status === "running" &&
          input.status === "paused"
        ) {
          throw new Error(
            "A running automation cannot be paused until its current run finishes.",
          );
        }
        const updatedAt = now();
        const trigger = input.trigger
          ? triggerFor(input.trigger)
          : existing.trigger;
        const status = input.status ?? (
          existing.status === "completed" || existing.status === "failed"
            ? "active"
            : existing.status
        );
        const nextRunAt =
          status === "paused"
            ? null
            : nextRunFor(trigger, updatedAt);
        if (
          status === "active" &&
          trigger.kind === "schedule" &&
          !nextRunAt
        ) {
          throw new Error("Automation schedule must have a future run time.");
        }
        const candidate = {
          ...existing,
          capabilityId:
            input.capabilityId === undefined
              ? existing.capabilityId
              : requireAutomationCapability(input.capabilityId),
          title:
            input.title === undefined
              ? existing.title
              : text(input.title, "Automation title", 120),
          instruction:
            input.instruction === undefined
              ? existing.instruction
              : text(
                  input.instruction,
                  "Automation instruction",
                  4_000,
                ),
          trigger,
          delivery:
            input.delivery === undefined
              ? existing.delivery
              : requireDelivery(input.delivery),
          status,
          nextRunAt,
          lease: undefined,
          updatedAt,
        };
        if (!configurationChanged(existing, candidate)) {
          return save(candidate);
        }
        const versioned: AgentAutomation = {
          ...candidate,
          version: existing.version + 1,
          revisions: [
            ...existing.revisions,
            revisionFor({
              automation: {
                ...candidate,
                version: existing.version + 1,
              },
              changeNote: text(
                input.changeNote ?? "Updated Playbook configuration.",
                "Playbook change note",
                240,
              ),
              createdAt: updatedAt,
              source: input.source ?? "manual",
            }),
          ].slice(-20),
        };
        return save(versioned);
      });
    },
    async remove(automationId) {
      await serial(async () => {
        const existing = await getRequired(automationId);
        if (existing.status === "running") {
          throw new Error(
            "A running automation cannot be deleted until its current run finishes.",
          );
        }
        await store.deleteRecord({
          workspaceId: scopedWorkspaceId,
          collectionName: AGENT_AUTOMATION_COLLECTION,
          recordId: existing.automationId,
          deletedAt: now(),
        });
      });
    },
    async claimDue(input) {
      return serial(async () => {
        const due = (await listRecords())
          .filter(
            (automation) =>
              (automation.trigger.kind === "schedule" &&
                automation.status === "active" &&
                Boolean(automation.nextRunAt) &&
                automation.nextRunAt! <= input.now) ||
              hasExpiredLease(automation, input.now),
          )
          .slice(0, Math.max(0, input.limit));
        const claimed: AgentAutomation[] = [];
        for (const automation of due) {
          claimed.push(
            await save({
              ...automation,
              status: "running",
              lease: {
                leaseId: leaseId(),
                workerId: text(input.workerId, "Worker id", 120),
                claimedAt: input.now,
                resumeStatus:
                  automation.lease?.resumeStatus ?? "active",
              },
              updatedAt: input.now,
            }),
          );
        }
        return claimed;
      });
    },
    async claim(input) {
      return serial(async () => {
        const existing = await getRequired(input.automationId);
        if (existing.status === "running") {
          throw new Error(
            `Agent automation ${existing.automationId} is already running.`,
          );
        }
        if (
          existing.status === "completed" ||
          existing.status === "failed"
        ) {
          throw new Error(
            `Agent automation ${existing.automationId} is no longer active.`,
          );
        }
        return save({
          ...existing,
          status: "running",
          lease: {
            leaseId: leaseId(),
            workerId: text(input.workerId, "Worker id", 120),
            claimedAt: input.claimedAt,
            resumeStatus: existing.status,
          },
          updatedAt: input.claimedAt,
        });
      });
    },
    async claimForSignal(input) {
      return serial(async () => {
        const batchId = text(input.batchId, "Trigger batch id", 240);
        const eventIds = [
          ...new Set(
            input.eventIds.map((eventId) =>
              text(eventId, "Trigger event id", 240),
            ),
          ),
        ].slice(0, 50);
        if (eventIds.length === 0) {
          throw new Error(
            "At least one trigger event id is required.",
          );
        }
        const matching = (await listRecords())
          .filter(
            (automation) =>
              automation.status === "active" &&
              automation.trigger.kind === "signal" &&
              automation.trigger.signalTypes.includes(input.signalType) &&
              input.importance >= automation.trigger.minimumImportance &&
              eventIds.some(
                (eventId) =>
                  !automation.handledEventIds.includes(eventId),
              ),
          )
          .slice(0, Math.max(0, input.limit));
        const claimed: AgentAutomation[] = [];
        for (const automation of matching) {
          claimed.push(
            await save({
              ...automation,
              lease: {
                claimedAt: input.claimedAt,
                leaseId: leaseId(),
                resumeStatus: "active",
                triggerEventId: batchId,
                triggerEventIds: eventIds,
                workerId: text(input.workerId, "Worker id", 120),
              },
              status: "running",
              updatedAt: input.claimedAt,
            }),
          );
        }
        return claimed;
      });
    },
    async recordRun(input) {
      return serial(async () => {
        const existing = await getRequired(input.automationId);
        if (existing.status !== "running") {
          throw new Error(
            `Agent automation ${existing.automationId} is not running.`,
          );
        }
        if (
          !existing.lease ||
          existing.lease.leaseId !== input.leaseId
        ) {
          throw new Error(
            `Agent automation ${existing.automationId} lease is no longer owned by this run.`,
          );
        }
        const summary = text(input.outcome.summary, "Run summary", 4_000);
        const recurring =
          existing.trigger.kind === "signal" ||
          existing.trigger.schedule.kind !== "once";
        const resumeStatus = existing.lease?.resumeStatus ?? "active";
        const triggerEventId = existing.lease?.triggerEventId;
        const triggerEventIds =
          existing.lease?.triggerEventIds ??
          (triggerEventId ? [triggerEventId] : []);
        return save({
          ...existing,
          status: recurring
            ? resumeStatus
            : input.outcome.status === "success"
              ? "completed"
              : "failed",
          nextRunAt: recurring
            ? resumeStatus === "paused"
              ? null
              : nextRunFor(existing.trigger, input.completedAt)
            : null,
          lastRun: {
            ...input.outcome,
            summary,
            completedAt: input.completedAt,
            triggerEventId,
          },
          handledEventIds: [
            ...new Set([
              ...existing.handledEventIds,
              ...triggerEventIds,
            ]),
          ].slice(-50),
          runCount: existing.runCount + 1,
          lease: undefined,
          updatedAt: input.completedAt,
        });
      });
    },
  };
}
