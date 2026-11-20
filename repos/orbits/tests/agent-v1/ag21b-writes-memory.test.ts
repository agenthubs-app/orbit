import assert from "node:assert/strict";
import test from "node:test";

import { importTableOf, previewImport, withHeader } from "../../features/agent-v1/domains/contact/import-preview";
import { boundContactReader } from "../../features/agent-v1/domains/contact/types";
import { reviseImportByWords } from "../../features/agent-v1/entry/import-revision";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { contactWorld, memoryContactAccess } from "./contact-kit";
import { contact } from "./read-kit";

/**
 * agent-design AG21b (independent suite, final run: R27–R43, writes and memory). This line's own sentences, not the suite's.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-20T01:00:00.000Z";

function withShinan() {
  return contactWorld((records) => {
    records.push(contact(ACTOR, "contact:sn", "石楠", { organization: "白鹭印务", primaryEmail: "shinan@example.test", role: "印务主管" }));
  });
}

const NUMBERED = "帮我导入这几位：\n1. 石楠，白鹭印务，shinan@example.test\n2. （名字忘了），柏舟设计，010-0000-0000\n3. 季朗，柏舟设计，项目经理";

test("R27 a numbered list with no header: markers off, each cell typed by its own shape, a placeholder name is no name", async () => {
  const table = importTableOf(NUMBERED)!;
  const existing = await memoryContactAccess(withShinan()).listActive(ACTOR);
  const preview = previewImport(table, existing, ACTOR);
  assert.deepEqual(preview.rows.map((row) => [row.row, row.name, row.organization, row.role, row.decision, row.reason ?? null]), [
    [1, "石楠", "白鹭印务", "", "duplicate", null],
    [2, "", "柏舟设计", "", "skip", "missing_name"],
    [3, "季朗", "柏舟设计", "项目经理", "create", null],
  ]);
  assert.equal(preview.rows[0].match?.id, "contact:sn", "the row whose e-mail and name match the existing contact");
  // Other markers and shapes; a column that mixes e-mails, phones and titles is typed per cell.
  const mixed = previewImport(withHeader("- 林小雨,青柠童书,lin@example.test\n2) 森田葵,东和商事,+81 90 1234 5678\n・王强,远帆物流,运营经理\n?,无名公司,实习生"), [], ACTOR);
  assert.deepEqual(mixed.rows.map((row) => [row.name, row.organization, row.role, row.reason ?? null]), [["林小雨", "青柠童书", "", null], ["森田葵", "东和商事", "", null], ["王强", "远帆物流", "运营经理", null], ["", "无名公司", "实习生", "missing_name"]]);
  assert.equal(withHeader(withHeader(table)), withHeader(table), "the header code writes is read back as a header");
});

function ledgerOver(world: ReturnType<typeof contactWorld>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  return createAgentRuntimeService({ cardReader: { read: async () => null, contacts: boundContactReader(memoryContactAccess(world), ACTOR) }, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
}

test("R27 a revision that sets a row to the decision it already has says so and leaves the card as it is", async () => {
  const world = withShinan();
  const runtime = ledgerOver(world);
  await runtime.freezeCard!({ actionId: "card:imp", intents: [{ capability: "contact.import", overrides: {}, text: importTableOf(NUMBERED)! }], locale: "zh", origin: { conversationId: "session:a", kind: "conversation", requestId: "req:imp" } });
  const same = await reviseImportByWords({ actorId: ACTOR, message: "第3行也新建", now: () => NOW, runtime, sessionId: "session:a", store: null });
  assert.ok(same);
  assert.match(same!.text, /第3行本来就是新增/u);
  assert.doesNotMatch(same!.text, /改为新建/u);
  assert.equal(same!.actionPreview?.revision, 1, "no new revision");
  const mixed = await reviseImportByWords({ actorId: ACTOR, message: "第1行和第3行都新建", now: () => NOW, runtime, sessionId: "session:a", store: null });
  assert.match(mixed!.text, /第1行改为新建/u);
  assert.match(mixed!.text, /第3行本来就是新增/u);
  assert.equal(mixed!.actionPreview?.revision, 2);
});
