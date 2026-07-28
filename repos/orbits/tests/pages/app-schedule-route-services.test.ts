import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMockEventCrudAndImportService } from "../../features/events/event-crud-and-import/mock-service";
import {
  createAppScheduleRouteServices,
  loadAppScheduleRouteViewModel,
  type AppScheduleArrangementViewModel,
  type AppScheduleRouteScenario,
} from "../../app/(app)/app/schedule/schedule-route-view-model";

test("schedule route passes one authenticated actor to every relationship source", async () => {
  const actorId = "actor:schedule-route-loader";
  const observed = new Map<string, string | null | undefined>();
  const base = createAppScheduleRouteServices("mock");
  const model = await loadAppScheduleRouteViewModel(
    undefined,
    {
      contacts: {
        ...base.contacts,
        listContacts: (input) => {
          observed.set("contacts", input?.actorId);
          return base.contacts.listContacts(input);
        },
      },
      events: {
        ...base.events,
        listEvents: (input) => {
          observed.set("events", input?.actorId);
          return base.events.listEvents(input);
        },
      },
      followups: {
        ...base.followups,
        listTasks: (input) => {
          observed.set("followups", input?.actorId);
          return base.followups.listTasks(input);
        },
      },
    },
    actorId,
  );

  assert.equal(model.state, "success");
  assert.deepEqual(Object.fromEntries(observed), {
    contacts: actorId,
    events: actorId,
    followups: actorId,
  });
});

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function visibleArrangementText(
  arrangement: AppScheduleArrangementViewModel,
): string {
  return [
    arrangement.primaryName,
    arrangement.secondaryName,
    arrangement.reason,
    arrangement.timing,
    arrangement.sourceContext,
    arrangement.statusLabel,
    arrangement.actionLabel,
    arrangement.targetNote ?? "",
  ].join(" ");
}

async function withOrbitModuleMode<TResult>(
  mode: string,
  callback: () => Promise<TResult>,
): Promise<TResult> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  process.env.ORBIT_MODULE_MODE = mode;

  try {
    return await callback();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("schedule route model maps arrangements through contact, event, and follow-up context", async () => {
  const model = await loadAppScheduleRouteViewModel();

  assert.equal(model.state, "success");

  if (model.state !== "success") return;

  const contactArrangement = model.arrangements.find(
    (arrangement) => arrangement.target.kind === "contact",
  );
  const eventArrangement = model.arrangements.find(
    (arrangement) => arrangement.target.kind === "event",
  );

  assert.ok(contactArrangement, "expected a contact-backed arrangement");
  assert.ok(eventArrangement, "expected an event-backed arrangement");
  assert.equal(
    contactArrangement.href,
    `/app/contacts/${encodeURIComponent(contactArrangement.target.id)}`,
  );
  assert.equal(
    eventArrangement.href,
    `/app/events/${encodeURIComponent(eventArrangement.target.id)}`,
  );
  assert.equal(contactArrangement.target.id, "contact:kenji-watanabe");
  assert.equal(eventArrangement.target.id, "demo-event-1");
  assert.match(contactArrangement.primaryName, /Kenji Watanabe/);
  assert.match(contactArrangement.secondaryName, /创始人 · Aster Grid/);
  assert.match(contactArrangement.reason, /关系原因/);
  assert.match(contactArrangement.reason, /引荐|复核来源/);
  assert.match(contactArrangement.timing, /跟进时机/);
  assert.match(contactArrangement.sourceContext, /来源/);
  assert.match(eventArrangement.primaryName, /Climate founders dinner/);
  assert.match(eventArrangement.secondaryName, /地点：Kanda Founders Table/);
  assert.match(eventArrangement.reason, /活动原因/);
  assert.match(eventArrangement.timing, /2026年6月28日/);
  assert.match(eventArrangement.sourceContext, /来源/);
  assert.equal(eventArrangement.targetState, "ready");
  assert.match(eventArrangement.targetNote ?? "", /Climate founders dinner/);
  assert.match(eventArrangement.targetNote ?? "", /活动详情/);
  assert.match(eventArrangement.targetNote ?? "", /不会写入日历/);

  const visibleText = model.arrangements.map(visibleArrangementText).join(" ");
  assert.doesNotMatch(visibleText, /Review follow-up for contact_021/);
  assert.doesNotMatch(visibleText, /\bcontact_\d+\b/);
  assert.doesNotMatch(visibleText, /\bevent_\d+\b/);
  assert.doesNotMatch(visibleText, /task:followup|trigger:followup/);
  assert.doesNotMatch(
    visibleText,
    /Met at the climate founders dinner|Send Kenji|Orbit AI event recommendation evidence|Review source-backed reasons|storage pilot operators|calendar holds/i,
  );
  assert.doesNotMatch(
    visibleText,
    /Founder · Aster Grid|Orbit Relationship Room|Seed Investor and Founder Matching Salon/,
  );
});

test("default schedule route never swaps live failures for unrelated demo entities", async () => {
  const model = await withOrbitModuleMode("live", () =>
    loadAppScheduleRouteViewModel(),
  );

  assert.equal(model.state, "route-state");

  if (model.state !== "route-state") return;

  assert.equal(model.routeState.scenario, "failure");
  assert.doesNotMatch(
    JSON.stringify(model),
    /demo-contact-1|event_001|Kenji Watanabe/,
  );
});

test("schedule arrangements preserve the exact entity ids returned by their sources", async () => {
  const model = await loadAppScheduleRouteViewModel();

  assert.equal(model.state, "success");

  if (model.state !== "success") return;

  for (const arrangement of model.arrangements) {
    if (arrangement.target.kind === "contact") {
      assert.equal(
        arrangement.href,
        `/app/contacts/${encodeURIComponent(arrangement.target.id)}`,
      );
      assert.equal(arrangement.targetState, "ready");
    } else {
      const eventResult = await createMockEventCrudAndImportService().getEvent({
        eventId: arrangement.target.id,
      });

      assert.equal(
        eventResult.success,
        true,
        `event href ${arrangement.href} should resolve through event detail data`,
      );
      assert.match(
        arrangement.href,
        /^\/app\/events\/[^/]+$/,
        `event href ${arrangement.href} should use the canonical event detail route`,
      );
      assert.equal(arrangement.targetState, "ready");
    }
  }
});

test("schedule event preview route preserves unavailable event context", async () => {
  const { loadAppScheduleEventPreviewRouteViewModel } =
    await import("../../app/(app)/app/schedule/events/[id]/event-preview-route-view-model");
  const model = await loadAppScheduleEventPreviewRouteViewModel({
    actorId: "actor:schedule-preview-mock",
    eventId: "event_001",
    mode: "mock",
  });

  assert.equal(model.state, "success");

  if (model.state !== "success") return;

  assert.equal(model.event.id, "event_001");
  assert.match(model.event.title, /种子轮投资人与创始人匹配沙龙/);
  assert.match(model.event.timing, /2026年7月9日/);
  assert.match(model.event.sourceContext, /来源/);
  assert.match(model.event.nextAction, /下一步/);
  assert.match(model.guardrail, /不会写入日历/);
  const visibleText = [
    model.event.title,
    model.event.venue,
    model.event.timing,
    model.event.sourceContext,
    model.event.nextAction,
    model.description,
    model.guardrail,
  ].join(" ");

  assert.doesNotMatch(visibleText, /\bevent_\d+\b/);
  assert.doesNotMatch(
    visibleText,
    /Orbit AI event recommendation evidence|calendar holds|messages|notifications|Seed Investor and Founder Matching Salon|Orbit Relationship Room/i,
  );
});

test("schedule event preview passes actor identity and never falls back to mock in live mode", async () => {
  const actorId = "actor:schedule-preview";
  const base = createMockEventCrudAndImportService();
  let observedActorId: string | null | undefined;
  const mockModel = await (
    await import("../../app/(app)/app/schedule/events/[id]/event-preview-route-view-model")
  ).loadAppScheduleEventPreviewRouteViewModel({
    actorId,
    eventId: "event_001",
    services: {
      events: {
        ...base,
        getEvent: (input) => {
          observedActorId = input.actorId;
          return base.getEvent(input);
        },
      },
    },
  });

  assert.equal(mockModel.state, "success");
  assert.equal(observedActorId, actorId);

  const liveModel = await withOrbitModuleMode("live", async () =>
    (
      await import("../../app/(app)/app/schedule/events/[id]/event-preview-route-view-model")
    ).loadAppScheduleEventPreviewRouteViewModel({
      actorId,
      eventId: "event_001",
    }),
  );

  assert.equal(liveModel.state, "failure");
  assert.doesNotMatch(
    JSON.stringify(liveModel),
    /种子轮投资人与创始人匹配沙龙|Orbit 关系室/,
  );

  const pageSource = source("app/(app)/app/schedule/events/[id]/page.tsx");
  assert.match(pageSource, /const session = await auth\(\)/);
  assert.match(pageSource, /actorId,/);
  assert.match(pageSource, /redirect\(/);
});

test("schedule event preview decodes a dynamic event id exactly once at the page boundary", async () => {
  const { decodeScheduleEventRouteId } = await import(
    "../../app/(app)/app/schedule/events/[id]/schedule-event-route-id"
  );
  const pageSource = source("app/(app)/app/schedule/events/[id]/page.tsx");

  assert.equal(
    decodeScheduleEventRouteId("event%3Alive-record%3A20260729"),
    "event:live-record:20260729",
  );
  assert.equal(
    decodeScheduleEventRouteId(" event:live-record:20260729 "),
    "event:live-record:20260729",
  );
  assert.equal(decodeScheduleEventRouteId("%E0%A4%A"), "%E0%A4%A");
  assert.match(pageSource, /const id = decodeScheduleEventRouteId\(routeId\)/);
  assert.match(pageSource, /eventId: id/);
});

test("schedule route states keep Chinese recovery copy for empty, pending, and failure", async () => {
  const scenarios: readonly AppScheduleRouteScenario[] = [
    "empty",
    "pending",
    "failure",
  ];

  for (const scenario of scenarios) {
    const model = await loadAppScheduleRouteViewModel({ scenario });

    assert.equal(model.state, "route-state");

    if (model.state !== "route-state") continue;

    assert.equal(model.routeState.scenario, scenario);
    assert.ok(model.routeState.recoveryActions.length > 0);

    const stateText = [
      model.routeState.copy.eyebrow,
      model.routeState.copy.title,
      model.routeState.copy.description,
      model.routeState.copy.guardrail,
      model.routeState.copy.nextStep,
      ...model.routeState.recoveryActions.map((action) => action.label),
    ].join(" ");

    assert.match(stateText, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(
      stateText,
      /\b(?:Schedule|Follow-ups|Reload|Return|Add|Check|No|Pending|Failure|Source|Review)\b/,
    );
  }
});

test("schedule route view model owns arrangement mapping outside the page component", () => {
  const routeModelSource = source(
    "app/(app)/app/schedule/schedule-route-view-model.ts",
  );
  // T3 (today-schedule merge): schedule/page.tsx itself no longer calls
  // loadAppScheduleRouteViewModel — it's a redirect shell to
  // /app/today#arrangements now. The loader moved to
  // today/compose-app-today-from-agent-ledger/today-merged-view-model.ts,
  // which is what actually owns rendering the arrangement mapping today.
  const mergedViewModelSource = source(
    "app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model.ts",
  );

  assert.match(routeModelSource, /createContactsListSearchAndFilterService/);
  assert.match(routeModelSource, /createEventCrudAndImportService/);
  assert.match(routeModelSource, /createFollowupTaskGenerationService/);
  assert.match(routeModelSource, /AppScheduleArrangementViewModel/);
  assert.doesNotMatch(routeModelSource, /Review follow-up for/);
  assert.match(mergedViewModelSource, /loadAppScheduleRouteViewModel/);
  assert.doesNotMatch(mergedViewModelSource, /AppFollowupsPage/);
});

test("schedule live implementation doc records replacement boundary", () => {
  const doc = source("app/(app)/app/schedule/SCHEDULE_LIVE_IMPLEMENTATION.md");

  assert.match(doc, /schedule-route-view-model\.ts/);
  assert.match(doc, /features\/contacts\/live/);
  assert.match(
    doc,
    /features\/events\/event-crud-and-import\/live-service\.ts/,
  );
  assert.match(doc, /features\/followups\/live-service\.ts/);
  assert.match(doc, /ORBIT_MODULE_MODE/);
  assert.match(doc, /privacy|隐私/i);
  assert.match(doc, /provenance|来源/i);
  assert.match(doc, /replacement tests|替换测试/i);
  assert.match(doc, /\/app\/schedule\/events\/<id>/);
  assert.match(doc, /event-preview-route-view-model\.ts/);
});
