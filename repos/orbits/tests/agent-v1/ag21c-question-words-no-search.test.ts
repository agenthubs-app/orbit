/**
 * AG21c (found in the line's own visible run, AE-SCL-020, also seen in AG18's sweeps): a to-do clue the first layer copied
 * from a question ("what's still open with her") was searched by its rarest word, "with", so the person's open to-dos
 * were narrowed to those that happen to hold it. Question and function words are never search words.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { clueSearchWords, searchTokensOf } from "../../features/agent-v1/graph/nodes/resolve";

test("question and function words name nothing to search for", () => {
  for (const words of ["what's still open with her", "what is still open", "anything with him", "which ones are open"]) assert.equal(clueSearchWords(words), undefined, words);
  assert.equal(clueSearchWords("the competing offer with Aster"), "competing offer aster");
  assert.deepEqual(searchTokensOf("what's still open with her"), []);
});
