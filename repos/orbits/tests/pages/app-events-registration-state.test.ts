import assert from "node:assert/strict";
import test from "node:test";

import {
  eventCardActionKind,
  eventScopeFromValues,
  eventScopeSearchString,
} from "../../app/(app)/app/events/orbit-real-explore-client";

test("registered event actions are consistent across lifecycle states", () => {
  assert.equal(eventCardActionKind("upcoming", true), "manage");
  assert.equal(eventCardActionKind("active", true), "enter");
  assert.equal(eventCardActionKind("ended", true), "view");
  assert.equal(eventCardActionKind("upcoming", false), "register");
  assert.equal(eventCardActionKind("active", false), "register");
  assert.equal(eventCardActionKind("ended", false), "view");
  assert.equal(
    eventCardActionKind("upcoming", false, "registration_closed"),
    "view",
  );
  assert.equal(
    eventCardActionKind("active", false, "unavailable"),
    "view",
  );
});

test("event scope has one URL source across registered and lifecycle transitions", () => {
  assert.equal(eventScopeFromValues(["registered"]), "registered");
  assert.equal(eventScopeFromValues(["registered", "upcoming"]), "all");
  assert.equal(eventScopeFromValues([]), "all");

  for (const lifecycle of ["upcoming", "active", "ended"] as const) {
    const query = eventScopeSearchString(
      lifecycle,
      "scope=registered&language=zh",
    );
    const params = new URLSearchParams(query);
    assert.deepEqual(params.getAll("scope"), [lifecycle]);
    assert.equal(params.get("language"), "zh");
  }

  assert.equal(
    eventScopeSearchString("all", "scope=registered&language=zh"),
    "language=zh",
  );
});
