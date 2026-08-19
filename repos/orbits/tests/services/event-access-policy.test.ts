import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_ACCESS_CAPABILITIES,
  EventAccessAssignmentError,
  parseEventAccessAssignment,
  type EventAccessRole,
} from "../../features/events/event-access/contract";
import {
  canAccessEventCapability,
  eventAccessCapabilities,
} from "../../features/events/event-access/capability-policy";

const EXPECTED: Readonly<Record<EventAccessRole, readonly string[]>> = {
  check_in: [
    "event.center.read",
    "check_in.roster.read_limited",
    "check_in.roster.write",
  ],
  operations: [
    "event.center.read",
    "operations.read_sensitive",
    "operations.configure",
    "experience.configure",
    "experience.publish",
    "attendees.read_full",
    "attendees.export",
    "check_in.roster.read_limited",
    "check_in.roster.write",
    "generation.run",
    "generation.publish",
    "analytics.read_aggregate",
  ],
  read_only_analyst: [
    "event.center.read",
    "analytics.read_aggregate",
  ],
  reviewer: [
    "event.center.read",
    "admission.read",
    "admission.decide",
  ],
};

test("event access capability matrix is exact, frozen, and owner-derived", () => {
  const owner = eventAccessCapabilities({ owner: true, role: null, state: null });
  assert.deepEqual(owner, EVENT_ACCESS_CAPABILITIES);
  assert.ok(Object.isFrozen(owner));
  assert.equal(
    canAccessEventCapability({
      capability: "roles.manage",
      owner: true,
      role: null,
      state: null,
    }),
    true,
  );
  assert.equal(
    canAccessEventCapability({
      capability: "owner.transfer",
      owner: false,
      role: "operations",
      state: "active",
    }),
    false,
  );

  for (const [role, capabilities] of Object.entries(EXPECTED) as Array<
    [EventAccessRole, readonly string[]]
  >) {
    const actual = eventAccessCapabilities({
      owner: false,
      role,
      state: "active",
    });
    assert.deepEqual(actual, capabilities);
    assert.ok(Object.isFrozen(actual));
  }
});

test("event access policy is total and defaults unknown or revoked facts to deny", () => {
  for (const facts of [
    { owner: false, role: null, state: null },
    { owner: false, role: "owner", state: "active" },
    { owner: false, role: "operations", state: "revoked" },
    { owner: false, role: "unknown", state: "active" },
    { owner: "true", role: null, state: null },
  ]) {
    assert.deepEqual(eventAccessCapabilities(facts), []);
    assert.equal(
      canAccessEventCapability({
        ...facts,
        capability: "event.center.read",
      }),
      false,
    );
  }
  assert.equal(
    canAccessEventCapability({
      capability: "unknown",
      owner: true,
      role: null,
      state: null,
    }),
    false,
  );
});

test("event access assignment parser copies exact safe delegated facts", () => {
  const input = {
    assignedByActorId: "actor:owner",
    eventId: "event:tokyo-operator",
    reason: "负责现场签到与迟到参会者核验",
    role: "check_in",
    state: "active",
    subjectActorId: "actor:check-in-01",
  } as const;
  const parsed = parseEventAccessAssignment(input);
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.ok(Object.isFrozen(parsed));
});

test("event access assignment parser rejects owner, extras, accessors, and unsafe text without echo", () => {
  const valid = {
    assignedByActorId: "actor:owner",
    eventId: "event:one",
    reason: "Reviewed operating need",
    role: "reviewer",
    state: "active",
    subjectActorId: "actor:reviewer",
  };
  const accessor = { ...valid } as Record<string, unknown>;
  Object.defineProperty(accessor, "reason", {
    enumerable: true,
    get() {
      throw new Error("secret");
    },
  });
  const revoked = Proxy.revocable(valid, {});
  revoked.revoke();
  const invalid = [
    null,
    { ...valid, role: "owner" },
    { ...valid, state: "pending" },
    { ...valid, reason: " secret" },
    { ...valid, reason: "secret\nvalue" },
    { ...valid, subjectActorId: "actor secret" },
    { ...valid, extra: true },
    { ...valid, [Symbol("secret")]: true },
    accessor,
    revoked.proxy,
  ];
  for (const value of invalid) {
    assert.throws(
      () => parseEventAccessAssignment(value),
      (error: unknown) =>
        error instanceof EventAccessAssignmentError &&
        !error.message.includes("secret"),
    );
  }
});
