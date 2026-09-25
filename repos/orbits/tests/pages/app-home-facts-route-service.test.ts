import assert from "node:assert/strict";
import test from "node:test";

import type { AppointmentAggregate } from "../../features/appointments/contract";
import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import type { TaskItemDTO } from "../../features/tasks/contract";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { RelationshipLifecycleTaskReadModel } from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import {
  loadHomeFacts,
  type HomeFactsRouteDependencies,
  type HomeFactsSourceKey,
} from "../../app/(app)/app/agent/home-facts-route-service";

const ACTOR = "actor:home-facts";
const OTHER_ACTOR = "actor:other";
const SNAPSHOT = "2026-09-17T00:00:00.000Z";
const PRODUCT_FROM = "2026-09-16T15:00:00.000Z";
const PRODUCT_TO = "2026-09-23T15:00:00.000Z";
const WORKSPACE = "workspace:home-facts";

function taskServiceFixture() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createTaskService({
    repository: createTaskRepository({ store, workspaceId: WORKSPACE }),
  });
  return { service, store };
}

async function addTask(
  service: ReturnType<typeof createTaskService>,
  input: {
    idempotencyKey: string;
    title: string;
    plannedDate?: string;
    dueAt?: string;
  },
) {
  return service.create({
    actorId: ACTOR,
    category: "work",
    idempotencyKey: input.idempotencyKey,
    now: "2026-09-16T12:00:00.000Z",
    priority: "normal",
    title: input.title,
    ...(input.plannedDate ? { plannedDate: input.plannedDate } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
  });
}

function followupTask(
  overrides: Partial<NonNullable<RelationshipLifecycleTaskReadModel>["currentTasks"][number]> & {
    id: string;
  },
) {
  return {
    contactId: "contact:home-facts",
    contactName: "Home Contact",
    connectionId: "connection:home-facts",
    dueAt: "2026-09-18T01:00:00.000Z",
    id: overrides.id,
    operationHref: "/app/contacts/contact%3Ahome-facts",
    organization: "Orbit Labs",
    relationshipStage: "active" as const,
    status: "open" as const,
    title: "跟进联系人",
    updatedAt: "2026-09-16T12:00:00.000Z",
    ...overrides,
  };
}

function followupSuccess(
  currentTasks: readonly ReturnType<typeof followupTask>[],
  historyTasks: readonly ReturnType<typeof followupTask>[] = [],
  orphanTasks: readonly ReturnType<typeof followupTask>[] = [],
): RelationshipLifecycleTaskReadModel {
  return {
    currentCount: currentTasks.length,
    currentTasks,
    historyCount: historyTasks.length,
    historyTasks,
    orphanCount: orphanTasks.length,
    orphanTasks,
    sourceLabel: "Memory relationship lifecycle",
    state: "success",
  };
}

const authorityVerifier = {
  async resolveAcceptedBilateralContact(input: {
    actorId: string;
    authorityReference: string;
    eventId: string | null;
  }) {
    if (input.actorId !== ACTOR || input.authorityReference !== "authority:home-facts") {
      return null;
    }
    return {
      authorityRequestId: "authority:home-facts",
      contactIdsByActor: {
        [ACTOR]: "contact:counterparty-for-home-facts",
        [OTHER_ACTOR]: "contact:home-facts",
      },
      counterpartyActorId: OTHER_ACTOR,
      relationshipPairId: `relationship:${input.eventId ?? "none"}`,
    };
  },
};

async function createConfirmedAppointment(
  service: ReturnType<typeof createAppointmentService>,
  input: {
    appointmentId: string;
    eventId: string;
    startsAtUtc: string;
    medium: "in_person" | "phone";
    durationMinutes?: number;
  },
) {
  const draft = await service.createDraft({
    actorId: ACTOR,
    appointmentId: input.appointmentId,
    authorityReference: "authority:home-facts",
    eventId: input.eventId,
    idempotencyKey: `create:${input.appointmentId}`,
  });
  const proposed = await service.command({
    actorId: ACTOR,
    appointmentId: draft.appointment.appointmentId,
    command: "propose",
    expectedVersion: draft.appointment.version,
    idempotencyKey: `propose:${input.appointmentId}`,
    proposal: {
      candidateTimes: [
        { candidateId: "slot:home-facts", startsAtUtc: input.startsAtUtc },
        { candidateId: "slot:home-facts-2", startsAtUtc: "2026-10-01T01:00:00.000Z" },
        { candidateId: "slot:home-facts-3", startsAtUtc: "2026-10-02T01:00:00.000Z" },
      ],
      durationMinutes: input.durationMinutes ?? 30,
      medium:
        input.medium === "in_person"
          ? { kind: "in_person", location: "丸の内" }
          : { kind: "phone", phoneHint: null },
      timezone: "Asia/Tokyo",
    },
  });
  const accepted = await service.command({
    actorId: OTHER_ACTOR,
    appointmentId: draft.appointment.appointmentId,
    candidateId: "slot:home-facts",
    command: "accept",
    expectedVersion: proposed.appointment.version,
    idempotencyKey: `accept:${input.appointmentId}`,
  });
  return accepted.appointment;
}

function appointmentServiceFixture() {
  let now = "2026-09-16T15:00:00.000Z";
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({
    authorityVerifier,
    now: () => now,
    repository,
  });
  return {
    get now() {
      return now;
    },
    repository,
    service,
    setNow(value: string) {
      now = value;
    },
  };
}

function baseDependencies(
  overrides: Partial<HomeFactsRouteDependencies> = {},
): HomeFactsRouteDependencies {
  return {
    appointmentService: {
      async list() {
        return [];
      },
    },
    personalScheduleService: {
      async list() {
        return [];
      },
    },
    taskService: {
      async list() {
        return [];
      },
    },
    followupLoader: async () => followupSuccess([]),
    ...overrides,
  };
}

function appointmentRecord(input: {
  appointmentId: string;
  durationMinutes: number;
  medium: "in_person" | "video" | "phone";
  ownerActorId?: string;
  inviteeActorId?: string;
  startsAtUtc: string;
  status?: "confirmed" | "reschedule_pending";
}): AppointmentAggregate {
  const medium =
    input.medium === "in_person"
      ? { kind: "in_person" as const, location: "丸の内" }
      : input.medium === "video"
        ? { kind: "video" as const, provider: "other" as const, joinUrl: null }
        : { kind: "phone" as const, phoneHint: null };
  const ownerActorId = input.ownerActorId ?? ACTOR;
  const inviteeActorId = input.inviteeActorId ?? OTHER_ACTOR;
  return {
    appointmentId: input.appointmentId,
    authorityRequestId: "authority:home-facts",
    contactIdsByActor: {
      [ownerActorId]: "contact:appointment-owner",
      [inviteeActorId]: "contact:appointment-invitee",
    },
    createdAt: "2026-09-16T00:00:00.000Z",
    createdByActorId: ownerActorId,
    eventId: null,
    history: [],
    inviteeActorId,
    ownerActorId,
    pendingProposalRevision: input.status === "reschedule_pending" ? 2 : null,
    proposals: [],
    confirmed: {
      candidateId: "candidate:home-facts",
      confirmedAt: "2026-09-16T00:00:00.000Z",
      confirmedByActorId: inviteeActorId,
      durationMinutes: input.durationMinutes,
      medium,
      proposalRevision: 1,
      startsAtUtc: input.startsAtUtc,
      timezone: "Asia/Tokyo",
    },
    projection: {
      calendar: "not_synced",
      meeting: "not_synced",
      revision: null,
    },
    relationshipPairId: "relationship:home-facts",
    reminders: { cancelled: false, currentRevision: null },
    status: input.status ?? "confirmed",
    updatedAt: "2026-09-16T00:00:00.000Z",
    version: 1,
  };
}

test("home facts builds a product-zone seven-calendar-day half-open window", async () => {
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: "2026-12-31T15:00:00.000Z",
    dependencies: baseDependencies(),
  });

  assert.deepEqual(model.window, {
    coverage: "starts-in-window",
    from: "2026-12-31T15:00:00.000Z",
    productDate: "2027-01-01",
    timeZone: "Asia/Tokyo",
    to: "2027-01-07T15:00:00.000Z",
  });
});

test("rejects offsetless snapshot and quarantines offsetless source instants", async () => {
  await assert.rejects(
    loadHomeFacts({
      actorId: ACTOR,
      snapshotAt: "2026-09-17T00:00:00",
      dependencies: baseDependencies(),
    }),
    /snapshotAt/,
  );

  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: {
      taskService: {
        async list() {
          return [{
            accountId: ACTOR,
            dueAt: "2026-09-18T01:00:00",
            id: "task:offsetless",
            ownerUserId: ACTOR,
            status: "open",
            title: "bad task",
          }] as never;
        },
      },
      followupLoader: async () => followupSuccess([
        followupTask({ id: "followup:offsetless", dueAt: "2026-09-18T01:00:00" }),
      ]),
      personalScheduleService: {
        async list() {
          return [{
            accountId: ACTOR,
            id: "personal:offsetless",
            ownerUserId: ACTOR,
            startsAt: "2026-09-18T01:00:00",
            state: "upcoming",
            title: "bad personal",
          }] as never;
        },
      },
      appointmentService: {
        async list() {
          return [appointmentRecord({
            appointmentId: "appointment:offsetless",
            durationMinutes: 30,
            medium: "phone",
            startsAtUtc: "2026-09-18T01:00:00",
          })];
        },
      },
    },
  });

  for (const source of [model.tasks, model.followups, model.personal, model.appointments]) {
    assert.equal(source.state, "unavailable");
    assert.equal(source.count, null);
  }
});

test("normalizes equivalent offset instants before grouping and stable sorting", async () => {
  const task = (id: string, dueAt: string) => ({
    accountId: ACTOR,
    dueAt,
    id,
    ownerUserId: ACTOR,
    status: "open" as const,
    title: id,
  });
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: "2026-09-16T15:30:00.000Z",
    dependencies: baseDependencies({
      taskService: {
        async list() {
          return [
            task("z", "2026-09-16T16:00:00.000Z"),
            task("a", "2026-09-17T01:00:00+09:00"),
          ] as never;
        },
      },
      followupLoader: async () => followupSuccess([
        followupTask({ id: "z", dueAt: "2026-09-16T16:00:00.000Z" }),
        followupTask({ id: "a", dueAt: "2026-09-17T01:00:00+09:00" }),
      ]),
    }),
  });

  assert.deepEqual(model.tasks.items.map((item) => item.id), ["a", "z"]);
  assert.deepEqual(model.tasks.items.map((item) => item.dueAt), [
    "2026-09-16T16:00:00.000Z",
    "2026-09-16T16:00:00.000Z",
  ]);
  assert.deepEqual(model.followups.items.map((item) => item.id), ["a", "z"]);
  assert.deepEqual(model.followups.items.map((item) => item.dueAt), [
    "2026-09-16T16:00:00.000Z",
    "2026-09-16T16:00:00.000Z",
  ]);
  assert.equal(model.tasks.groups.find((group) => group.key === "recent")?.count, 2);
  assert.equal(model.followups.groups.find((group) => group.key === "recent")?.count, 2);
});

test("missing actor fails every source without constructing or calling a reader", async () => {
  let calls = 0;
  const throwing = () => {
    calls += 1;
    throw new Error("reader must not run");
  };
  const model = await loadHomeFacts({
    actorId: "   ",
    snapshotAt: SNAPSHOT,
    dependencies: {
      appointmentServiceFactory: throwing,
      personalScheduleServiceFactory: throwing,
      taskServiceFactory: throwing,
      followupLoader: throwing as never,
    },
  });

  assert.equal(calls, 0);
  for (const source of [model.tasks, model.followups, model.personal, model.appointments]) {
    assert.equal(source.state, "unavailable");
    assert.equal(source.count, null);
    assert.deepEqual(source.items, []);
  }
});

test("trims actor once and passes the canonical actor to every reader", async () => {
  const calls: string[] = [];
  const model = await loadHomeFacts({
    actorId: ` ${ACTOR} `,
    snapshotAt: SNAPSHOT,
    dependencies: {
      taskService: {
        async list({ actorId }) {
          calls.push(`tasks:${actorId}`);
          return [];
        },
      },
      followupLoader: async ({ actorId }) => {
        calls.push(`followups:${actorId}`);
        return followupSuccess([]);
      },
      personalScheduleService: {
        async list({ actorId }) {
          calls.push(`personal:${actorId}`);
          return [];
        },
      },
      appointmentService: {
        async list({ actorId }) {
          calls.push(`appointments:${actorId}`);
          return [];
        },
      },
    },
  });

  assert.equal(model.snapshotAt, SNAPSHOT);
  assert.deepEqual(calls.sort(), [
    `appointments:${ACTOR}`,
    `followups:${ACTOR}`,
    `personal:${ACTOR}`,
    `tasks:${ACTOR}`,
  ]);
});

test("each source isolates factory and read failures while preserving real empty and successful peers", async () => {
  const task = taskServiceFixture();
  const created = await addTask(task.service, {
    dueAt: "2026-09-18T01:00:00.000Z",
    idempotencyKey: "successful-task",
    title: "成功任务",
  });
  const cases: Array<{
    name: string;
    dependencies: HomeFactsRouteDependencies;
    expected: HomeFactsSourceKey;
  }> = [
    {
      name: "task factory throw",
      dependencies: baseDependencies({
        taskService: undefined,
        taskServiceFactory: () => {
          throw new Error("task factory failed");
        },
        followupLoader: async () => followupSuccess([followupTask({ id: "shared:id" })]),
      }),
      expected: "tasks",
    },
    {
      name: "followup read reject",
      dependencies: baseDependencies({
        taskService: task.service,
        followupLoader: async () => {
          throw new Error("followup read failed");
        },
      }),
      expected: "followups",
    },
    {
      name: "personal read reject",
      dependencies: baseDependencies({
        taskService: task.service,
        followupLoader: async () => followupSuccess([followupTask({ id: "personal-peer" })]),
        personalScheduleService: {
          async list() {
            throw new Error("personal read failed");
          },
        },
      }),
      expected: "personal",
    },
    {
      name: "appointment factory throw",
      dependencies: baseDependencies({
        taskService: task.service,
        followupLoader: async () => followupSuccess([followupTask({ id: "appointment-peer" })]),
        appointmentService: undefined,
        appointmentServiceFactory: () => {
          throw new Error("appointment factory failed");
        },
      }),
      expected: "appointments",
    },
  ];

  for (const current of cases) {
    const model = await loadHomeFacts({
      actorId: ACTOR,
      snapshotAt: SNAPSHOT,
      dependencies: current.dependencies,
    });
    const failed = model[current.expected] as { count: number | null; state: string };
    assert.equal(failed.state, "unavailable", current.name);
    assert.equal(failed.count, null, current.name);
    assert.equal(model.tasks.count, current.expected === "tasks" ? null : 1, current.name);
    assert.equal(model.followups.count, current.expected === "followups" ? null : 1, current.name);
    assert.equal(model.personal.count, current.expected === "personal" ? null : 0, current.name);
    assert.equal(model.appointments.count, current.expected === "appointments" ? null : 0, current.name);
    assert.equal(model.tasks.items.length, current.expected === "tasks" ? 0 : 1, current.name);
    assert.equal(created.task.ownerUserId, ACTOR);
  }

  const empty = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies(),
  });
  assert.equal(empty.tasks.state, "empty");
  assert.equal(empty.tasks.count, 0);
  assert.equal(empty.tasks.items.length, 0);
});

test("every source maps construction errors, read rejects, and true empty independently", async () => {
  const factoryFailures: Array<{
    key: HomeFactsSourceKey;
    dependencies: HomeFactsRouteDependencies;
  }> = [
    {
      key: "tasks",
      dependencies: baseDependencies({
        taskService: undefined,
        taskServiceFactory: () => {
          throw new Error("tasks factory failed");
        },
      }),
    },
    {
      key: "followups",
      dependencies: baseDependencies({
        followupLoader: () => {
          throw new Error("followups loader failed");
        },
      }),
    },
    {
      key: "personal",
      dependencies: baseDependencies({
        personalScheduleService: undefined,
        personalScheduleServiceFactory: () => {
          throw new Error("personal factory failed");
        },
      }),
    },
    {
      key: "appointments",
      dependencies: baseDependencies({
        appointmentService: undefined,
        appointmentServiceFactory: () => {
          throw new Error("appointments factory failed");
        },
      }),
    },
  ];
  for (const current of factoryFailures) {
    const model = await loadHomeFacts({
      actorId: ACTOR,
      snapshotAt: SNAPSHOT,
      dependencies: current.dependencies,
    });
    const source = model[current.key];
    assert.equal(source.state, "unavailable", current.key);
    assert.equal(source.count, null, current.key);
  }

  const readFailures: Array<{
    key: HomeFactsSourceKey;
    dependencies: HomeFactsRouteDependencies;
  }> = [
    {
      key: "tasks",
      dependencies: baseDependencies({
        taskService: {
          async list() {
            throw new Error("tasks read failed");
          },
        },
      }),
    },
    {
      key: "followups",
      dependencies: baseDependencies({
        followupLoader: async () => {
          throw new Error("followups read failed");
        },
      }),
    },
    {
      key: "personal",
      dependencies: baseDependencies({
        personalScheduleService: {
          async list() {
            throw new Error("personal read failed");
          },
        },
      }),
    },
    {
      key: "appointments",
      dependencies: baseDependencies({
        appointmentService: {
          async list() {
            throw new Error("appointments read failed");
          },
        },
      }),
    },
  ];
  for (const current of readFailures) {
    const model = await loadHomeFacts({
      actorId: ACTOR,
      snapshotAt: SNAPSHOT,
      dependencies: current.dependencies,
    });
    const source = model[current.key];
    assert.equal(source.state, "unavailable", current.key);
    assert.equal(source.count, null, current.key);
  }

  const emptySources: Array<{
    key: HomeFactsSourceKey;
    dependencies: HomeFactsRouteDependencies;
  }> = [
    {
      key: "tasks",
      dependencies: baseDependencies({ taskService: { async list() { return []; } } }),
    },
    {
      key: "followups",
      dependencies: baseDependencies({ followupLoader: async () => followupSuccess([]) }),
    },
    {
      key: "personal",
      dependencies: baseDependencies({ personalScheduleService: { async list() { return []; } } }),
    },
    {
      key: "appointments",
      dependencies: baseDependencies({ appointmentService: { async list() { return []; } } }),
    },
  ];
  for (const current of emptySources) {
    const model = await loadHomeFacts({
      actorId: ACTOR,
      snapshotAt: SNAPSHOT,
      dependencies: current.dependencies,
    });
    const source = model[current.key];
    assert.equal(source.state, "empty", current.key);
    assert.equal(source.count, 0, current.key);
    assert.deepEqual(source.items, [], current.key);
  }
});

test("tasks classify dual dates without manufacturing a deadline and cap only displayed rows", async () => {
  const fixture = taskServiceFixture();
  await addTask(fixture.service, {
    dueAt: "2026-09-16T14:00:00.000Z",
    idempotencyKey: "overdue",
    plannedDate: "2026-09-18",
    title: "真正逾期",
  });
  await addTask(fixture.service, {
    idempotencyKey: "plan-past",
    plannedDate: "2026-09-16",
    title: "纯日期已过",
  });
  await addTask(fixture.service, {
    dueAt: "2026-09-19T01:00:00.000Z",
    idempotencyKey: "recent-due",
    title: "窗口内截止",
  });
  await addTask(fixture.service, {
    idempotencyKey: "recent-plan",
    plannedDate: "2026-09-20",
    title: "窗口内计划",
  });
  await addTask(fixture.service, {
    idempotencyKey: "undated",
    title: "未排期",
  });
  await addTask(fixture.service, {
    dueAt: "2026-10-20T01:00:00.000Z",
    idempotencyKey: "far-future",
    title: "窗外未来",
  });

  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({ taskService: fixture.service }),
  });

  assert.equal(model.tasks.count, 5);
  assert.equal(model.tasks.items.length, 3);
  assert.deepEqual(
    model.tasks.groups.map((group) => [group.key, group.count]),
    [
      ["overdue", 1],
      ["plan-past", 1],
      ["recent", 2],
      ["undated", 1],
    ],
  );
  assert.deepEqual(
    model.tasks.items.map((item) => item.title),
    ["真正逾期", "纯日期已过", "窗口内截止"],
  );
  const planPast = model.tasks.items.find((item) => item.title === "纯日期已过")!;
  assert.equal(planPast.dueAt, undefined);
  assert.equal(planPast.plannedDate, "2026-09-16");
  assert.equal(model.tasks.groups.find((group) => group.key === "undated")?.items.length, 0);
});

test("bounded task summary preserves exact group counts and one global three-row cap", async () => {
  let readInput: { actorId: string; window: unknown } | undefined;
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      taskService: undefined,
      taskSummaryReader: {
        async read(actorId, window) {
          readInput = { actorId, window };
          return {
            count: 5,
            groupCounts: { overdue: 1, "plan-past": 1, recent: 2, undated: 1 },
            items: [
              { group: "overdue", id: "task:late", title: "逾期", dueAt: "2026-09-16T14:00:00.000Z" },
              { group: "plan-past", id: "task:past", title: "计划已过", plannedDate: "2026-09-16" },
              { group: "recent", id: "task:soon", title: "即将到期", dueAt: "2026-09-19T01:00:00.000Z" },
            ],
          };
        },
      },
    }),
  });

  assert.equal(readInput?.actorId, ACTOR);
  assert.deepEqual(readInput?.window, {
    productDate: "2026-09-17",
    snapshotAt: SNAPSHOT,
    timeZone: "Asia/Tokyo",
    toDate: "2026-09-24",
  });
  assert.equal(model.tasks.state, "ready");
  assert.equal(model.tasks.count, 5);
  assert.equal(model.tasks.items.length, 3);
  assert.deepEqual(
    model.tasks.groups.map((group) => [group.key, group.count, group.items.length, group.viewHref]),
    [
      ["overdue", 1, 1, "/app/tasks"],
      ["plan-past", 1, 1, "/app/tasks"],
      ["recent", 2, 1, "/app/tasks"],
      ["undated", 1, 0, "/app/tasks"],
    ],
  );
  assert.deepEqual(model.tasks.items.map((item) => item.key), [
    "tasks:task:late",
    "tasks:task:past",
    "tasks:task:soon",
  ]);
});

test("Home task identity ties use UTF-8 byte order, independent of locale collation", async () => {
  const ids = ["é", "e\u0301", "中", "10", "2", "A", "a", "!"];
  const tasks = ids.map((id) => ({
    accountId: ACTOR,
    category: "work",
    createdAt: SNAPSHOT,
    id,
    ownerUserId: ACTOR,
    priority: "normal",
    source: "manual",
    status: "open",
    title: `Task ${id}`,
    updatedAt: SNAPSHOT,
  } as TaskItemDTO));
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({ taskService: { async list() { return tasks; } } }),
  });
  const expected = ids
    .sort((left, right) => Buffer.compare(
      Buffer.from(`tasks:${left}`, "utf8"),
      Buffer.from(`tasks:${right}`, "utf8"),
    ))
    .slice(0, 3);

  assert.equal(model.tasks.count, ids.length);
  assert.deepEqual(model.tasks.items.map((item) => item.id), expected);
  assert.deepEqual(model.tasks.items.map((item) => item.key), expected.map((id) => `tasks:${id}`));
});

test("bounded task summary errors remain unavailable rather than becoming empty", async () => {
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      taskService: undefined,
      taskSummaryReader: { async read() { throw new Error("summary read failed"); } },
    }),
  });

  assert.equal(model.tasks.state, "unavailable");
  assert.equal(model.tasks.count, null);
  assert.deepEqual(model.tasks.items, []);
});

test("followups preserve current, history, and orphan collections with real operation links", async () => {
  const current = followupTask({ id: "current:1" });
  const history = followupTask({
    id: "history:1",
    status: "completed",
    title: "已完成跟进",
  });
  const orphan = followupTask({
    contactId: null,
    connectionId: "connection:missing",
    dueAt: undefined,
    id: "orphan:1",
    issue: "联系人未在关系数据中找到。",
    operationHref: null,
    title: "失联跟进",
  });
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      followupLoader: async () => followupSuccess([current], [history], [orphan]),
    }),
  });

  assert.equal(model.followups.state, "ready");
  assert.equal(model.followups.count, 1);
  assert.equal(model.followups.current.count, 1);
  assert.equal(model.followups.history.count, 1);
  assert.equal(model.followups.orphan.count, 1);
  assert.equal(model.followups.current.items[0]?.collection, "current");
  assert.deepEqual(model.followups.history.items, []);
  assert.deepEqual(model.followups.orphan.items, []);
  assert.equal(model.followups.history.viewHref, "/app/tasks");
  assert.equal(model.followups.orphan.viewHref, "/app/tasks");
  assert.equal(model.followups.orphan.warning, "存在失联跟进，请在待办中处理。");
  assert.equal(model.followups.current.items[0]?.operationHref, "/app/contacts/contact%3Ahome-facts");
  assert.deepEqual(
    model.followups.groups.map((group) => [group.key, group.count]),
    [
      ["overdue", 0],
      ["plan-past", 0],
      ["recent", 1],
      ["undated", 0],
    ],
  );
  assert.deepEqual(
    model.followups.items.map((item) => item.key).sort(),
    ["followups:current:1"],
  );
});

test("followup history metadata survives window filtering while only current tasks are actionable", async () => {
  const history = followupTask({
    dueAt: "2026-10-01T01:00:00.000Z",
    id: "history:outside-window",
    status: "completed",
  });
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      followupLoader: async () => followupSuccess([], [history]),
    }),
  });

  assert.equal(model.followups.state, "empty");
  assert.equal(model.followups.count, 0);
  assert.equal(model.followups.current.count, 0);
  assert.equal(model.followups.history.count, 1);
  assert.deepEqual(model.followups.history.items, []);
  assert.equal(model.followups.orphan.count, 0);
  assert.deepEqual(model.followups.groups.map((group) => group.count), [0, 0, 0, 0]);
});

test("followup current rows share one source-wide display cap while retaining full count", async () => {
  const current = Array.from({ length: 5 }, (_, index) =>
    followupTask({ id: `current:${index + 1}` }),
  );
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      followupLoader: async () => followupSuccess(current),
    }),
  });

  assert.equal(model.followups.count, 5);
  assert.equal(model.followups.groups.find((group) => group.key === "recent")?.count, 5);
  assert.equal(model.followups.items.length, 3);
  assert.equal(model.followups.current.count, 5);
  assert.equal(model.followups.current.items.length, 3);
});

test("personal schedule uses the real memory reader once, preserves occurrences, and only covers starts in the window", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createPersonalScheduleService({
    now: () => "2026-09-23T00:00:00.000Z",
    store,
    workspaceId: WORKSPACE,
  });
  await service.create(ACTOR, {
    endsAt: "2026-09-17T00:30:00.000Z",
    idempotencyKey: "ongoing-before-window",
    startsAt: "2026-09-16T14:30:00.000Z",
    title: "窗外已开始但仍进行中",
  });
  await service.create(ACTOR, {
    idempotencyKey: "from-boundary",
    startsAt: PRODUCT_FROM,
    title: "包含 from",
  });
  await service.create(ACTOR, {
    idempotencyKey: "to-boundary",
    startsAt: PRODUCT_TO,
    title: "排除 to",
  });
  const movedSeries = (await service.create(ACTOR, {
    endsAt: "2026-09-10T02:00:00.000Z",
    idempotencyKey: "moved-anchor-series",
    recurrence: { frequency: "daily", until: "2026-09-30" },
    startsAt: "2026-09-10T01:00:00.000Z",
    timeZone: "Asia/Tokyo",
    title: "例外移入窗口",
  })).scheduleItem;
  const cancelledSeries = (await service.create(ACTOR, {
    endsAt: "2026-09-17T03:00:00.000Z",
    idempotencyKey: "cancelled-occurrence-series",
    recurrence: { frequency: "daily", until: "2026-09-30" },
    startsAt: "2026-09-17T02:00:00.000Z",
    timeZone: "Asia/Tokyo",
    title: "例外取消",
  })).scheduleItem;
  const exceptionAt = "2026-09-16T12:00:00.000Z";
  store.upsertRecord({
    collectionName: "personal_schedule_occurrence_exceptions",
    createdAt: exceptionAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: {
      seriesId: movedSeries.id,
      occurrenceDate: "2026-09-10",
      cancelled: false,
      patch: {
        endsAt: "2026-09-16T17:00:00.000Z",
        startsAt: "2026-09-16T16:00:00.000Z",
      },
      updatedAt: exceptionAt,
    },
    recordId: `${movedSeries.id}:occurrence:2026-09-10`,
    sourceId: movedSeries.id,
    sourceType: "manual",
    updatedAt: exceptionAt,
    userId: ACTOR,
    workspaceId: WORKSPACE,
  });
  store.upsertRecord({
    collectionName: "personal_schedule_occurrence_exceptions",
    createdAt: exceptionAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: {
      seriesId: cancelledSeries.id,
      occurrenceDate: "2026-09-19",
      cancelled: true,
      patch: {},
      updatedAt: exceptionAt,
    },
    recordId: `${cancelledSeries.id}:occurrence:2026-09-19`,
    sourceId: cancelledSeries.id,
    sourceType: "manual",
    updatedAt: exceptionAt,
    userId: ACTOR,
    workspaceId: WORKSPACE,
  });

  let listRecordsCalls = 0;
  const capturedListInputs: Array<{ actorId: string; from?: string; to?: string }> = [];
  let capturedRecords: readonly { id: string; title: string; state: string }[] = [];
  let getCalls = 0;
  const originalListRecords = store.listRecords.bind(store);
  store.listRecords = (query) => {
    listRecordsCalls += 1;
    return originalListRecords(query);
  };
  const originalList = service.list.bind(service);
  service.list = async (input) => {
    capturedListInputs.push(input);
    const result = await originalList(input);
    capturedRecords = result;
    return result;
  };
  const originalGet = service.get.bind(service);
  service.get = async (input) => {
    getCalls += 1;
    return originalGet(input);
  };

  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({ personalScheduleService: service }),
  });

  assert.equal(listRecordsCalls, 3, "one authority collection read plus one exception read per active recurrence series");
  assert.deepEqual(capturedListInputs, [{ actorId: ACTOR, from: PRODUCT_FROM, to: PRODUCT_TO }]);
  assert.equal(getCalls, 0);
  assert.equal(capturedRecords.length, 15);
  assert.equal(model.personal.coverage, "starts-in-window");
  assert.equal(model.personal.count, 15);
  assert.equal(model.personal.items.some((item) => item.title === "窗外已开始但仍进行中"), false);
  assert.equal(model.personal.items.some((item) => item.title === "包含 from"), true);
  assert.equal(model.personal.items.some((item) => item.title === "排除 to"), false);
  assert.equal(model.personal.items.some((item) => item.id === `${movedSeries.id}:occurrence:2026-09-17` && item.state === "upcoming"), true);
  assert.equal(capturedRecords.some((item) => item.id === `${movedSeries.id}:occurrence:2026-09-10`), true);
  assert.equal(capturedRecords.some((item) => item.id === `${cancelledSeries.id}:occurrence:2026-09-19`), false);
  assert.equal(capturedRecords.some((item) => item.id === `${cancelledSeries.id}:occurrence:2026-09-18`), true);
  assert.equal(capturedRecords.some((item) => item.id === `${cancelledSeries.id}:occurrence:2026-09-20`), true);
  assert.equal(model.personal.items.some((item) => "recurrence" in item), false);
});

test("personal temporal state uses the route snapshot rather than reader clock and honors boundaries", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createPersonalScheduleService({
    now: () => "2026-09-23T00:00:00.000Z",
    store,
    workspaceId: WORKSPACE,
  });
  await service.create(ACTOR, {
    endsAt: SNAPSHOT,
    idempotencyKey: "ended-at-snapshot",
    startsAt: "2026-09-16T16:00:00.000Z",
    title: "ends at snapshot",
  });
  await service.create(ACTOR, {
    endsAt: "2026-09-17T00:30:00.000Z",
    idempotencyKey: "starts-at-snapshot",
    startsAt: SNAPSHOT,
    title: "starts at snapshot",
  });
  await service.create(ACTOR, {
    idempotencyKey: "reader-clock-drift",
    startsAt: "2026-09-18T01:00:00.000Z",
    title: "reader clock says ended",
  });

  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({ personalScheduleService: service }),
  });

  assert.equal(model.personal.count, 3);
  assert.equal(model.personal.items.find((item) => item.title === "ends at snapshot")?.state, "ended");
  assert.equal(model.personal.items.find((item) => item.title === "starts at snapshot")?.state, "ongoing");
  assert.equal(model.personal.items.find((item) => item.title === "reader clock says ended")?.state, "upcoming");
});

test("foreign task, personal, and appointment actors fail closed", async () => {
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: {
      taskService: {
        async list() {
          return [{
            accountId: OTHER_ACTOR,
            dueAt: "2026-09-18T01:00:00.000Z",
            id: "task:foreign",
            ownerUserId: OTHER_ACTOR,
            status: "open",
            title: "foreign task",
          }] as never;
        },
      },
      followupLoader: async () => followupSuccess([]),
      personalScheduleService: {
        async list() {
          return [{
            accountId: OTHER_ACTOR,
            id: "personal:foreign",
            ownerUserId: OTHER_ACTOR,
            startsAt: "2026-09-18T01:00:00.000Z",
            state: "upcoming",
            title: "foreign personal",
          }] as never;
        },
      },
      appointmentService: {
        async list() {
          return [appointmentRecord({
            appointmentId: "appointment:foreign",
            durationMinutes: 30,
            inviteeActorId: "actor:third",
            medium: "phone",
            ownerActorId: OTHER_ACTOR,
            startsAtUtc: "2026-09-18T01:00:00.000Z",
          })];
        },
      },
    },
  });

  assert.equal(model.tasks.state, "unavailable");
  assert.equal(model.personal.state, "unavailable");
  assert.equal(model.appointments.state, "unavailable");
  assert.equal(model.tasks.count, null);
  assert.equal(model.personal.count, null);
  assert.equal(model.appointments.count, null);
});

test("appointment facts count beyond three, include video, honor half-open bounds, and derive temporal edges", async () => {
  const records = [
    appointmentRecord({
      appointmentId: "appointment:video-from",
      durationMinutes: 30,
      medium: "video",
      startsAtUtc: PRODUCT_FROM,
    }),
    appointmentRecord({
      appointmentId: "appointment:ended-at-snapshot",
      durationMinutes: 480,
      medium: "phone",
      startsAtUtc: "2026-09-16T16:00:00.000Z",
    }),
    appointmentRecord({
      appointmentId: "appointment:ongoing-at-snapshot",
      durationMinutes: 30,
      medium: "phone",
      startsAtUtc: SNAPSHOT,
    }),
    appointmentRecord({
      appointmentId: "appointment:upcoming",
      durationMinutes: 30,
      medium: "in_person",
      startsAtUtc: "2026-09-18T01:00:00.000Z",
    }),
    appointmentRecord({
      appointmentId: "appointment:pending",
      durationMinutes: 60,
      medium: "phone",
      startsAtUtc: "2026-09-19T01:00:00.000Z",
      status: "reschedule_pending",
    }),
    appointmentRecord({
      appointmentId: "appointment:to",
      durationMinutes: 30,
      medium: "phone",
      startsAtUtc: PRODUCT_TO,
    }),
  ];
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      appointmentService: { async list() { return records; } },
    }),
  });

  assert.equal(model.appointments.count, 5);
  assert.equal(model.appointments.items.length, 3);
  assert.deepEqual(model.appointments.items.map((item) => item.appointmentId), [
    "appointment:video-from",
    "appointment:ended-at-snapshot",
    "appointment:ongoing-at-snapshot",
  ]);
  assert.equal(model.appointments.items[0]?.medium, "video");
  assert.equal(model.appointments.items[0]?.temporalState, "ended");
  assert.equal(model.appointments.items[1]?.temporalState, "ended");
  assert.equal(model.appointments.items[2]?.temporalState, "ongoing");
  assert.equal(model.appointments.items.some((item) => item.appointmentId === "appointment:to"), false);
});

test("appointments count every qualifying saved confirmation, preserve old time while rescheduling, and expose only the actor contact", async () => {
  const fixture = appointmentServiceFixture();
  const inPerson = await createConfirmedAppointment(fixture.service, {
    appointmentId: "appointment:in-person",
    eventId: "event:in-person",
    medium: "in_person",
    startsAtUtc: "2026-09-18T01:00:00.000Z",
  });
  const phone = await createConfirmedAppointment(fixture.service, {
    appointmentId: "appointment:phone",
    eventId: "event:phone",
    medium: "phone",
    startsAtUtc: "2026-09-19T01:00:00.000Z",
  });
  const pending = await createConfirmedAppointment(fixture.service, {
    appointmentId: "appointment:reschedule",
    eventId: "event:reschedule",
    medium: "phone",
    startsAtUtc: "2026-09-20T01:00:00.000Z",
  });
  const proposed = await fixture.service.command({
    actorId: ACTOR,
    appointmentId: pending.appointmentId,
    command: "propose",
    expectedVersion: pending.version,
    idempotencyKey: "reschedule:pending",
    proposal: {
      candidateTimes: [
        { candidateId: "new:1", startsAtUtc: "2026-10-01T01:00:00.000Z" },
        { candidateId: "new:2", startsAtUtc: "2026-10-02T01:00:00.000Z" },
        { candidateId: "new:3", startsAtUtc: "2026-10-03T01:00:00.000Z" },
      ],
      durationMinutes: 60,
      medium: { kind: "phone", phoneHint: null },
      timezone: "Asia/Tokyo",
    },
  });
  assert.equal(proposed.appointment.status, "reschedule_pending");
  assert.equal(proposed.appointment.confirmed?.startsAtUtc, "2026-09-20T01:00:00.000Z");
  const cancelled = await createConfirmedAppointment(fixture.service, {
    appointmentId: "appointment:cancelled",
    eventId: "event:cancelled",
    medium: "phone",
    startsAtUtc: "2026-09-21T01:00:00.000Z",
  });
  await fixture.service.command({
    actorId: ACTOR,
    appointmentId: cancelled.appointmentId,
    command: "cancel",
    expectedVersion: cancelled.version,
    idempotencyKey: "cancelled:appointment",
  });
  const completed = await createConfirmedAppointment(fixture.service, {
    appointmentId: "appointment:completed",
    eventId: "event:completed",
    medium: "phone",
    startsAtUtc: "2026-09-16T16:00:00.000Z",
  });
  fixture.setNow("2026-09-16T17:00:00.000Z");
  await fixture.service.command({
    actorId: ACTOR,
    appointmentId: completed.appointmentId,
    command: "complete",
    expectedVersion: completed.version,
    idempotencyKey: "completed:appointment",
  });

  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({ appointmentService: fixture.service }),
  });

  assert.equal(model.appointments.count, 3);
  assert.deepEqual(model.appointments.items.map((item) => item.appointmentId), [
    inPerson.appointmentId,
    phone.appointmentId,
    pending.appointmentId,
  ]);
  assert.equal(model.appointments.items.find((item) => item.appointmentId === inPerson.appointmentId)?.medium, "in_person");
  assert.equal(model.appointments.items.find((item) => item.appointmentId === phone.appointmentId)?.medium, "phone");
  const pendingView = model.appointments.items.find((item) => item.appointmentId === pending.appointmentId)!;
  assert.equal(pendingView.status, "reschedule_pending");
  assert.equal(pendingView.startsAtUtc, "2026-09-20T01:00:00.000Z");
  assert.equal(pendingView.needsReconfirmation, true);
  assert.equal(pendingView.contactId, "contact:counterparty-for-home-facts");
  assert.equal("contactIdsByActor" in pendingView, false);
  assert.equal(model.appointments.items.every((item) => item.href === "/app/agent/plan"), true);
});

test("same identifiers remain isolated by source and invalid source dates do not become empty", async () => {
  const task = taskServiceFixture();
  const invalidTask = {
    accountId: ACTOR,
    category: "work" as const,
    createdAt: "2026-09-16T00:00:00.000Z",
    dueAt: "not-a-date",
    id: "shared:id",
    ownerUserId: ACTOR,
    priority: "normal" as const,
    source: "manual" as const,
    status: "open" as const,
    title: "invalid",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
  const model = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: baseDependencies({
      taskService: {
        async list() {
          return [invalidTask];
        },
      },
      followupLoader: async () => followupSuccess([followupTask({ id: "shared:id" })]),
      personalScheduleService: {
        async list() {
          return [];
        },
      },
      appointmentService: {
        async list() {
          return [];
        },
      },
    }),
  });
  assert.equal(model.tasks.state, "unavailable");
  assert.equal(model.tasks.count, null);
  assert.equal(model.followups.items[0]?.key, "followups:shared:id");
  assert.equal(model.tasks.items.some((item) => item.key === "followups:shared:id"), false);
  assert.equal(task.store.listRecords({ limit: "unbounded", workspaceId: WORKSPACE }).length, 0);
});

test("a source's empty result is not reused when its factory is explicitly unavailable", async () => {
  const unavailable = await loadHomeFacts({
    actorId: ACTOR,
    snapshotAt: SNAPSHOT,
    dependencies: {
      appointmentService: null,
      personalScheduleService: null,
      taskService: null,
      followupLoader: null,
    },
  });
  for (const source of [unavailable.tasks, unavailable.followups, unavailable.personal, unavailable.appointments]) {
    assert.equal(source.state, "unavailable");
    assert.equal(source.count, null);
  }
});
