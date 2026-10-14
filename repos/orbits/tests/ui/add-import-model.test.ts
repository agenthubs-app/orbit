import assert from "node:assert/strict";
import test from "node:test";

import { zipSync, strToU8 } from "fflate";

import type { ContactImportRowView } from "../../shared/contract/contact-import";
import { prepareImportFile } from "../../app/(app)/app/orbit-2026/add/import/import-api";
import {
  addCount,
  commitPlan,
  defaultMergeChoice,
  exceptionCount,
  fieldFill,
  mappingColumns,
  remap,
  serverSkipped,
  splitDisplayName,
  splitImportRows,
} from "../../app/(app)/app/orbit-2026/add/import/import-model";

function row(seq: number, patch: Partial<ContactImportRowView> = {}, fields: Partial<ContactImportRowView["fields"]> = {}): ContactImportRowView {
  return {
    seq, issues: [], inFileDuplicateOf: null, candidate: null, decision: "create", mergeIntoContactId: null, status: "pending", contactId: null,
    fields: { displayName: `p${seq}`, organization: "", role: "", email: "", phone: "", location: "", linkedinUrl: "", connectedOn: "", notes: "", ...fields }, ...patch,
  };
}
const candidate = (identical: boolean, organization = "", displayName = "森 恭平") => ({ contactId: `c${displayName}`, displayName, organization, role: "", email: "", phone: "", address: "", matchedOn: ["email" as const], identical });

const rows = [
  row(1, { candidate: candidate(true), decision: "merge" }),
  row(2, { candidate: candidate(false, "北辰製作所", "鈴木 大輔"), decision: null }, { displayName: "鈴木 大輔", organization: "Hokushin" }),
  row(3, { candidate: candidate(false, "東都キャピタル", "山本 彩"), decision: null }, { displayName: "山本 彩", organization: "Sakura Growth" }),
  row(4, { issues: ["invalid_email"] }),
  row(5, { issues: ["missing_name"], decision: "skip" }, { displayName: "" }),
  row(6, { inFileDuplicateOf: 4, decision: "skip" }),
  row(7),
  row(8, { status: "created" }),
];

test("まとめて確認 split: identical = auto-merged, other candidates = 重複, issues / in-file / unreadable = 要確認, committed rows left out", () => {
  const split = splitImportRows(rows);
  assert.equal(split.total, 7);
  assert.deepEqual(split.autoMerged.map((entry) => entry.seq), [1]);
  assert.deepEqual(split.duplicates.map((entry) => entry.seq), [2, 3]);
  assert.deepEqual(split.groups.map((entry) => [entry.group, entry.rows.map((item) => item.seq)]), [["email", [4]], ["inFile", [6]], ["blocked", [5]]]);
  assert.deepEqual(split.asIs.map((entry) => entry.seq), [7]);
  assert.equal(exceptionCount(split), 6);
  // 人脈に追加 counts what goes in: the two duplicates, the email row, the plain row (not auto-merged, not unreadable / repeated).
  assert.equal(addCount(split), 4);
  assert.equal(addCount(split, new Set([7])), 3);
});

test("duplicates: a different company with the same name is a probable job change — unticked by default (DESIGN §2.7)", () => {
  const split = splitImportRows(rows);
  assert.deepEqual(defaultMergeChoice(split.duplicates), { 2: false, 3: false });
  const sameName = row(9, { candidate: candidate(false, "", "Sho Watanabe"), decision: null }, { displayName: "渡辺 翔" });
  assert.deepEqual(defaultMergeChoice([sameName]), { 9: true });
});

test("全部加入: every merge is confirmed one by one (no MERGE_NOT_CONFIRMED), skipped rows skip, only changed decisions are sent", () => {
  const plan = commitPlan(rows, { 2: true, 3: false }, new Set([7]));
  assert.deepEqual(plan.decisions, [{ seq: 2, decision: "merge" }, { seq: 3, decision: "create" }, { seq: 7, decision: "skip" }]);
  assert.deepEqual(plan.mergeConfirmations, [{ seq: 1, contactId: "c森 恭平" }, { seq: 2, contactId: "c鈴木 大輔" }]);
});

test("列の対応: columns follow the file, a remap moves the field off its old column, ほぼ空 under a fifth, 名 / 姓 come back out of the joined name", () => {
  const mapping = { name: null, firstName: 0, lastName: 1, organization: 2, role: null, email: 3, phone: null, location: null, country: null, linkedinUrl: null, connectedOn: null, notes: null };
  assert.deepEqual(mappingColumns({ headers: ["First Name", "Last Name", "Company", "Email", "Extra"], mapping }).map((column) => column.field), ["firstName", "lastName", "organization", "email", null]);
  const moved = remap(mapping, 4, "organization");
  assert.equal(moved.organization, 4);
  assert.equal(remap(moved, 4, null).organization, null);
  const many = Array.from({ length: 10 }, (_, index) => row(index + 1, {}, { email: index === 0 ? "a@b.co" : "" }));
  assert.deepEqual(fieldFill(many, "email"), { filled: 1, total: 10, sparse: true });
  assert.deepEqual(splitDisplayName("森 恭平"), { last: "森", first: "恭平" });
  assert.deepEqual(splitDisplayName("Kyohei Mori"), { first: "Kyohei", last: "Mori" });
});

test("LinkedIn ZIP: Connections.csv is taken out of the ZIP; a ZIP without it says so; other files are refused", async () => {
  const zip = zipSync({ "Basic_LinkedInDataExport/Connections.csv": strToU8("First Name,Last Name\nKyohei,Mori\n"), "Basic_LinkedInDataExport/Messages.csv": strToU8("x") });
  const file = (bytes: Uint8Array | string, name: string) => new File([typeof bytes === "string" ? bytes : bytes.slice().buffer], name);
  const ok = await prepareImportFile(file(zip, "export.zip"), "csv");
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.name, "Connections.csv");
  assert.equal(ok.ok && (await ok.blob.text()).startsWith("First Name"), true);
  const none = await prepareImportFile(file(zipSync({ "a.csv": strToU8("x"), "b.csv": strToU8("y") }), "x.zip"), "csv");
  assert.deepEqual(none, { ok: false, reason: "zipNoCsv" });
  assert.deepEqual(await prepareImportFile(file("x", "photo.png"), "csv"), { ok: false, reason: "wrongType" });
  assert.deepEqual(await prepareImportFile(file("x", "a.csv"), "vcard"), { ok: false, reason: "wrongType" });
});

test("復核 S1 / S2: イベントから people already in 人脈 merge (never created again); rows the server already skipped stay skipped", () => {
  const event = [
    row(1, { decision: "merge", mergeIntoContactId: "c-known" }),
    row(2, { decision: "skip" }),
    row(3),
  ];
  const split = splitImportRows(event);
  assert.deepEqual(split.autoMerged.map((entry) => entry.seq), [1]);
  const skipped = serverSkipped(event);
  assert.deepEqual([...skipped], [2]);
  assert.equal(addCount(split, skipped), 1);
  const plan = commitPlan(event, {}, skipped);
  assert.deepEqual(plan.decisions, []);
  assert.deepEqual(plan.mergeConfirmations, [{ seq: 1, contactId: "c-known" }]);
});
