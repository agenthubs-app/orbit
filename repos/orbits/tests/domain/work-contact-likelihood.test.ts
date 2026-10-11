/**
 * R16（DESIGN add-and-invite §2.7、§9 #20）：通讯录「像工作关系的人」规则预选。表驱动，依据键必须对。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { isFreeMailDomain, workContactLikelihood, type WorkContactInput } from "../../shared/compute/work-contact-likelihood";

const person = (overrides: Partial<WorkContactInput>): WorkContactInput => ({ displayName: "山田 太郎", emails: [], ...overrides });

const CASES: { name: string; input: WorkContactInput; likely: boolean; reasons: string[]; excludedBy?: string }[] = [
  { name: "company name", input: person({ organization: "Kanade AI" }), likely: true, reasons: ["company"] },
  { name: "company-domain email", input: person({ emails: ["taro@kanade-ai.co.jp"] }), likely: true, reasons: ["work_email"] },
  { name: "free-mail only", input: person({ emails: ["taro.yamada@gmail.com", "t@docomo.ne.jp"] }), likely: false, reasons: [] },
  { name: "free mail + company domain (any work address counts)", input: person({ emails: ["t@icloud.com", "t@example.co.jp"] }), likely: true, reasons: ["work_email"] },
  { name: "title keyword ja", input: person({ role: "営業部長" }), likely: true, reasons: ["job_title"] },
  { name: "title keyword en", input: person({ role: "Head of Partnerships" }), likely: true, reasons: ["job_title"] },
  { name: "title keyword zh", input: person({ role: "产品经理" }), likely: true, reasons: ["job_title"] },
  { name: "unknown free-form title is still a title", input: person({ role: "ふるさと納税担当" }), likely: true, reasons: ["job_title"] },
  { name: "all three reasons in a fixed order", input: person({ emails: ["a@nexa.example"], organization: "Nexa", role: "CTO" }), likely: true, reasons: ["company", "work_email", "job_title"] },
  { name: "title written in the name (佐藤部長)", input: person({ displayName: "佐藤部長" }), likely: true, reasons: ["job_title"] },
  { name: "latin title words match whole words only (Victor is not a CTO)", input: person({ displayName: "Victor Hugo" }), likely: false, reasons: [] },
  { name: "nothing known", input: person({ phones: ["090-0000-0000"] }), likely: false, reasons: [] },
  { name: "family: 母", input: person({ displayName: "母", phones: ["090"] }), likely: false, reasons: [], excludedBy: "family" },
  { name: "family: お父さん", input: person({ displayName: "お父さん" }), likely: false, reasons: [], excludedBy: "family" },
  { name: "family: Mom (case-insensitive word)", input: person({ displayName: "mom", emails: ["mom@company.example"] }), likely: false, reasons: ["work_email"], excludedBy: "family" },
  { name: "family word inside a real name is not family (母袋 さん)", input: person({ displayName: "母袋 健", organization: "Example KK" }), likely: true, reasons: ["company"] },
  { name: "shop: 〜店", input: person({ displayName: "らーめん一番 渋谷店", organization: "らーめん一番" }), likely: false, reasons: ["company"], excludedBy: "shop" },
  { name: "shop: ピザ屋", input: person({ displayName: "ピザ屋" }), likely: false, reasons: [], excludedBy: "shop" },
  { name: "medical: 病院", input: person({ displayName: "東都中央病院", organization: "東都中央病院" }), likely: false, reasons: ["company"], excludedBy: "medical" },
  { name: "medical: 歯科 in organization", input: person({ displayName: "受付", organization: "さくら歯科クリニック" }), likely: false, reasons: ["company"], excludedBy: "medical" },
  { name: "service: タクシー", input: person({ displayName: "日本交通タクシー" }), likely: false, reasons: [], excludedBy: "service" },
  // R16 复核 M1：公司名不参与店铺 / 服务判断；名字整段像店铺 / 家人时才排除；姓「土屋」「古屋」不误伤。
  { name: "M1: surname 土屋 is not a shop", input: person({ displayName: "土屋 太郎", emails: ["t.tsuchiya@sony.co.jp"], organization: "ソニー株式会社" }), likely: true, reasons: ["company", "work_email"] },
  { name: "M1: surname 古屋 alone with a company email", input: person({ displayName: "古屋", emails: ["furuya@nexa.co.jp"] }), likely: true, reasons: ["work_email"] },
  { name: "M1: bank branch (支店) in the company", input: person({ displayName: "佐藤 一郎", emails: ["sato@bk.mufg.jp"], organization: "三菱UFJ銀行 渋谷支店" }), likely: true, reasons: ["company", "work_email"] },
  { name: "M1: 名古屋支店 in the company", input: person({ displayName: "鈴木 花子", organization: "トヨタ自動車株式会社 名古屋支店", role: "営業" }), likely: true, reasons: ["company", "job_title"] },
  { name: "M1: 東京ガス is a company, not a utility line", input: person({ displayName: "高橋 健", emails: ["takahashi@tokyo-gas.co.jp"], organization: "東京ガス株式会社", role: "課長" }), likely: true, reasons: ["company", "work_email", "job_title"] },
  { name: "M1: 関西電力", input: person({ displayName: "中村 誠", organization: "関西電力" }), likely: true, reasons: ["company"] },
  { name: "M1: ヤマト運輸 (company)", input: person({ displayName: "小林 亮", organization: "ヤマト運輸株式会社", role: "部長" }), likely: true, reasons: ["company", "job_title"] },
  { name: "M1: 岩波書店 (publisher)", input: person({ displayName: "山本 直子", organization: "株式会社岩波書店", role: "編集者" }), likely: true, reasons: ["company", "job_title"] },
  { name: "M1: 広告代理店 in the company", input: person({ displayName: "加藤 誠", organization: "博報堂 (広告代理店)" }), likely: true, reasons: ["company"] },
  { name: "M1: ジム・スミス is a person", input: person({ displayName: "ジム・スミス", emails: ["jim@acme.com"], organization: "Acme Inc.", role: "CTO" }), likely: true, reasons: ["company", "work_email", "job_title"] },
  { name: "M1: Delivery Hero (company)", input: person({ displayName: "Anna Weber", emails: ["anna@deliveryhero.com"], organization: "Delivery Hero SE", role: "VP" }), likely: true, reasons: ["company", "work_email", "job_title"] },
  { name: "M1: a company written as the name (株式会社岩波書店)", input: person({ displayName: "株式会社岩波書店", organization: "株式会社岩波書店" }), likely: true, reasons: ["company"] },
  { name: "M1: a bank branch written as the name", input: person({ displayName: "三菱UFJ銀行 渋谷支店", phones: ["03"] }), likely: false, reasons: [] },
  { name: "M1: family with a suffix (母 携帯)", input: person({ displayName: "母 携帯", phones: ["090"] }), likely: false, reasons: [], excludedBy: "family" },
  { name: "M1: family with a label in brackets (Mom (cell))", input: person({ displayName: "Mom (cell)", emails: ["mom@company.example"] }), likely: false, reasons: ["work_email"], excludedBy: "family" },
  { name: "M1: 実家 固定", input: person({ displayName: "実家 固定" }), likely: false, reasons: [], excludedBy: "family" },
  { name: "M1: ジム スミス (space-separated) is a person", input: person({ displayName: "ジム スミス" }), likely: false, reasons: [] },
  { name: "M1: a gym written as the name is still a shop (ゴールドジム)", input: person({ displayName: "ゴールドジム 原宿", organization: "ゴールドジム" }), likely: false, reasons: ["company"], excludedBy: "shop" },
  { name: "M1: a utility line written as the name (東京ガス お客さまセンター)", input: person({ displayName: "東京ガス", phones: ["0570"] }), likely: false, reasons: [], excludedBy: "service" },
  { name: "M1: a bookshop written as the name (紀伊國屋書店 新宿本店)", input: person({ displayName: "紀伊國屋書店 新宿本店" }), likely: false, reasons: [], excludedBy: "shop" },
  { name: "M1: ピザ屋 with only the same company name is still a shop", input: person({ displayName: "ピザ屋", organization: "ピザ屋" }), likely: false, reasons: ["company"], excludedBy: "shop" },
  { name: "M1: a hospital doctor with a work email and title is a work contact", input: person({ displayName: "田中 院長", emails: ["tanaka@toto-hp.example"], organization: "東都中央病院", role: "院長" }), likely: true, reasons: ["company", "work_email", "job_title"] },
];

for (const item of CASES) {
  test(`work contact likelihood: ${item.name}`, () => {
    const result = workContactLikelihood(item.input);
    assert.equal(result.likely, item.likely);
    assert.deepEqual(result.reasons, item.reasons);
    assert.equal(result.excludedBy, item.excludedBy ?? null);
  });
}

test("free-mail domains: carriers and webmail are free; subdomains of a company are not", () => {
  for (const domain of ["gmail.com", "GMAIL.COM", "yahoo.co.jp", "icloud.com", "ezweb.ne.jp", "i.softbank.jp", "qq.com", "outlook.jp"]) assert.equal(isFreeMailDomain(domain), true, domain);
  for (const domain of ["kanade-ai.co.jp", "mail.example.com", "nexa.example"]) assert.equal(isFreeMailDomain(domain), false, domain);
});

test("blank and malformed inputs never throw and are not preselected", () => {
  assert.deepEqual(workContactLikelihood({ displayName: "", emails: ["not-an-email", ""], organization: "  ", role: " " }), { excludedBy: null, likely: false, reasons: [] });
});
