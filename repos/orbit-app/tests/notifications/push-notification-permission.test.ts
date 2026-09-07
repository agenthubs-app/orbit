import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldRegisterPushToken,
  shouldRequestPushPermission
} from "../../src/notifications/push-policy";

test("signed-in notification lifecycle does not request undetermined permission before explicit opt-in", () => {
  assert.equal(shouldRequestPushPermission("undetermined", false), false);
  assert.equal(shouldRequestPushPermission("denied", false), false);
  assert.equal(shouldRequestPushPermission("undetermined", true), true);
  assert.equal(shouldRequestPushPermission("granted", false), false);
  assert.equal(shouldRegisterPushToken("granted", false), false);
  assert.equal(shouldRegisterPushToken("granted", true), true);
});
