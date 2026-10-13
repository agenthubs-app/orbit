import assert from "node:assert/strict";
import test from "node:test";

import { splitSignature, type SignatureField, type SignatureSpan } from "../../shared/compute/signature-split";

// R12（DESIGN §2.3 Web 抽屉「メールの署名を貼り付けると、項目に分けます」，§9 #13：规则，不调 AI）。
type Expected = Partial<Record<SignatureField, string | string[]>>;

function fields(spans: readonly SignatureSpan[]): Expected {
  const out: Record<string, string | string[]> = {};
  for (const span of spans) {
    const previous = out[span.field];
    out[span.field] = previous === undefined ? span.value : [...(Array.isArray(previous) ? previous : [previous]), span.value];
  }
  return out;
}

const cases: readonly [string, string, Expected][] = [
  ["ja board (b9 A4 Web): a bare 代表 after the company on the same line is the role", [
    "石川 陽介",
    "石川デザイン事務所　代表",
    "〒150-0001 東京都渋谷区神宮前 2-x-x",
    "TEL 03-5555-0198　Mail ishikawa@ishikawa-d.example",
  ].join("\n"), {
    displayName: "石川 陽介", organization: "石川デザイン事務所", role: "代表", postalCode: "150-0001",
    address: "東京都渋谷区神宮前 2-x-x", phone: "03-5555-0198", email: "ishikawa@ishikawa-d.example",
  }],
  ["ja 1: full Japanese signature with reading, department, 〒, fax", [
    "--",
    "山田 太郎（やまだ たろう）",
    "株式会社オービット 営業部 部長",
    "〒150-0002 東京都渋谷区渋谷2-21-1 渋谷ヒカリエ 32F",
    "TEL: 03-1234-5678 / FAX: 03-1234-5679",
    "携帯: 090-1234-5678",
    "Mail: taro.yamada@orbit.example.jp",
    "URL: https://orbit.example.jp",
  ].join("\n"), {
    displayName: "山田 太郎", organization: "株式会社オービット", role: "営業部 部長", postalCode: "150-0002",
    address: "東京都渋谷区渋谷2-21-1 渋谷ヒカリエ 32F", phone: ["03-1234-5678", "090-1234-5678"],
    email: "taro.yamada@orbit.example.jp", url: "https://orbit.example.jp",
  }],
  ["ja 2: sign-off and rules, company first, role and name on one line, postal without 〒", [
    "よろしくお願いいたします。",
    "━━━━━━━━━━━━━━",
    "オービット合同会社",
    "代表取締役 佐藤花子",
    "105-0001 東京都港区虎ノ門1-2-3",
    "Tel 03-5555-1234",
    "hanako@orbit-llc.jp",
  ].join("\n"), {
    organization: "オービット合同会社", role: "代表取締役", displayName: "佐藤花子", postalCode: "105-0001",
    address: "東京都港区虎ノ門1-2-3", phone: "03-5555-1234", email: "hanako@orbit-llc.jp",
  }],
  ["ja 3: full-width letters and digits", [
    "鈴木 一郎",
    "ＣＥＯ",
    "有限会社スズキ商店",
    "電話：０６－６１２３－４５６７",
    "suzuki@suzuki-shoten.co.jp",
  ].join("\n"), {
    displayName: "鈴木 一郎", role: "ＣＥＯ", organization: "有限会社スズキ商店", phone: "０６－６１２３－４５６７", email: "suzuki@suzuki-shoten.co.jp",
  }],
  ["en 1: pipe-separated role and company, US phone, www", [
    "Best regards,",
    "Jane Doe",
    "Head of Partnerships | Orbit Example Inc.",
    "+1 (415) 555-0100",
    "jane@orbit.example",
    "www.orbit.example",
  ].join("\n"), {
    displayName: "Jane Doe", role: "Head of Partnerships", organization: "Orbit Example Inc.", phone: "+1 (415) 555-0100", email: "jane@orbit.example", url: "www.orbit.example",
  }],
  ["en 2: Co., Ltd. keeps its comma; romanized Tokyo address with postal", [
    "John Smith",
    "Senior Software Engineer",
    "Acme Widgets Co., Ltd.",
    "1-2-3 Shibuya, Shibuya-ku, Tokyo 150-0002",
    "M: +81 90-1234-5678",
    "john.smith@acme.example",
  ].join("\n"), {
    displayName: "John Smith", role: "Senior Software Engineer", organization: "Acme Widgets Co., Ltd.",
    address: "1-2-3 Shibuya, Shibuya-ku, Tokyo", postalCode: "150-0002", phone: "+81 90-1234-5678", email: "john.smith@acme.example",
  }],
  ["en 3: name and role on one line, fax skipped", [
    "Thanks!",
    "Maria Garcia, VP of Sales",
    "Globex LLC",
    "Tel: +44 20 7946 0958",
    "Fax: +44 20 7946 0959",
    "maria@globex.example",
  ].join("\n"), {
    displayName: "Maria Garcia", role: "VP of Sales", organization: "Globex LLC", phone: "+44 20 7946 0958", email: "maria@globex.example",
  }],
  ["zh 1: company and role on one line, Beijing address, spaced mobile", [
    "此致",
    "王小明",
    "北京轨道科技有限公司 产品总监",
    "地址：北京市朝阳区建国路88号",
    "手机：138 0013 8000",
    "邮箱：wang@orbit.example.cn",
  ].join("\n"), {
    displayName: "王小明", organization: "北京轨道科技有限公司", role: "产品总监", address: "北京市朝阳区建国路88号", phone: "138 0013 8000", email: "wang@orbit.example.cn",
  }],
  ["zh 2: name | role, labeled 6-digit postal code", [
    "李华 | 首席执行官",
    "上海星辰网络有限公司",
    "电话：+86 21 6123 4567",
    "邮编：200120",
    "lihua@xingchen.example.com",
  ].join("\n"), {
    displayName: "李华", role: "首席执行官", organization: "上海星辰网络有限公司", phone: "+86 21 6123 4567", postalCode: "200120", email: "lihua@xingchen.example.com",
  }],
  ["zh 3: department + title, 集团, bare mobile", [
    "张伟",
    "销售部 经理",
    "深圳前海数据集团",
    "13912345678",
    "zhangwei@qianhai.example",
  ].join("\n"), {
    displayName: "张伟", role: "销售部 经理", organization: "深圳前海数据集团", phone: "13912345678", email: "zhangwei@qianhai.example",
  }],
];

for (const [name, text, expected] of cases) {
  test(`splitSignature ${name}`, () => {
    const spans = splitSignature(text);
    assert.deepEqual(fields(spans), expected);
    for (const span of spans) assert.equal(text.slice(span.start, span.end), span.value, `${span.field} offsets point at the original text`);
    assert.deepEqual(spans.map((span) => span.start), [...spans].map((span) => span.start).sort((a, b) => a - b), "sorted by position");
  });
}

test("a phone number is never read as a postal code", () => {
  for (const text of [
    "山田太郎\n東京都港区虎ノ門1-2-3 TEL 03-1234-5678",
    "山田太郎\n東京都港区 06-123-4567",
    "Taro Yamada\nTel 0120-123-4567",
    "Taro Yamada\n1234-5678",
    "王小明\n北京市朝阳区建国路88号 010-6512-3456",
  ]) {
    const spans = splitSignature(text);
    assert.equal(spans.filter((span) => span.field === "postalCode").length, 0, `${JSON.stringify(text)} → ${JSON.stringify(spans)}`);
  }
  const phones = splitSignature("山田太郎\n東京都港区 06-123-4567").filter((span) => span.field === "phone");
  assert.deepEqual(phones.map((span) => span.value), ["06-123-4567"]);
});

test("an unlabeled 123-4567 is a postal code only on a line that reads like an address", () => {
  assert.deepEqual(splitSignature("山田太郎\n150-0002 東京都渋谷区渋谷2-21-1").filter((span) => span.field === "postalCode").map((span) => [span.value, span.confidence]), [["150-0002", "medium"]]);
  assert.equal(splitSignature("山田太郎\n社員番号 150-0002").some((span) => span.field === "postalCode"), false);
});

test("confidence: tokens are high, the heuristics are not", () => {
  const spans = splitSignature("Jane Doe\nGlobex LLC\njane@globex.example\n03-1234-5678");
  const by = (field: SignatureField) => spans.find((span) => span.field === field)?.confidence;
  assert.equal(by("email"), "high");
  assert.equal(by("organization"), "high");
  assert.equal(by("displayName"), "high");
  assert.equal(by("phone"), "medium", "an unlabeled domestic number");
  assert.equal(splitSignature("jane@globex.example\nsomething odd 42").find((span) => span.field === "displayName"), undefined, "a line with digits is not a name");
});

test("empty and blank input", () => {
  assert.deepEqual(splitSignature(""), []);
  assert.deepEqual(splitSignature("  \n\n --- \n"), []);
});
