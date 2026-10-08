/**
 * W0053 SC-W0053-01（解析，纯函数，夹具驱动）：LinkedIn Connections.csv、带 BOM 的 UTF-8、Shift_JIS、UTF-16LE、
 * 字段内换行与转义引号、中／英／日同义词表头与用户改对应、vCard 2.1（QP + CHARSET）／3.0／4.0 多卡文件；
 * 超出 W53-3 上限在读完前拒绝；坏行带原因不阻塞其余行。夹具全部为虚构数据。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CONTACT_IMPORT_MAX_BYTES, CONTACT_IMPORT_MAX_ROWS } from "../../features/contacts/import/limits";
import { parseCsv } from "../../features/contacts/import/parse/csv";
import { ContactImportFileRejected, parseImportFile } from "../../features/contacts/import/parse/index";
import { autoMapping, normalizeCsvRow, sanitizeMapping } from "../../features/contacts/import/parse/mapping";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/contact-import/${name}`, import.meta.url)));
const utf8 = (text: string) => new TextEncoder().encode(text);

test("LinkedIn Connections.csv: notes preamble skipped, names joined (CJK family-first), empty email kept empty, quoted commas/quotes intact, nameless row flagged but not blocking", () => {
  const parsed = parseImportFile({ bytes: fixture("linkedin-connections.csv"), kind: "csv" });
  assert.equal(parsed.format, "linkedin");
  assert.equal(parsed.encoding, "utf-8");
  assert.deepEqual(parsed.headers, ["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"]);
  assert.equal(parsed.rows.length, 4);
  const [avery, aoi, jordan, nameless] = parsed.rows;
  assert.deepEqual(
    { ...avery!.fields },
    {
      connectedOn: "05 Jan 2024", displayName: "Avery Lin", email: "avery.lin@example.com", linkedinUrl: "https://www.linkedin.com/in/avery-lin-example",
      location: "", notes: "", organization: "Northwind Labs", phone: "", role: "Head of Partnerships",
    },
  );
  assert.deepEqual(avery!.issues, []);
  assert.equal(aoi!.fields.displayName, "佐藤 葵");
  assert.equal(aoi!.fields.email, "");
  assert.equal(aoi!.fields.organization, "Sakura Systems, Inc.");
  assert.equal(jordan!.fields.role, 'VP, Sales "APAC"');
  assert.deepEqual(nameless!.issues, ["missing_name"]);
  assert.ok(nameless!.cells, "CSV rows keep raw cells for remapping");
});

test("BOM UTF-8 generic CSV with Chinese headers; UTF-16LE with English headers; Shift_JIS with Japanese headers and an in-field newline", () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("姓名,公司,职位,邮箱,手机号,地址,国家\n王 芳,示例咨询,合伙人,WANG.Fang@Example.cn,138 0000 0000,上海市,中国\n")]);
  const zh = parseImportFile({ bytes: bom, kind: "csv" });
  assert.equal(zh.format, "generic");
  assert.equal(zh.encoding, "utf-8");
  assert.deepEqual(zh.rows[0]!.fields, {
    connectedOn: "", countryCode: "CN", displayName: "王 芳", email: "wang.fang@example.cn", linkedinUrl: "", location: "上海市", notes: "",
    organization: "示例咨询", phone: "138 0000 0000", role: "合伙人",
  });

  const english = "Full Name,Company Name,Job Title,E-mail,Phone Number,Notes\r\nSam Patel,Fabrikam,Engineer,sam@example.com,+1 555 0100,\"line one\r\nline two\"\r\n";
  const utf16 = new Uint8Array([0xff, 0xfe, ...new Uint8Array(Buffer.from(english, "utf16le"))]);
  const en = parseImportFile({ bytes: utf16, kind: "csv" });
  assert.equal(en.encoding, "utf-16le");
  assert.equal(en.rows[0]!.fields.displayName, "Sam Patel");
  assert.equal(en.rows[0]!.fields.role, "Engineer");
  assert.equal(en.rows[0]!.fields.notes, "line one\nline two");

  const ja = parseImportFile({ bytes: fixture("generic-ja-sjis.csv"), kind: "csv" });
  assert.equal(ja.encoding, "shift_jis");
  assert.deepEqual(ja.headers, ["氏名", "会社名", "役職", "メールアドレス", "電話番号", "住所"]);
  assert.equal(ja.rows.length, 2);
  assert.equal(ja.rows[0]!.fields.displayName, "山田 太郎");
  assert.equal(ja.rows[0]!.fields.organization, "架空商事株式会社");
  assert.equal(ja.rows[0]!.fields.location, "東京都千代田区");
  assert.equal(ja.rows[1]!.fields.role, "企画\n担当", "newline inside a quoted field survives");
});

test("RFC 4180 edge cases: escaped quotes, CR-only line breaks, blank records skipped, unquoted quote kept literally", () => {
  assert.deepEqual(parseCsv('a,"b ""c"" d",e\r\r\n,,\n1,2"3,4\r5,6', { maxRecords: 10 }), [["a", 'b "c" d', "e"], ["1", '2"3', "4"], ["5", "6"]]);
});

test("user remapping: sanitizeMapping rejects unknown keys and out-of-range columns; remapped row recomputes fields", () => {
  const headers = ["Col A", "Col B", "Col C"];
  assert.deepEqual(Object.values(autoMapping(headers)).filter((value) => value !== null), []);
  assert.equal(sanitizeMapping({ bogus: 0 }, 3), null);
  assert.equal(sanitizeMapping({ name: 3 }, 3), null);
  const mapping = sanitizeMapping({ email: 2, name: 0, organization: 1 }, 3)!;
  const row = normalizeCsvRow(["Lee Min", "Globex", "not-an-email"], mapping);
  assert.equal(row.fields.displayName, "Lee Min");
  assert.equal(row.fields.organization, "Globex");
  assert.equal(row.fields.email, "");
  assert.deepEqual(row.issues, ["invalid_email"]);
});

test("vCard 2.1 (QP soft breaks, UTF-8 and Shift_JIS charsets) / 3.0 (escapes, grouped URL) / 4.0 (tel: URI, folded NOTE) in one file; nameless card flagged", () => {
  const parsed = parseImportFile({ bytes: fixture("contacts-mixed.vcf"), kind: "vcard" });
  assert.equal(parsed.format, "vcard");
  assert.equal(parsed.mapping, null);
  assert.equal(parsed.rows.length, 4);
  const [tanaka, chidi, li, nameless] = parsed.rows.map((row) => row.fields);
  assert.equal(tanaka!.displayName, "田中 一郎");
  assert.equal(tanaka!.organization, "架空ソフト株式会社");
  assert.equal(tanaka!.role, "CTO");
  assert.equal(tanaka!.phone, "+81-90-1111-2222", "CELL preferred over WORK");
  assert.equal(tanaka!.email, "ichiro.tanaka@example.jp");
  assert.equal(tanaka!.location, "1-2-3 Marunouchi, Tokyo, 100-0005, Japan");
  assert.equal(tanaka!.countryCode, "JP");
  assert.equal(tanaka!.city, "Tokyo");
  assert.equal(chidi!.organization, "Example Ventures, LLC");
  assert.equal(chidi!.notes, "Met at a fictional demo day.\nLikes climate tech.");
  assert.equal(chidi!.linkedinUrl, "https://www.linkedin.com/in/chidi-okafor-example");
  assert.equal(chidi!.countryCode, "US");
  assert.equal(li!.displayName, "李 小明");
  assert.equal(li!.phone, "+86-21-5555-0000");
  assert.equal(li!.countryCode, "CN");
  assert.equal(li!.notes, "This note is folded across two lines and continues here.");
  assert.equal(nameless!.email, "no-name@example.com");
  assert.deepEqual(parsed.rows[3]!.issues, ["missing_name"]);
  assert.deepEqual(parsed.rows.slice(0, 3).map((row) => row.issues), [[], [], []]);
});

test("W53-3 limits: oversize bytes and more than 2,000 rows are rejected; the CSV reader stops early instead of parsing everything", () => {
  assert.throws(() => parseImportFile({ bytes: new Uint8Array(CONTACT_IMPORT_MAX_BYTES + 1), kind: "csv" }), (error: unknown) => error instanceof ContactImportFileRejected && error.reason === "too_large");
  const header = "Name,Email\n";
  const exactly = header + Array.from({ length: CONTACT_IMPORT_MAX_ROWS }, (_, index) => `P${index},p${index}@example.com`).join("\n");
  assert.equal(parseImportFile({ bytes: utf8(exactly), kind: "csv" }).rows.length, CONTACT_IMPORT_MAX_ROWS);
  const over = exactly + "\nOne More,more@example.com";
  assert.throws(() => parseImportFile({ bytes: utf8(over), kind: "csv" }), (error: unknown) => error instanceof ContactImportFileRejected && error.reason === "too_many_rows");
  // 远超上限的文件：解析器在上限 + 余量处停止（抛错），不会生成上万行。
  const huge = header + Array.from({ length: 50_000 }, (_, index) => `P${index},x`).join("\n");
  assert.throws(() => parseCsv(huge, { maxRecords: CONTACT_IMPORT_MAX_ROWS + 50 }), /more than 2050 records/);
  const cards = Array.from({ length: CONTACT_IMPORT_MAX_ROWS + 1 }, (_, index) => `BEGIN:VCARD\nFN:P${index}\nEND:VCARD`).join("\n");
  assert.throws(() => parseImportFile({ bytes: utf8(cards), kind: "vcard" }), (error: unknown) => error instanceof ContactImportFileRejected && error.reason === "too_many_rows");
});

test("whole-file rejections: undecodable bytes, empty file, a .vcf without cards", () => {
  assert.throws(() => parseImportFile({ bytes: new Uint8Array([0x81, 0x00, 0xff, 0xff]), kind: "csv" }), (error: unknown) => error instanceof ContactImportFileRejected && error.reason === "undecodable");
  assert.throws(() => parseImportFile({ bytes: utf8("  \n"), kind: "csv" }), (error: unknown) => error instanceof ContactImportFileRejected && error.reason === "empty");
  assert.throws(() => parseImportFile({ bytes: utf8("Name\nA"), kind: "vcard" }), (error: unknown) => error instanceof ContactImportFileRejected && error.reason === "not_vcard");
});

test("review P2-2: an unclosed quote does not swallow the following rows — the broken row is marked malformed (blocking) and parsing resumes on the next line", async () => {
  const { MAX_LINES_PER_RECORD } = await import("../../features/contacts/import/parse/csv");
  const good = Array.from({ length: MAX_LINES_PER_RECORD + 5 }, (_, i) => `Good ${i},good${i}@example.com`).join("\n");
  // 文件末尾仍未闭合，和跨过行数上限，两种情况都要恢复。
  for (const tail of ["", "\nLast One,last@example.com"]) {
    const text = `Name,Email\nAnn Lee,ann@example.com\nBad "Row,"unclosed@example.com\n${good}${tail}\n`;
    const parsed = parseImportFile({ bytes: utf8(text), kind: "csv" });
    const names = parsed.rows.map((row) => row.fields.displayName);
    assert.equal(names[0], "Ann Lee");
    assert.deepEqual(parsed.rows[1]!.issues.includes("malformed_row"), true, "broken row flagged");
    assert.deepEqual(names.slice(2, 4), ["Good 0", "Good 1"], "rows after the broken one are parsed normally");
    assert.equal(parsed.rows.filter((row) => row.issues.length === 0).length, MAX_LINES_PER_RECORD + 6 + (tail ? 1 : 0));
  }
  const atEnd = parseImportFile({ bytes: utf8('Name,Email\nOk,ok@example.com\nX,"never closed\nY,y@example.com\n'), kind: "csv" });
  assert.deepEqual(atEnd.rows.map((row) => [row.fields.displayName, row.issues.includes("malformed_row")]), [["Ok", false], ["X", true], ["Y", false]]);
  // 合法的多行引号字段不受影响
  assert.equal(parseImportFile({ bytes: utf8('Name,Notes\nZed,"a\nb\nc"\n'), kind: "csv" }).rows[0]!.fields.notes, "a\nb\nc");
});

test("review P2-1: the streaming record counter sees complete records chunk by chunk (CSV quotes and blank lines, UTF-16, vCard END markers)", async () => {
  const { createStreamingRecordCounter, CSV_STREAM_RECORD_LIMIT } = await import("../../features/contacts/import/parse/stream-limit");
  assert.equal(CSV_STREAM_RECORD_LIMIT, CONTACT_IMPORT_MAX_ROWS + 3);
  const csv = createStreamingRecordCounter("csv");
  const bytes = utf8('Name,Notes\n,,\n\nA,"multi\nline"\nB,x\nC');
  let count = 0;
  for (let i = 0; i < bytes.length; i += 3) count = csv.feed(bytes.subarray(i, i + 3));
  assert.equal(count, 3, "header, A and B are complete; blank and comma-only lines skipped; C not finished");
  const utf16 = createStreamingRecordCounter("csv");
  assert.equal(utf16.feed(new Uint8Array([0xff, 0xfe, ...Buffer.from("Name\r\nA\r\nB\r\n", "utf16le")])), 3);
  const vcard = createStreamingRecordCounter("vcard");
  const cards = utf8("BEGIN:VCARD\nFN:a\nEND:VCARD\nbegin:vcard\nFN:b\nend:vcard\n");
  let cardCount = 0;
  for (const byte of cards) cardCount = vcard.feed(new Uint8Array([byte]));
  assert.equal(cardCount, 2);
});
