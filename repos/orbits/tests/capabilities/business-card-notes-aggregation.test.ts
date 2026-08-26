import assert from "node:assert/strict";
import test from "node:test";

import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import { aggregateBusinessCardNotes } from "../../features/acquisition/business-card-notes-aggregation";

function extraction(
  overrides: Partial<BusinessCardStructuredExtraction> = {},
): BusinessCardStructuredExtraction {
  return {
    addresses: [],
    certifications: [],
    contactPoints: [],
    departments: [],
    detectedLanguages: ["ja"],
    emails: [],
    fullName: "青空 太郎",
    nativeFullName: "青空 太郎",
    organization: "架空技研株式会社",
    romanizedFullName: null,
    title: "室長",
    website: null,
    ...overrides,
  };
}

test("notes aggregation captures every field that has no fixed slot, with labels", () => {
  const notes = aggregateBusinessCardNotes(
    extraction({
      addresses: [
        { label: "本社", value: "東京都テスト区1-2-3" },
        { label: "関西", value: "大阪府サンプル市4-5-6" },
      ],
      certifications: ["宅地建物取引士"],
      contactPoints: [
        { label: "TEL", type: "phone", value: "03-0000-1111" },
        { label: "FAX", type: "fax", value: "03-0000-2222" },
        { label: "携帯", type: "mobile", value: "090-0000-3333" },
      ],
      departments: ["事業開発室"],
      emails: [
        { label: "E-mail", value: "taro@example.test" },
        { label: "共用", value: "info@example.test" },
      ],
      romanizedFullName: "Taro Aozora",
      website: "https://example.test",
    }),
    { email: "taro@example.test", phone: "03-0000-1111" },
  );

  for (const expected of [
    "東京都テスト区1-2-3",
    "大阪府サンプル市4-5-6",
    "宅地建物取引士",
    "03-0000-2222",
    "090-0000-3333",
    "事業開発室",
    "info@example.test",
    "Taro Aozora",
    "https://example.test",
    "本社",
    "FAX",
  ]) {
    assert.ok(notes.includes(expected), `notes must include ${expected}`);
  }
  assert.ok(!notes.includes("taro@example.test"), "chosen email stays in its fixed slot");
  assert.ok(!notes.includes("03-0000-1111"), "chosen phone stays in its fixed slot");
});

test("notes aggregation returns an empty string when nothing is left over", () => {
  const notes = aggregateBusinessCardNotes(
    extraction({
      contactPoints: [{ label: null, type: "phone", value: "03-1111-2222" }],
      emails: [{ label: null, value: "only@example.test" }],
    }),
    { email: "only@example.test", phone: "03-1111-2222" },
  );

  assert.equal(notes, "");
});

test("property: fixed slots plus notes lose no non-empty field value", () => {
  const pools = {
    addresses: [[], [{ label: "HQ", value: "Addr-1" }], [{ label: null, value: "Addr-2" }]],
    certifications: [[], ["Cert-A", "Cert-B"]],
    contactPoints: [
      [],
      [{ label: "TEL", type: "phone" as const, value: "01-111" }],
      [
        { label: null, type: "mobile" as const, value: "02-222" },
        { label: "FAX", type: "fax" as const, value: "03-333" },
      ],
    ],
    departments: [[], ["Dept-1"]],
    emails: [[], [{ label: null, value: "a@x.test" }], [{ label: "sub", value: "b@x.test" }]],
    romanizedFullName: [null, "Roman Name"],
    website: [null, "https://w.test"],
  };

  let caseIndex = 0;
  for (const addresses of pools.addresses)
    for (const certifications of pools.certifications)
      for (const contactPoints of pools.contactPoints)
        for (const departments of pools.departments)
          for (const emails of pools.emails)
            for (const romanizedFullName of pools.romanizedFullName)
              for (const website of pools.website) {
                caseIndex += 1;
                const input = extraction({
                  addresses,
                  certifications,
                  contactPoints,
                  departments,
                  emails,
                  romanizedFullName,
                  website,
                });
                const chosenEmail = emails[0]?.value ?? null;
                const chosenPhone =
                  contactPoints.find((point) => point.type !== "fax")?.value ?? null;
                const notes = aggregateBusinessCardNotes(input, {
                  email: chosenEmail,
                  phone: chosenPhone,
                });
                const covered = [
                  input.fullName,
                  input.nativeFullName,
                  input.organization,
                  input.title,
                  chosenEmail,
                  chosenPhone,
                  notes,
                ]
                  .filter(Boolean)
                  .join("\n");
                const allValues = [
                  ...input.addresses.map((item) => item.value),
                  ...input.certifications,
                  ...input.contactPoints.map((item) => item.value),
                  ...input.departments,
                  ...input.emails.map((item) => item.value),
                  input.romanizedFullName,
                  input.website,
                  input.fullName,
                  input.nativeFullName,
                  input.organization,
                  input.title,
                ].filter((value): value is string => Boolean(value));
                for (const value of allValues) {
                  assert.ok(covered.includes(value), `case ${caseIndex}: lost ${value}`);
                }
              }
});
