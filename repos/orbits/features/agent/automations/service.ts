import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { createAgentCapabilityRegistry } from "../capabilities/registry";
import {
  type AgentAutomation,
  AGENT_AUTOMATION_LEASE_TIMEOUT_MS,
  type AgentAutomationRecordPayload,
  type AgentAutomationService,
  type AgentAutomationSchedule,
  type CreateAgentAutomationInput,
  nextAgentAutomationRunAt,
  type UpdateAgentAutomationInput,
  validateAgentAutomationSchedule,
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
  return capability.id;
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
      .map((record) => record.payload.automation)
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
    return record.payload.automation;
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
      return record?.payload.automation ?? null;
    },
    async create(input: CreateAgentAutomationInput) {
      return serial(async () => {
        const createdAt = now();
        const schedule = scheduleFor(input.schedule);
        const nextRunAt = nextAgentAutomationRunAt(schedule, createdAt);
        if (!nextRunAt) {
          throw new Error("Automation schedule must have a future run time.");
        }
        const automation: AgentAutomation = {
          automationId: id(),
          capabilityId: requireAutomationCapability(input.capabilityId),
          title: text(input.title, "Automation title", 120),
          instruction: text(input.instruction, "Automation instruction", 4_000),
          schedule,
          delivery: requireDelivery(input.delivery),
          status: "active",
          nextRunAt,
          lastRun: null,
          runCount: 0,
          createdAt,
          updatedAt: createdAt,
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
        const schedule = input.schedule
          ? scheduleFor(input.schedule)
          : existing.schedule;
        const status = input.status ?? (
          existing.status === "completed" || existing.status === "failed"
            ? "active"
            : existing.status
        );
        const nextRunAt =
          status === "paused"
            ? null
            : nextAgentAutomationRunAt(schedule, updatedAt);
        if (status === "active" && !nextRunAt) {
          throw new Error("Automation schedule must have a future run time.");
        }
        return save({
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
          schedule,
          delivery:
            input.delivery === undefined
              ? existing.delivery
              : requireDelivery(input.delivery),
          status,
          nextRunAt,
          lease: undefined,
          updatedAt,
        });
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
              (automation.status === "active" &&
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
        const recurring = existing.schedule.kind !== "once";
        const resumeStatus = existing.lease?.resumeStatus ?? "active";
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
              : nextAgentAutomationRunAt(
                  existing.schedule,
                  input.completedAt,
                )
            : null,
          lastRun: {
            ...input.outcome,
            summary,
            completedAt: input.completedAt,
          },
          runCount: existing.runCount + 1,
          lease: undefined,
          updatedAt: input.completedAt,
        });
      });
    },
  };
}
