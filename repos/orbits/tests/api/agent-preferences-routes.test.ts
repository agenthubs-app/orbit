import assert from "node:assert/strict";
import test from "node:test";

import {
  GET as getPreferences,
  PUT as updatePreferences,
} from "../../app/api/agent/preferences/route";
import { resetAgentPreferencesServiceForTests } from "../../features/agent/preferences";

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
});
