import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  homeFactsToViewModel,
  type HomeFactsViewModel,
} from "../../app/(app)/app/agent/home-facts-view-model";
import { loadHomeFacts } from "../../app/(app)/app/agent/home-facts-route-service";

const SNAPSHOT = "2026-09-17T00:00:00.000Z";

test("pure home facts view model presents all four source states and stable section order", async () => {
  const routeModel = await loadHomeFacts({
    actorId: "actor:view-model",
    snapshotAt: SNAPSHOT,
    dependencies: {
      taskService: { async list() { return []; } },
      followupLoader: async () => ({
        currentCount: 0,
        currentTasks: [],
        historyCount: 0,
        historyTasks: [],
        orphanCount: 0,
        orphanTasks: [],
        sourceLabel: "Memory relationship lifecycle",
        state: "empty" as const,
      }),
      personalScheduleService: { async list() { return []; } },
      appointmentService: null,
    },
  });
  const model = homeFactsToViewModel(routeModel);

  assert.deepEqual(model.sections.map((section) => section.key), [
    "tasks",
    "followups",
    "personal",
    "appointments",
  ]);
  assert.equal(model.sections.find((section) => section.key === "tasks")?.state, "empty");
  assert.equal(model.sections.find((section) => section.key === "followups")?.state, "empty");
  assert.equal(model.sections.find((section) => section.key === "personal")?.state, "empty");
  assert.equal(model.sections.find((section) => section.key === "appointments")?.state, "unavailable");
  assert.equal(model.sections.find((section) => section.key === "personal")?.title, "七日内开始的个人日程");
  assert.equal(model.sections.find((section) => section.key === "appointments")?.title, "七日内已确认约谈");
  assert.equal(model.personal.coverage, "starts-in-window");
  assert.equal(model.snapshotAt, SNAPSHOT);
  assert.equal(model.window.timeZone, "Asia/Tokyo");
  assert.equal(model.window.coverage, "starts-in-window");
});

test("view model keeps route counts and links without widening the display claim", () => {
  const source = {
    snapshotAt: SNAPSHOT,
    window: {
      coverage: "starts-in-window" as const,
      from: "2026-09-16T15:00:00.000Z",
      productDate: "2026-09-17",
      timeZone: "Asia/Tokyo",
      to: "2026-09-23T15:00:00.000Z",
    },
    tasks: {
      count: 1,
      groups: [{ key: "recent" as const, count: 1, items: [{ key: "tasks:task:1", id: "task:1", title: "Task", href: "/app/tasks/task%3A1", group: "recent" as const }] }],
      items: [{ key: "tasks:task:1", id: "task:1", title: "Task", href: "/app/tasks/task%3A1", group: "recent" as const }],
      state: "ready" as const,
      viewHref: "/app/tasks",
    },
    followups: {
      count: 1,
      current: { count: 1, items: [{ key: "followups:shared", id: "shared", title: "Follow up", href: "/app/contacts/contact%3A1", group: "recent" as const, collection: "current" as const, operationHref: "/app/contacts/contact%3A1", issue: undefined }] },
      history: { count: 0, items: [] },
      orphan: { count: 0, items: [] },
      groups: [{ key: "recent" as const, count: 1, items: [{ key: "followups:shared", id: "shared", title: "Follow up", href: "/app/contacts/contact%3A1", group: "recent" as const, collection: "current" as const, operationHref: "/app/contacts/contact%3A1", issue: undefined }] }],
      items: [{ key: "followups:shared", id: "shared", title: "Follow up", href: "/app/contacts/contact%3A1", group: "recent" as const, collection: "current" as const, operationHref: "/app/contacts/contact%3A1", issue: undefined }],
      state: "ready" as const,
      viewHref: "/app/tasks",
    },
    personal: {
      count: 1,
      coverage: "starts-in-window" as const,
      items: [{ key: "personal:series:occurrence:2026-09-18", id: "series:occurrence:2026-09-18", title: "Schedule", startsAt: "2026-09-18T01:00:00.000Z", state: "ongoing" as const, timeZone: "America/New_York", allDay: false, group: "recent" as const }],
      state: "ready" as const,
      viewHref: "/app/tasks/personal",
    },
    appointments: {
      count: 1,
      items: [{ key: "appointments:appointment:1", appointmentId: "appointment:1", contactId: "contact:1", durationMinutes: 30, href: "/app/today#arrangements", medium: "phone" as const, needsReconfirmation: false, startsAtUtc: "2026-09-18T01:00:00.000Z", status: "confirmed" as const, temporalState: "upcoming" as const }],
      state: "ready" as const,
      viewHref: "/app/today#arrangements",
    },
  } as never;

  const model = homeFactsToViewModel(source);
  const json = JSON.stringify(model);
  assert.match(json, /Task/);
  assert.match(json, /Follow up/);
  assert.equal(model.sections.every((section) => section.viewHref.length > 0), true);
  assert.equal(model.sections.find((section) => section.key === "tasks")?.count, 1);
  assert.equal(model.sections.find((section) => section.key === "appointments")?.viewHref, "/app/today#arrangements");
  assert.equal(model.personal.coverage, "starts-in-window");
  assert.equal(model.personal.title, "七日内开始的个人日程");
  assert.equal(model.appointments.title, "七日内已确认约谈");
});

test("pure view model has no direct feature DTO import", () => {
  const source = readFileSync(
    new URL("../../app/(app)/app/agent/home-facts-view-model.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /features\//);
  assert.doesNotMatch(source, /TaskItemDTO|PersonalScheduleContract|AppointmentAggregate/);
});

test("view model type is structurally renderable without source DTOs", () => {
  const acceptsPlainModel = (model: HomeFactsViewModel) => model.sections.length;
  assert.equal(typeof acceptsPlainModel, "function");
});
