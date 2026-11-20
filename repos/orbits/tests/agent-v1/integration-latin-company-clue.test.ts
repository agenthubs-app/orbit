import assert from "node:assert/strict";
import { test } from "node:test";

import { findContacts } from "../../features/agent-v1/graph/nodes/resolve";
import { fnWorld } from "./functions-kit";
import { recordAccessOf } from "./graph-kit";

/**
 * Integration after AG21a (AE-CTX-003 in AG21a's run): a contact clue 「Harbor Analytics」 named no one as written, and the
 * romanized-name pass (AG07) paged through every contact before the company lookup — the case's private_reads_within failed.
 * Words in Latin letters are tried as a company first; a romanized name ("Li Wei") still finds 李薇.
 */

function counted() {
  const access = recordAccessOf(fnWorld());
  const queries: Record<string, unknown>[] = [];
  const reader = access.reader;
  access.reader = { ...reader, read: async (kind, scope, query) => { if (kind === "contact") queries.push({ ...(query as Record<string, unknown>) }); return reader.read(kind, scope, query); } } as typeof reader;
  return { access, queries };
}

const scopeOf = (access: ReturnType<typeof recordAccessOf>) => access.scope("actor:a");

for (const clue of ["Harbor Analytics", "Harbor Analytics 的人"]) {
  test(`「${clue}」 (the clue of AE-CTX-003): found by company, and no contact page is read without words`, async () => {
    const { access, queries } = counted();
    const message = "Harbor Analytics 的人最近有什么动静？";
    const { matches } = await findContacts(access, scopeOf(access), clue, message, message);
    assert.deepEqual(matches.map((match) => [match.name, match.byCompany]), [["Emily Carter", true]]);
    assert.ok(queries.every((query) => typeof query.text === "string" && query.text), `every contact read has words: ${JSON.stringify(queries)}`);
  });
}

test("a romanized name still finds the contact whose name is Chinese characters", async () => {
  const { access } = counted();
  const { matches } = await findContacts(access, scopeOf(access), "Li Wei", "Li Wei 最近怎么样？", "Li Wei 最近怎么样？");
  assert.deepEqual(matches.map((match) => match.name), ["李薇"]);
});
