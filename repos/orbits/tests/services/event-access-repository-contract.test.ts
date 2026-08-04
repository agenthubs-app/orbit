import assert from "node:assert/strict";
import test from "node:test";

import {
  EventAccessCommandError,
  parseEventAccessGetQuery,
  parseEventAccessGrantCommand,
  parseEventAccessRevokeCommand,
  type EventAccessRepository,
} from "../../features/events/event-access/repository";
import { createEventAccessService } from "../../features/events/event-access/service";

const validGrant = {
  actingActorId: "actor:event-owner",
  eventId: "event:tokyo-founder-table",
  expectedRevision: 0,
  reason: "负责双语签到与迟到参会者核验",
  role: "check_in",
  subjectActorId: "actor:check-in-operator",
} as const;

test("event access command parsers copy and freeze exact safe inputs", () => {
  const grant = parseEventAccessGrantCommand(validGrant);
  assert.deepEqual(grant, validGrant);
  assert.notEqual(grant, validGrant);
  assert.ok(Object.isFrozen(grant));

  const revokeInput = {
    actingActorId: "actor:event-owner",
    eventId: "event:tokyo-founder-table",
    expectedRevision: 3,
    reason: "现场职责已结束",
    subjectActorId: "actor:check-in-operator",
  };
  const revoke = parseEventAccessRevokeCommand(revokeInput);
  assert.deepEqual(revoke, revokeInput);
  assert.notEqual(revoke, revokeInput);
  assert.ok(Object.isFrozen(revoke));

  const get = parseEventAccessGetQuery(
    Object.assign(Object.create(null), {
      eventId: "event:tokyo-founder-table",
      subjectActorId: "actor:check-in-operator",
    }),
  );
  assert.deepEqual(get, {
    eventId: "event:tokyo-founder-table",
    subjectActorId: "actor:check-in-operator",
  });
  assert.ok(Object.isFrozen(get));
});

test("event access command parsers reject extras, accessors, proxies, and unsafe values without echo", () => {
  const accessor = { ...validGrant } as Record<string, unknown>;
  Object.defineProperty(accessor, "reason", {
    enumerable: true,
    get() {
      throw new Error("secret-input");
    },
  });
  const revoked = Proxy.revocable(validGrant, {});
  revoked.revoke();
  const invalid = [
    null,
    { ...validGrant, role: "owner" },
    { ...validGrant, role: "check_in", extra: "secret-input" },
    { ...validGrant, [Symbol("secret-input")]: true },
    { ...validGrant, actingActorId: "actor owner" },
    { ...validGrant, eventId: "event:e\u0301" },
    { ...validGrant, expectedRevision: -1 },
    { ...validGrant, expectedRevision: 1.5 },
    { ...validGrant, reason: " secret-input" },
    { ...validGrant, reason: "secret-input\nsecond-line" },
    accessor,
    revoked.proxy,
  ];
  for (const value of invalid) {
    assert.throws(
      () => parseEventAccessGrantCommand(value),
      (error: unknown) =>
        error instanceof EventAccessCommandError &&
        !error.message.includes("secret-input"),
    );
  }
  assert.throws(
    () =>
      parseEventAccessRevokeCommand({
        actingActorId: "actor:event-owner",
        eventId: "event:one",
        expectedRevision: 1,
        reason: "职责结束",
        role: "check_in",
        subjectActorId: "actor:operator",
      }),
    EventAccessCommandError,
  );
});

test("event access service validates unknown input before invoking its repository", async () => {
  let calls = 0;
  const repository: EventAccessRepository = {
    async get(input) {
      calls += 1;
      return {
        ...input,
        owner: false,
        revision: 0,
        role: null,
        state: null,
      };
    },
    async grant(input) {
      calls += 1;
      return {
        eventId: input.eventId,
        owner: false,
        revision: 1,
        role: input.role,
        state: "active",
        subjectActorId: input.subjectActorId,
      };
    },
    async revoke(input) {
      calls += 1;
      return {
        eventId: input.eventId,
        owner: false,
        revision: input.expectedRevision + 1,
        role: "check_in",
        state: "revoked",
        subjectActorId: input.subjectActorId,
      };
    },
  };
  const service = createEventAccessService(repository);
  await assert.rejects(
    service.grant({ ...validGrant, role: "owner" }),
    EventAccessCommandError,
  );
  await assert.rejects(
    service.revoke({ ...validGrant }),
    EventAccessCommandError,
  );
  await assert.rejects(
    service.get({ eventId: " event:one", subjectActorId: "actor:one" }),
    EventAccessCommandError,
  );
  assert.equal(calls, 0);

  await service.grant(validGrant);
  assert.equal(calls, 1);
});
