import assert from "node:assert/strict";
import test from "node:test";

import { topicWordsOf } from "../../features/agent-v1/functions/basis";

/**
 * agent-design AG13 repair round 5 (AE-JDG-002, AG08 rerun at AG13 run-05): "at least one recorded interaction" came as the
 * ranking basis and code asked the judgment about each of 50 contacts. It is a hard condition code holds (ordered by the
 * last interaction, a contact without one is left out), not a topic.
 */

test("words of 'has at least one interaction' are no topic (en, zh, ja)", () => {
  for (const words of [
    "at least one recorded interaction",
    "at least one recorded interaction with",
    "Of the contacts I have at least one recorded interaction with",
    "至少有过一次往来的",
    "有往来记录的",
    "やり取りが1回以上ある",
    "やり取りの記録がある",
  ]) assert.equal(topicWordsOf(words), "", words);
});

test("'at least one' in other phrasing is kept as topic words", () => {
  assert.match(topicWordsOf("contacts with at least one design project"), /design project/u);
  assert.match(topicWordsOf("at least one ceramics fair"), /ceramics fair/u);
  assert.match(topicWordsOf("至少参加过一次陶艺展的"), /陶艺展/u);
  assert.match(topicWordsOf("聊柴烧器物"), /聊柴烧器物/u);
});
