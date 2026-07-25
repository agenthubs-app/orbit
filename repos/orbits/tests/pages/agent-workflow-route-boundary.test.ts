import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const repositoryRoot = process.cwd();

test("Agent workflows are entered through domain or internal boundaries", () => {
  for (const route of [
    "app/api/agent/workflows/post-event-followup/route.ts",
    "app/api/agent/workflows/pre-event-brief/route.ts",
    "app/api/agent/workflows/event-matchmaking/route.ts",
  ]) {
    assert.equal(existsSync(join(repositoryRoot, route)), false);
  }

  const domainRoute = readFileSync(
    join(repositoryRoot, "app/api/events/[id]/post-event/followup/route.ts"),
    "utf8",
  );
  assert.match(domainRoute, /const \{ id: eventId \} = await context\.params/);
  assert.doesNotMatch(domainRoute, /body\.eventId/);

  const schedulerRoute = readFileSync(
    join(repositoryRoot, "app/api/internal/agent/scheduler/route.ts"),
    "utf8",
  );
  const schedulerHandler = readFileSync(
    join(repositoryRoot, "app/api/internal/agent/scheduler/route-handler.ts"),
    "utf8",
  );
  assert.match(schedulerRoute, /createAgentSchedulerRouteHandler/);
  assert.match(schedulerHandler, /ORBIT_AGENT_WORKER_SECRET/);
  assert.match(schedulerHandler, /CLIENT_SCHEDULER_INPUT_FORBIDDEN/);
  assert.match(
    schedulerHandler,
    /createConfiguredPreEventBriefCandidateCollector/,
  );
  assert.doesNotMatch(schedulerRoute, /body\.candidates/);
});
