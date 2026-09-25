import assert from "node:assert/strict";
import test from "node:test";

import { firstAgentLedgerEntryId } from "../src/view-models/agent-ledger-route";

test("agent ledger entry query keeps the first exact identifier", () => {
  assert.equal(firstAgentLedgerEntryId("action:one"), "action:one");
  assert.equal(
    firstAgentLedgerEntryId(["action:one", "action:other-account"]),
    "action:one"
  );
});

test("agent ledger entry query ignores missing and empty values", () => {
  assert.equal(firstAgentLedgerEntryId(undefined), undefined);
  assert.equal(firstAgentLedgerEntryId([]), undefined);
  assert.equal(firstAgentLedgerEntryId([""]), undefined);
});
