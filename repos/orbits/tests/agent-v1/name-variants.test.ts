import assert from "node:assert/strict";
import test from "node:test";

import { findContacts } from "../../features/agent-v1/graph/nodes/resolve";
import { variantSpellings } from "../../features/agent-v1/text/name-variants";
import { recordAccessOf } from "./graph-kit";
import { contact } from "./read-kit";

const ACTOR = "actor:a";

test("variantSpellings: a simplified name gives its Japanese / traditional spellings; a name with no variant gives none", () => {
  assert.ok(variantSpellings("渡边飒太").includes("渡辺颯太"));
  assert.ok(variantSpellings("高桥智子").includes("高橋智子"));
  assert.deepEqual(variantSpellings("王芳"), []);
  assert.deepEqual(variantSpellings("Emily"), []);
  assert.ok(variantSpellings("渡边飒太").length <= 6);
});

test("findContacts: 「渡边飒太」 finds the contact stored as 渡辺颯太 (2026-11-23 live check), the typed spelling still wins", async () => {
  const records = recordAccessOf({ events: [], records: [
    contact(ACTOR, "contact:watanabe", "渡辺颯太", { organization: "関西飲食" }),
    contact(ACTOR, "contact:takahashi", "高橋智子", { organization: "青葉飲食" }),
    contact(ACTOR, "contact:wang", "王芳", { organization: "北辰咨询" }),
  ] });
  const scope = records.scope(ACTOR);
  for (const [said, id] of [["渡边飒太", "contact:watanabe"], ["高桥智子", "contact:takahashi"], ["渡辺颯太", "contact:watanabe"], ["王芳", "contact:wang"]]) {
    const { matches, failed } = await findContacts(records, scope, said, `${said}有什么记录？`, `${said}有什么记录？`);
    assert.equal(failed, false);
    assert.deepEqual(matches.map((match) => match.id), [id], said);
  }
  const none = await findContacts(records, scope, "渡边一郎", "渡边一郎有什么记录？", "渡边一郎有什么记录？");
  assert.equal(none.matches.length, 0);
});
