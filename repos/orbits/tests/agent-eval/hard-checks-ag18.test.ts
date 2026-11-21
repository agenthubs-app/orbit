import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG18 (CMP area): shadow_report groups the comparison records by account and refuses a record stored
 * under another account; no_cross_account judges each read and answer by the account signed in at that moment (a
 * case that switches accounts); request_status reads the old request record in shadow mode (protocol 2).
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const base = (overrides: Partial<Observation> = {}): Observation => ({
  account: "B", accounts: { A: "user_a", B: "user_b" }, answers: [], businessChanges: [], cards: [], caseId: "AE-CMP-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
  fixtureIdOf: () => null, idMap: {}, reads: [], requests: [], unsupported: [], ...overrides,
});
const record = (owner: string | null, account: string | null, requestId: string, divergences: { field: string; old: unknown; new: unknown }[] = []) => ({ divergences, newError: null, newText: "n", oldText: "o", ownerAccount: owner, recordAccount: account, requestId });

test("shadow_report is implemented (no longer waiting for AG18)", () => {
  assert.equal(NOT_YET.shadow_report, undefined);
  assert.equal(typeof CHECKS.shadow_report, "function");
});

test("shadow_report: counts per account, divergences when asked, every record in its own account's group", () => {
  const ok = base({ shadowRecords: [record("A", "A", "r1"), record("B", "B", "r2", [{ field: "cited", new: [], old: ["x"] }])] });
  assert.equal(CHECKS.shadow_report([{ account: "A", compared: 1 }, { account: "B", compared: 1, divergences: 1 }], ok, context).status, "pass");
  assert.equal(CHECKS.shadow_report([{ account: "A", compared: 1, divergences: 1 }, { account: "B", compared: 1 }], ok, context).status, "fail");
  assert.equal(CHECKS.shadow_report([{ account: "A", compared: 2 }, { account: "B", compared: 1 }], ok, context).status, "fail");
  const crossed = base({ shadowRecords: [record("A", "B", "r3")] });
  assert.match(CHECKS.shadow_report([{ account: "A", compared: 1 }], crossed, context).detail, /stored under A/u);
  const unexpected = base({ shadowRecords: [record("A", "A", "r1"), record("B", "B", "r2")] });
  assert.equal(CHECKS.shadow_report([{ account: "A", compared: 1 }], unexpected, context).status, "fail");
  assert.equal(CHECKS.shadow_report([{ account: "A", compared: 0 }], base(), context).status, "pass");
});

test("no_cross_account: a read made while A was signed in is A's, even when the case ends signed in as B", () => {
  const reads = [{ account: "A", collection: "notes", fixtureId: "M31", productId: "note:m31", seq: 10 }, { account: "B", collection: "notes", fixtureId: "MB1", productId: "note:mb1", seq: 30 }];
  const timeline = [{ account: "A", fromSeq: 0 }, { account: "B", fromSeq: 20 }];
  assert.equal(CHECKS.no_cross_account(true, base({ accountTimeline: timeline, reads: reads as never }), context).status, "pass");
  const leak = [{ account: "A", collection: "notes", fixtureId: "M31", productId: "note:m31", seq: 25 }];
  assert.equal(CHECKS.no_cross_account(true, base({ accountTimeline: timeline, reads: leak as never }), context).status, "fail");
  // Without a timeline the old rule holds: the case's account.
  assert.equal(CHECKS.no_cross_account(true, base({ reads: [reads[0]] as never }), context).status, "fail");
  // Answers are judged against the records of the accounts other than the one signed in then.
  const byAccount = { A: [{ account: "B", fixtureId: "CB1", productId: "contact:cb1", texts: ["小林诚"] }], B: [{ account: "A", fixtureId: "C17", productId: "contact:c17", texts: ["小林健"] }] };
  const answers = [{ citations: [], seq: 12, text: "你和小林健上次聊了报价。" }, { citations: [], seq: 32, text: "小林诚要求降价。" }];
  assert.equal(CHECKS.no_cross_account(true, base({ accountTimeline: timeline, answers }), { ...context, otherAccountRecordsByAccount: byAccount }).status, "pass");
  assert.equal(CHECKS.no_cross_account(true, base({ accountTimeline: timeline, answers: [{ citations: [], seq: 32, text: "小林健" }] }), { ...context, otherAccountRecordsByAccount: byAccount }).status, "fail");
});

test("request_status in shadow mode reads the old request record (protocol 2)", () => {
  const done = base({ requests: [{ requestId: "request:1", seq: 40, state: "completed", status: 200 }] });
  assert.equal(CHECKS.request_status("completed", done, context).status, "pass");
  const failed = base({ requests: [{ requestId: "request:1", seq: 40, state: "failed_before_execution", status: 200 }] });
  assert.equal(CHECKS.request_status("completed", failed, context).status, "fail");
  assert.equal(CHECKS.request_status("completed", base(), context).status, "cannot_judge");
});
