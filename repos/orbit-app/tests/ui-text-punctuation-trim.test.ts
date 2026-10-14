import assert from "node:assert/strict";
import test from "node:test";

import { trimmedPunctuation } from "../src/components/ui/Text";

// Pairs measured on Chrome's default text-spacing-trim with the kit font stack (§19-3).
test("trims the first character of adjacent full-width punctuation pairs", () => {
  assert.deepEqual([...trimmedPunctuation("切り出し方：「話そう」。")], [5, 10]);
  assert.deepEqual([...trimmedPunctuation("（「A」）")], [0, 3]);
  assert.deepEqual([...trimmedPunctuation("あ、「い」・う")], [1, 4]);
  assert.deepEqual([...trimmedPunctuation("“「x」”")], [0, 3]);
});

test("leaves single punctuation and colon before text alone", () => {
  assert.equal(trimmedPunctuation("目標：Orbit").size, 0);
  assert.equal(trimmedPunctuation("「話す」と").size, 0);
  assert.equal(trimmedPunctuation("：；").size, 0);
  assert.equal(trimmedPunctuation("」").size, 0);
});
