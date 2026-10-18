import assert from "node:assert/strict";
import test from "node:test";

import { supportEmail } from "../../shared/config/support";

test("public support contact starts unconfigured", () => {
  assert.equal(supportEmail, null);
});
