/**
 * R16（DESIGN add-and-invite §3.3、§9 #21）：App 通讯录条目 → vCard 3.0 文本，与服务端解析器（W0053 parseVcards / parseImportFile）往返。
 * 虚构数据。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { parseImportFile } from "../../features/contacts/import/parse/index";
import { buildVcard, buildVcards, type DeviceContactEntry } from "../../shared/compute/vcard-build";

const encode = (text: string) => new TextEncoder().encode(text);
const parse = (text: string) => parseImportFile({ bytes: encode(text), kind: "vcard" });

const TANAKA: DeviceContactEntry = {
  familyName: "田中",
  givenName: "一郎",
  phoneticFamilyName: "たなか",
  phoneticGivenName: "いちろう",
  organization: "架空ソフト株式会社",
  department: "開発部",
  jobTitle: "CTO",
  emails: [{ label: "work", value: "ichiro.tanaka@example.jp" }, { label: "home", value: "ichiro@example.com" }],
  phones: [{ label: "work", value: "+81-3-0000-0000" }, { label: "mobile", value: "+81-90-1111-2222" }, { label: "home", value: "03-9999-9999" }],
  addresses: [{ label: "work", street: "丸の内 1-2-3", city: "千代田区", region: "東京都", postalCode: "100-0005", country: "Japan" }],
  urls: ["https://www.example.jp", "https://www.linkedin.com/in/ichiro-tanaka-example"],
  note: "Met at a fictional demo day.\nLikes climate tech; 経営, 投資",
};

test("round trip: name (family-first for Japanese), company, title, preferred mobile phone, first email, address country, LinkedIn, multi-line note", () => {
  const parsed = parse(buildVcard(TANAKA));
  assert.equal(parsed.rows.length, 1);
  const row = parsed.rows[0]!;
  assert.deepEqual(row.issues, []);
  assert.equal(row.fields.displayName, "田中 一郎");
  assert.equal(row.fields.organization, "架空ソフト株式会社");
  assert.equal(row.fields.role, "CTO");
  assert.equal(row.fields.email, "ichiro.tanaka@example.jp");
  assert.equal(row.fields.phone, "+81-90-1111-2222", "the server prefers the mobile number");
  assert.equal(row.fields.countryCode, "JP");
  assert.equal(row.fields.city, "千代田区");
  assert.equal(row.fields.linkedinUrl, "https://www.linkedin.com/in/ichiro-tanaka-example");
  assert.equal(row.fields.notes, "Met at a fictional demo day.\nLikes climate tech; 経営, 投資");
});

test("nothing is dropped from the text: every phone and email, the reading of the name, department", () => {
  const text = buildVcard(TANAKA);
  assert.match(text, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(text, /END:VCARD\r\n$/);
  assert.equal(text.match(/^TEL;/gmu)?.length, 3);
  assert.equal(text.match(/^EMAIL;/gmu)?.length, 2);
  assert.match(text, /^N:田中;一郎;;;$/mu);
  assert.match(text, /^X-PHONETIC-LAST-NAME:たなか$/mu);
  assert.match(text, /^X-PHONETIC-FIRST-NAME:いちろう$/mu);
  assert.match(text, /^ORG:架空ソフト株式会社;開発部$/mu);
  assert.match(text, /^TEL;TYPE=CELL:\+81-90-1111-2222$/mu);
});

test("western names are given-first; special characters are escaped and survive the round trip", () => {
  const entry: DeviceContactEntry = {
    givenName: "Chidi",
    familyName: "Okafor",
    organization: "Example Ventures, LLC; Investments",
    jobTitle: "Partner \\ Advisor",
    emails: [{ value: "chidi@example.com" }],
    phones: [],
  };
  const row = parse(buildVcard(entry)).rows[0]!;
  assert.equal(row.fields.displayName, "Chidi Okafor");
  assert.equal(row.fields.organization, "Example Ventures, LLC; Investments");
  assert.equal(row.fields.role, "Partner \\ Advisor");
});

test("display name falls back: explicit name, then family + given, then company; long lines are folded and unfold back", () => {
  assert.equal(parse(buildVcard({ displayName: "  さとう あおい  ", emails: [], phones: [] })).rows[0]!.fields.displayName, "さとう あおい");
  const companyOnly = parse(buildVcard({ organization: "架空商事", emails: [], phones: [{ value: "03-0000-0000" }] })).rows[0]!;
  assert.equal(companyOnly.fields.displayName, "架空商事");
  const long = "とても長いメモ。".repeat(40);
  const text = buildVcard({ displayName: "長い 人", note: long, emails: [], phones: [] });
  for (const line of text.split("\r\n")) assert.ok(new TextEncoder().encode(line).byteLength <= 75, `folded: ${line.slice(0, 20)}`);
  assert.equal(parse(text).rows[0]!.fields.notes, long);
});

test("an entry with nothing usable produces no card; several entries become one file the server reads in order", () => {
  assert.equal(buildVcard({ emails: [], phones: [] }), "");
  const text = buildVcards([TANAKA, { emails: [], phones: [] }, { givenName: "Avery", familyName: "Lin", emails: [{ value: "avery@example.com" }], phones: [] }]);
  const parsed = parse(text);
  assert.deepEqual(parsed.rows.map((row) => row.fields.displayName), ["田中 一郎", "Avery Lin"]);
});

// R16 复核 M2：服务端只取第一个 EMAIL、第一个 TEL（有 CELL 时取 CELL）——生成端把公司邮箱、语音号码排在前面。
test("M2 round trip: a private address listed first does not hide the company address", () => {
  const row = parse(buildVcard({ displayName: "佐藤 健", organization: "Nexa", emails: [{ label: "home", value: "ken@gmail.com" }, { label: "work", value: "ken.sato@nexa.co.jp" }], phones: [] })).rows[0]!;
  assert.equal(row.fields.email, "ken.sato@nexa.co.jp");
});

test("M2 round trip: an unlabeled company-domain address beats a labeled free-mail one; label order is kept otherwise", () => {
  const row = parse(buildVcard({ displayName: "A", emails: [{ label: "other", value: "a@yahoo.co.jp" }, { value: "a@corp.example" }], phones: [] })).rows[0]!;
  assert.equal(row.fields.email, "a@corp.example");
  const text = buildVcard({ displayName: "B", emails: [{ label: "home", value: "b1@gmail.com" }, { label: "home", value: "b2@icloud.com" }], phones: [] });
  assert.ok(text.indexOf("b1@gmail.com") < text.indexOf("b2@icloud.com"), "stable order among equals");
  assert.equal(text.match(/^EMAIL;/gmu)?.length, 2, "nothing is dropped");
});

test("M2 round trip: a fax listed first is not stored as the phone; a work line comes before home when there is no mobile", () => {
  const fax = parse(buildVcard({ displayName: "B", emails: [], phones: [{ label: "work fax", value: "03-1" }, { label: "work", value: "03-2" }] })).rows[0]!;
  assert.equal(fax.fields.phone, "03-2");
  const home = parse(buildVcard({ displayName: "C", emails: [], phones: [{ label: "home", value: "03-9" }, { label: "work", value: "03-8" }] })).rows[0]!;
  assert.equal(home.fields.phone, "03-8");
  const onlyFax = parse(buildVcard({ displayName: "D", emails: [], phones: [{ label: "fax", value: "03-7" }] })).rows[0]!;
  assert.equal(onlyFax.fields.phone, "03-7", "a fax is still kept when it is the only number");
});

// R16 复核 m5：没有名字的条目不被挡下；名字里的换行折成空格。
test("m5: no name → reading, then the email's local part; a line break in the name becomes a space", () => {
  const phonetic = parse(buildVcard({ phoneticFamilyName: "たなか", phoneticGivenName: "いちろう", emails: [], phones: [{ value: "1" }] })).rows[0]!;
  assert.equal(phonetic.fields.displayName, "たなか いちろう");
  assert.ok(!phonetic.issues.includes("missing_name" as never));
  const email = parse(buildVcard({ emails: [{ value: "x.yamada@corp.example" }], phones: [] })).rows[0]!;
  assert.equal(email.fields.displayName, "x.yamada");
  const cr = parse(buildVcard({ displayName: "C\rD", emails: [], phones: [] })).rows[0]!;
  assert.equal(cr.fields.displayName, "C D");
});
