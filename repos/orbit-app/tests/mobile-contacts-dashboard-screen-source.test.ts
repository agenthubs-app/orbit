import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(appRoot, "src", "screens", "contacts", "ContactsDashboardScreen.tsx"),
  "utf8"
);

test("contacts dashboard reads one validated mobile aggregate", () => {
  assert.match(screenSource, /useValidatedApiResource/u);
  assert.match(screenSource, /mobileContactsDashboardPayloadSchema/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.mobileContactsDashboard/u);
  assert.doesNotMatch(screenSource, /const aggregateState = useApiResource/u);
  assert.doesNotMatch(screenSource, /const summaryState = useApiResource/u);
  assert.doesNotMatch(screenSource, /const contactsState = useApiResource/u);
});

test("contacts dashboard refreshes the aggregate after profile and analysis writes", () => {
  assert.match(screenSource, /dashboardState\.refresh\(\)/u);
  assert.doesNotMatch(screenSource, /profileState\.refresh\(\)/u);
  assert.doesNotMatch(screenSource, /opportunitiesState\.refresh\(\)/u);
  assert.doesNotMatch(screenSource, /gapsState\.refresh\(\)/u);
});
