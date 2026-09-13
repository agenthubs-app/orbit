import assert from "node:assert/strict";
import test from "node:test";

import { mobileUserDisplayName } from "../src/view-models/mobile-profile";

for (const id of ["user_mry5y200_58jpi8", "user:other"]) {
  for (const [name, expected] of [["  林悦  ", "林悦"], ["  さくら  ", "さくら"], ["  Alex Chen  ", "Alex Chen"], ["  \n  ", "账号"]]) {
    test(`mobile identity uses the actual login name without an account alias: ${id} ${expected}`, () => {
      assert.equal(mobileUserDisplayName({ email: "person@example.test", id, name: name! }, "账号"), expected);
    });
  }
}

test("mobile identity has no invented name without a session or fallback", () => {
  assert.equal(mobileUserDisplayName(null), "");
  assert.equal(mobileUserDisplayName(undefined), "");
  assert.equal(mobileUserDisplayName(null, "当前账号"), "当前账号");
});
