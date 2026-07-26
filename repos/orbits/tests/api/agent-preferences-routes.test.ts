import assert from "node:assert/strict";
import test from "node:test";

import { createAgentPreferencesRouteHandlers } from "../../app/api/agent/preferences/route";
import {
  createAgentPreferencesService,
  resetAgentPreferencesServiceForTests,
} from "../../features/agent/preferences";

const { GET: getPreferences, PUT: updatePreferences } =
  createAgentPreferencesRouteHandlers({
    resolveActorId: async () => "actor:preferences-route-test",
    serviceForActor: (actorId) =>
      createAgentPreferencesService({ actorId }),
  });

test.beforeEach(() => {
  resetAgentPreferencesServiceForTests();
});

test.afterEach(() => {
  resetAgentPreferencesServiceForTests();
});

test("PUT preferences remain visible to a later GET request", async () => {
  const updateResponse = await updatePreferences(
    new Request("http://localhost/api/agent/preferences", {
      body: JSON.stringify({
        quietHours: { start: "22:15", end: "08:00" },
        timeZone: "America/Los_Angeles",
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
  );
  assert.equal(updateResponse.status, 200);

  const getResponse = await getPreferences();
  assert.equal(getResponse.status, 200);
  const body = await getResponse.json();
  assert.deepEqual(body.data.quietHours, {
    start: "22:15",
    end: "08:00",
  });
  assert.equal(body.data.timeZone, "America/Los_Angeles");
});

test("PUT preferences rejects an invalid IANA time zone", async () => {
  const response = await updatePreferences(
    new Request("http://localhost/api/agent/preferences", {
      body: JSON.stringify({ timeZone: "Mars/Olympus_Mons" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "AGENT_PREFERENCES_INVALID");
});

test("preferences require an authenticated actor boundary", async () => {
  const handlers = createAgentPreferencesRouteHandlers({
    resolveActorId: async () => null,
  });
  assert.equal((await handlers.GET()).status, 401);
});

test("preferences are isolated between authenticated actors", async () => {
  let actorId = "actor:preferences-a";
  const handlers = createAgentPreferencesRouteHandlers({
    resolveActorId: async () => actorId,
    serviceForActor: (actor) =>
      createAgentPreferencesService({ actorId: actor }),
  });
  await handlers.PUT(
    new Request("http://localhost/api/agent/preferences", {
      body: JSON.stringify({ externalCalendarWritesEnabled: true }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
  );
  actorId = "actor:preferences-b";
  const body = await (await handlers.GET()).json();
  assert.equal(body.data.externalCalendarWritesEnabled, false);
});
