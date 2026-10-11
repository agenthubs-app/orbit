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
