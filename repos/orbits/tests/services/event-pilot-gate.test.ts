import assert from "node:assert/strict";
import test from "node:test";

import { eventPilotDecision } from "../../shared/config/event-pilot-gate";

test("event pilot gate is fail-closed in production without an allowlist", () => {
  assert.deepEqual(
    eventPilotDecision({
      capability: "experience",
      env: { NODE_ENV: "production", ORBIT_EVENT_PILOT_ENABLED: "true" },
      eventId: "event:pilot",
    }),
    { enabled: false, reason: "event_not_allowlisted" },
  );
});

test("event pilot gate requires the exact event and honors capability switches", () => {
  const env = {
    NODE_ENV: "production",
    ORBIT_EVENT_PILOT_ENABLED: "true",
    ORBIT_EVENT_PILOT_EVENT_IDS: "event:pilot,event:second",
    ORBIT_EVENT_PILOT_PROACTIVE_REMINDERS_ENABLED: "false",
  };
  assert.equal(
    eventPilotDecision({ capability: "experience", env, eventId: "event:pilot" })
      .enabled,
    true,
  );
  assert.equal(
    eventPilotDecision({ capability: "experience", env, eventId: "event:other" })
      .reason,
    "event_not_allowlisted",
  );
  assert.equal(
    eventPilotDecision({
      capability: "proactive_reminders",
      env,
      eventId: "event:pilot",
    }).reason,
    "capability_disabled",
  );
});

test("the global kill switch wins in every environment", () => {
  assert.equal(
    eventPilotDecision({
      capability: "effective_connection_roi",
      env: {
        NODE_ENV: "test",
        ORBIT_EVENT_PILOT_KILL_SWITCH: "true",
      },
      eventId: "event:pilot",
    }).reason,
    "global_kill_switch",
  );
});

test("R17 A12: host-created events skip the production allowlist; the kill switch and capability flag still stop them", () => {
  const production = { NODE_ENV: "production" };
  assert.deepEqual(eventPilotDecision({ capability: "experience", env: production, eventId: "evt_host" }), { enabled: false, reason: "global_disabled" });
  assert.deepEqual(eventPilotDecision({ capability: "experience", env: production, eventId: "evt_host", hostCreated: true }), { enabled: true, reason: "enabled" });
  assert.deepEqual(eventPilotDecision({ capability: "experience", env: { ...production, ORBIT_EVENT_PILOT_KILL_SWITCH: "true" }, eventId: "evt_host", hostCreated: true }), { enabled: false, reason: "global_kill_switch" });
  assert.deepEqual(eventPilotDecision({ capability: "experience", env: { ...production, ORBIT_EVENT_PILOT_EXPERIENCE_ENABLED: "false" }, eventId: "evt_host", hostCreated: true }), { enabled: false, reason: "capability_disabled" });
});
