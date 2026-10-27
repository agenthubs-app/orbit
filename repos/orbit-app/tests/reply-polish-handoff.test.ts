import assert from "node:assert/strict";
import test from "node:test";
import { beginReplyPolish, chooseReplyPolish, replyPolishTarget, takeReplyPolish } from "../src/data/reply-polish-handoff";

test("QA-C4: only the iOrbit thread started by Polish offers a version back, and only to that conversation", () => {
  beginReplyPolish("conv-1", "Please polish this draft ", 1_000);
  assert.equal(replyPolishTarget("Please polish this draft", 2_000), "conv-1");
  assert.equal(replyPolishTarget("Who should I meet?", 2_000), null);
  assert.equal(replyPolishTarget("Please polish this draft", 1_000 + 61 * 60 * 1000), null);

  chooseReplyPolish("conv-1", "  QA-C3 — got it, I'll send the deck Monday night.  ");
  assert.equal(replyPolishTarget("Please polish this draft", 2_000), null);
  assert.equal(takeReplyPolish("conv-2"), null);
  assert.equal(takeReplyPolish("conv-1"), "QA-C3 — got it, I'll send the deck Monday night.");
  assert.equal(takeReplyPolish("conv-1"), null);
});
