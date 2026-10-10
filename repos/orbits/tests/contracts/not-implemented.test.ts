import assert from "node:assert/strict";
import test from "node:test";

import { failure } from "../../shared/api/envelope";
import { isNotImplemented, whenNotImplemented } from "../../shared/compute/not-implemented";
import { AppError } from "../../shared/errors/app-error";

// R08 (SC-R08-06): recognise 「尚未実装」 and choose default or hidden.
const notImplemented = failure(new AppError("SERVICE_UNAVAILABLE", "x"), { capabilityId: "home-layout", reason: "NOT_IMPLEMENTED", requestedMode: "live" });

test("recognises the envelope and an unwrapped error, and nothing else", () => {
  assert.equal(isNotImplemented(notImplemented), true);
  assert.equal(isNotImplemented(notImplemented.error), true);
  assert.equal(isNotImplemented(failure(new AppError("SERVICE_UNAVAILABLE", "down"))), false, "a real outage is not 「尚未実装」");
  assert.equal(isNotImplemented(failure(new AppError("NOT_FOUND", "x"), { reason: "NOT_IMPLEMENTED" })), false);
  for (const value of [null, undefined, "NOT_IMPLEMENTED", 503, { success: true, data: {} }]) assert.equal(isNotImplemented(value), false);
});

test("chooses a default or hides the entry; null when it is a normal answer", () => {
  assert.deepEqual(whenNotImplemented(notImplemented, { use: "default", value: 0 }), { show: true, value: 0 });
  assert.deepEqual(whenNotImplemented(notImplemented, { use: "hide" }), { show: false });
  assert.equal(whenNotImplemented({ success: true, data: 1 }, { use: "hide" }), null);
});
