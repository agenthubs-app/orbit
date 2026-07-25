import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { createMockEventCrudAndImportService } from "../../features/events/event-crud-and-import/mock-service";
import {
  loadAppScheduleRouteViewModel,
  type AppScheduleArrangementViewModel,
  type AppScheduleRouteScenario,
} from "../../app/(app)/app/schedule/schedule-route-view-model";

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
  assert.equal(contactArrangement.href, "/app/contacts/demo-contact-1");
  assert.equal(eventArrangement.href, "/app/schedule/events/event_001");
  assert.match(contactArrangement.primaryName, /Kenji Watanabe/);
  assert.match(contactArrangement.secondaryName, /创始人 · Aster Grid/);
  assert.match(contactArrangement.reason, /关系原因/);
  assert.match(contactArrangement.reason, /引荐|复核来源/);
  assert.match(contactArrangement.timing, /跟进时机/);
  assert.match(contactArrangement.sourceContext, /来源/);
  assert.match(eventArrangement.primaryName, /种子轮投资人与创始人匹配沙龙/);
  assert.match(eventArrangement.secondaryName, /地点：Orbit 关系室/);
  assert.match(eventArrangement.reason, /活动原因/);
  assert.match(eventArrangement.timing, /2026年7月9日/);
  assert.match(eventArrangement.sourceContext, /来源/);
  assert.equal(eventArrangement.targetState, "detail-unavailable");
  assert.match(eventArrangement.targetNote ?? "", /安排预览/);
  assert.match(
    eventArrangement.targetNote ?? "",
    /种子轮投资人与创始人匹配沙龙/,
  );
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

test("default schedule route keeps data-backed arrangements when live sources are unavailable", async () => {
  const model = await withOrbitModuleMode("live", () =>
    loadAppScheduleRouteViewModel(),
  );

  assert.equal(model.state, "success");

  if (model.state !== "success") return;

  assert.equal(model.arrangements[0]?.href, "/app/contacts/demo-contact-1");
  assert.equal(model.arrangements[1]?.href, "/app/schedule/events/event_001");
  assert.equal(model.arrangements[0]?.targetState, "detail-unavailable");
  assert.match(model.arrangements[0]?.targetNote ?? "", /联系人详情/);
  assert.match(model.summary, /可复核安排/);
});

test("schedule arrangement targets resolve through existing detail boundaries", async () => {
  const model = await loadAppScheduleRouteViewModel();

  assert.equal(model.state, "success");

  if (model.state !== "success") return;

  for (const arrangement of model.arrangements) {
    if (arrangement.target.kind === "contact") {
      const contactRoute = await loadAppContactDetailRoute({
        contactId: arrangement.target.id,
        mode: "mock",
      });

      assert.equal(
        contactRoute.routeState,
        "success",
        `contact href ${arrangement.href} should resolve through contact detail`,
      );
    } else {
      const eventResult = createMockEventCrudAndImportService().getEvent({
        eventId: arrangement.target.id,
      });

      assert.equal(
        eventResult.success,
        true,
        `event href ${arrangement.href} should resolve through event detail data`,
      );
      assert.match(
        arrangement.href,
        /^\/app\/schedule\/events\/[^/]+$/,
        `event href ${arrangement.href} should use the schedule preview route while composed detail is unavailable`,
      );
    }
  }
});

test("schedule event preview route preserves unavailable event context", async () => {
  const { loadAppScheduleEventPreviewRouteViewModel } = await import(
    "../../app/(app)/app/schedule/events/[id]/event-preview-route-view-model"
  );
  const model = await loadAppScheduleEventPreviewRouteViewModel({
    eventId: "event_001",
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

  assert.match(routeModelSource, /createContactDetailTagStatusService/);
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
  assert.match(doc, /features\/events\/event-crud-and-import\/live-service\.ts/);
  assert.match(doc, /features\/followups\/live-service\.ts/);
  assert.match(doc, /ORBIT_MODULE_MODE/);
  assert.match(doc, /privacy|隐私/i);
  assert.match(doc, /provenance|来源/i);
  assert.match(doc, /replacement tests|替换测试/i);
  assert.match(doc, /\/app\/schedule\/events\/<id>/);
  assert.match(doc, /event-preview-route-view-model\.ts/);
});
