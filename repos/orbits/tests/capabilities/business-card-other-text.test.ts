import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBusinessCardExtraction,
  type BusinessCardStructuredExtraction,
} from "../../features/acquisition/business-card-cloud-ocr";
import { parseBusinessCardStructuredExtraction } from "../../features/acquisition/business-card-ocr-validation";
import {
  businessCardTranscriptLines,
  filterBusinessCardOtherText,
} from "../../features/acquisition/business-card-other-text";

function extraction(overrides: Partial<BusinessCardStructuredExtraction> = {}): BusinessCardStructuredExtraction {
  return {
    addresses: [{ label: "本社", value: "〒100-0005 東京都千代田区丸の内1-2-3 架空ビル5F" }],
    certifications: ["宅地建物取引士"],
    contactPoints: [
      { label: "TEL", type: "phone", value: "03-1234-5678" },
      { label: "FAX", type: "fax", value: "03-1234-5679" },
    ],
    departments: ["不動産事業部"],
    detectedLanguages: ["ja"],
    emails: [{ label: "E-mail", value: "hanako@example.co.jp" }],
    fullName: "山田 花子",
    nativeFullName: "山田 花子",
    organization: "架空不動産株式会社",
    romanizedFullName: "Hanako Yamada",
    title: "課長",
    website: "https://www.example.co.jp",
    ...overrides,
  };
}

test("a Japanese card keeps its tagline and service list but drops what already sits in a field", () => {
  const kept = filterBusinessCardOtherText(
    [
      "暮らしに、もっと安心を。",
      "■ 不動産売買・賃貸仲介",
      "■ リフォーム・リノベーション",
      "架空不動産株式会社",
      "不動産事業部 課長",
      "山田 花子",
      "HANAKO YAMADA",
      "TEL 03-1234-5678",
      "ＦＡＸ：０３－１２３４－５６７９",
      "E-mail: hanako@example.co.jp",
      "www.example.co.jp",
      "東京都千代田区丸の内1-2-3",
      "〒100-0005",
      "宅地建物取引士",
    ],
    extraction(),
  );

  assert.deepEqual(kept, ["暮らしに、もっと安心を。", "不動産売買・賃貸仲介", "リフォーム・リノベーション"]);
});

test("a Chinese card keeps qualifications and scope; page numbers, symbols and digits are fragments", () => {
  const kept = filterBusinessCardOtherText(
    [
      "国家一级注册建造师",
      "业务范围：工业厂房设计、施工总承包",
      "专注品质 · 诚信经营",
      "1/2",
      "- 2 -",
      "P.3",
      "★★★",
      "2024",
      "A",
      "手机：138 0013 8000",
      "微信同号",
      "上海市浦东新区世纪大道100号",
    ],
    extraction({
      addresses: [{ label: null, value: "上海市浦东新区世纪大道100号" }],
      certifications: [],
      contactPoints: [{ label: "手机", type: "mobile", value: "13800138000" }],
      departments: [],
      emails: [],
      fullName: "王伟",
      nativeFullName: "王伟",
      organization: "示例建设集团有限公司",
      romanizedFullName: null,
      title: "总经理",
      website: null,
    }),
  );

  assert.deepEqual(kept, ["国家一级注册建造师", "业务范围：工业厂房设计、施工总承包", "专注品质 · 诚信经营", "微信同号"]);
});

test("duplicates collapse after width/case normalization, and output is capped at 10 lines of 200 characters", () => {
  const kept = filterBusinessCardOtherText(
    ["Ｇｒｅｅｎ　Ｅｎｅｒｇｙ", "green energy", ...Array.from({ length: 15 }, (_, index) => `サービス${"あいうえお".repeat(index + 1)}`), "x".repeat(400)],
    extraction(),
  );

  assert.equal(kept[0], "Ｇｒｅｅｎ Ｅｎｅｒｇｙ");
  assert.equal(kept.length, 10);
  assert.ok(!kept.includes("green energy"));
  assert.ok(kept.every((line) => line.length <= 200));
  const long = filterBusinessCardOtherText(["y".repeat(400)], extraction());
  assert.equal(long[0]?.length, 200);
});

test("transcript lines are split, trimmed and stripped of markdown bullets", () => {
  assert.deepEqual(businessCardTranscriptLines("**架空不動産**\n\n- 暮らしに安心を\r\n  ・ 賃貸仲介  "), ["架空不動産", "暮らしに安心を", "賃貸仲介"]);
});

test("parsing and normalization filter otherText and leave legacy extractions without the key", () => {
  const raw = {
    ...extraction(),
    primaryIndustryId: null,
    secondaryIndustryId: null,
    seniorityLevel: null,
    regionCountryCode: null,
    regionCity: null,
  };
  const parsed = parseBusinessCardStructuredExtraction({ ...raw, otherText: ["暮らしに、もっと安心を。", "TEL 03-1234-5678", "12"] });
  assert.deepEqual(parsed.otherText, ["暮らしに、もっと安心を。"]);
  assert.deepEqual(normalizeBusinessCardExtraction(parsed).otherText, ["暮らしに、もっと安心を。"]);

  const legacy = parseBusinessCardStructuredExtraction(raw);
  assert.equal("otherText" in legacy, false);
  assert.equal("otherText" in normalizeBusinessCardExtraction(legacy), false);
  // 模型给了不合格的 otherText 只丢掉这一栏，整张名片照常识别。
  assert.equal("otherText" in parseBusinessCardStructuredExtraction({ ...raw, otherText: "not a list" }), false);
  assert.equal("otherText" in parseBusinessCardStructuredExtraction({ ...raw, otherText: ["TEL 03-1234-5678"] }), false);
});
