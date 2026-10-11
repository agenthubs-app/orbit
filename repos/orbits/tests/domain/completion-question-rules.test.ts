/**
 * R16（DESIGN add-and-invite §2.8、§9 #24）：每天一问的规则纯函数（挑人、挑题型、选项、答案归属、东京日）。表驱动。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompletionOptions,
  COMPLETION_OPTION_LABELS,
  completionDensityFacts,
  completionKindFor,
  completionQuestionText,
  hasMeetingNote,
  pickCompletionTarget,
  resolveCompletionAnswer,
  tokyoDayOf,
  type CompletionContactFacts,
} from "../../shared/compute/completion-question-rules";

const NOW = "2026-10-12T01:00:00.000Z"; // 東京 10:00

function contact(overrides: Partial<CompletionContactFacts> & { contactId: string }): CompletionContactFacts {
  return {
    addedAt: "2026-10-10T03:00:00.000Z",
    displayName: overrides.contactId,
    emails: [],
    hasContactPoint: false,
    hasMetContext: false,
    hasStrongSignal: false,
    organization: "",
    ...overrides,
  };
}

test("Tokyo day: the boundary is 00:00 JST (15:00 UTC), not UTC midnight", () => {
  assert.equal(tokyoDayOf("2026-10-11T14:59:59.999Z"), "2026-10-11");
  assert.equal(tokyoDayOf("2026-10-11T15:00:00.000Z"), "2026-10-12");
  assert.equal(tokyoDayOf("2026-12-31T15:00:00Z"), "2027-01-01");
  assert.equal(tokyoDayOf("not a date"), null);
});

test("meeting note: a line 「出会い：…」 (full- or half-width colon) counts as met context", () => {
  assert.equal(hasMeetingNote("LinkedIn: https://x\n出会い：紹介"), true);
  assert.equal(hasMeetingNote("出会い: 前職の同僚"), true);
  assert.equal(hasMeetingNote("メモ：出会いは覚えていない"), false);
  assert.equal(hasMeetingNote(""), false);
});

test("density facts follow D-10: contact point + met context = 2; a strong signal = 3; else 1", () => {
  assert.equal(completionDensityFacts(contact({ contactId: "a" })).level, 1);
  assert.equal(completionDensityFacts(contact({ contactId: "a", hasContactPoint: true })).level, 1);
  assert.equal(completionDensityFacts(contact({ contactId: "a", hasMetContext: true })).level, 1, "LinkedIn people without email stay ●○○ after 「どこで」");
  assert.equal(completionDensityFacts(contact({ contactId: "a", hasContactPoint: true, hasMetContext: true })).level, 2);
  assert.equal(completionDensityFacts(contact({ contactId: "a", hasStrongSignal: true })).level, 3);
});

const KIND_CASES: { name: string; facts: Partial<CompletionContactFacts>; answered: ("met_where" | "organization")[]; kind: "met_where" | "organization" | null }[] = [
  { name: "missing company is asked first", facts: {}, answered: [], kind: "organization" },
  { name: "company known → where we met", facts: { organization: "Kanade AI" }, answered: [], kind: "met_where" },
  { name: "company answered (even 覚えていない) → where we met", facts: {}, answered: ["organization"], kind: "met_where" },
  { name: "both known → nothing to ask", facts: { hasMetContext: true, organization: "X" }, answered: [], kind: null },
  { name: "both answered → nothing to ask", facts: {}, answered: ["organization", "met_where"], kind: null },
];
for (const item of KIND_CASES) {
  test(`kind: ${item.name}`, () => {
    assert.equal(completionKindFor(contact({ contactId: "a", ...item.facts }), item.answered), item.kind);
  });
}

test("pick: only ●○○ people added in the last 30 Tokyo days; newest first; 3 skips in a row stop the person; nothing left → null", () => {
  const contacts = [
    contact({ addedAt: "2026-09-12T00:00:00.000Z", contactId: "too-old" }), // 東京 9/12 → 30 日前（境界内）
    contact({ addedAt: "2026-09-11T14:00:00.000Z", contactId: "older-than-30" }), // 東京 9/11 → 31 日前
    contact({ addedAt: "2026-10-11T00:00:00.000Z", contactId: "dense", hasContactPoint: true, hasMetContext: true }),
    contact({ addedAt: "2026-10-11T01:00:00.000Z", contactId: "strong", hasStrongSignal: true }),
    contact({ addedAt: "2026-10-10T00:00:00.000Z", contactId: "skipped-3" }),
    contact({ addedAt: "2026-10-09T00:00:00.000Z", contactId: "newest-eligible" }),
    contact({ addedAt: "2026-10-12T05:00:00.000Z", contactId: "future" }),
  ];
  const history = { "skipped-3": { answeredKinds: [], skipStreak: 3 } };
  assert.deepEqual(pickCompletionTarget({ contacts, history, now: NOW }), { contactId: "newest-eligible", kind: "organization" });
  assert.deepEqual(pickCompletionTarget({ contacts: contacts.filter((item) => item.contactId !== "newest-eligible"), history, now: NOW }), { contactId: "too-old", kind: "organization" });
  assert.equal(pickCompletionTarget({ contacts: [contacts[1]!, contacts[2]!, contacts[3]!, contacts[4]!], history, now: NOW }), null);
  assert.deepEqual(pickCompletionTarget({ contacts: [contacts[4]!], history: { "skipped-3": { answeredKinds: [], skipStreak: 2 } }, now: NOW }), { contactId: "skipped-3", kind: "organization" });
});

test("met_where options: up to 2 of my events within ±14 days of when the person was added (closest first), 前職の同僚 only with evidence, then 紹介 / 覚えていない", () => {
  const person = contact({ addedAt: "2026-10-10T03:00:00.000Z", contactId: "p", organization: "Kanade AI" });
  const options = buildCompletionOptions({
    contact: person,
    events: [
      { at: "2026-09-20T10:00:00.000Z", eventId: "far", title: "Too Far Meetup" },
      { at: "2026-10-03T10:00:00.000Z", eventId: "e2", title: "SaaS Night" },
      { at: "2026-10-09T10:00:00.000Z", eventId: "e1", title: "CFO Night Tokyo vol.18" },
      { at: "2026-10-12T10:00:00.000Z", eventId: "e3", title: "Robotics Meetup" },
      { at: "2026-10-11T10:00:00.000Z", eventId: "e1", title: "CFO Night Tokyo vol.18" },
    ],
    kind: "met_where",
    others: [{ emails: [], organization: "ｋａｎａｄｅ ai" }],
  });
  assert.deepEqual(options.map((option) => option.label), ["CFO Night Tokyo vol.18", "Robotics Meetup", COMPLETION_OPTION_LABELS.formerColleague, COMPLETION_OPTION_LABELS.intro, COMPLETION_OPTION_LABELS.forgot]);
  assert.deepEqual(options[0]!.target, { eventId: "e1", kind: "event", title: "CFO Night Tokyo vol.18" });
  const plain = buildCompletionOptions({ contact: person, events: [], kind: "met_where", others: [{ emails: [], organization: "Other" }] });
  assert.deepEqual(plain.map((option) => option.label), [COMPLETION_OPTION_LABELS.intro, COMPLETION_OPTION_LABELS.forgot], "no invented events, no colleague without a same-company contact");
  const long = buildCompletionOptions({ contact: person, events: [{ at: "2026-10-10T00:00:00Z", eventId: "x", title: "あ".repeat(80) }], kind: "met_where", others: [] });
  assert.equal(long[0]!.label.length, 60, "labels fit the contract (≤60)");
  assert.equal(long[0]!.target.kind === "event" && long[0]!.target.title.length, 80, "the full title is written");
});

test("organization options: the company my other contacts on the same (non-free) email domain work at, then 自分で入力 / 覚えていない", () => {
  const person = contact({ contactId: "p", emails: ["rina@kanade.example", "rina@gmail.com"] });
  const options = buildCompletionOptions({
    contact: person,
    events: [],
    kind: "organization",
    others: [
      { emails: ["a@kanade.example"], organization: "Kanade AI" },
      { emails: ["b@KANADE.example"], organization: "Kanade AI" },
      { emails: ["c@kanade.example"], organization: "Kanade (old)" },
      { emails: ["d@gmail.com"], organization: "Gmail Users Inc" },
    ],
  });
  assert.deepEqual(options.map((option) => option.label), ["Kanade AI", COMPLETION_OPTION_LABELS.typeIn, COMPLETION_OPTION_LABELS.forgot]);
  const none = buildCompletionOptions({ contact: contact({ contactId: "q", emails: ["x@gmail.com"] }), events: [], kind: "organization", others: [{ emails: ["y@gmail.com"], organization: "Free Mail Co" }] });
  assert.deepEqual(none.map((option) => option.label), [COMPLETION_OPTION_LABELS.typeIn, COMPLETION_OPTION_LABELS.forgot], "a free-mail domain says nothing about the company");
});

test("answers: each option resolves to where it is written; typed company for 「会社は？」; anything else is invalid", () => {
  const person = contact({ addedAt: "2026-10-10T03:00:00.000Z", contactId: "p", organization: "Kanade AI" });
  const metWhere = buildCompletionOptions({ contact: person, events: [{ at: "2026-10-09T10:00:00Z", eventId: "e1", title: "CFO Night" }], kind: "met_where", others: [{ emails: [], organization: "Kanade AI" }] });
  assert.deepEqual(resolveCompletionAnswer({ answer: " CFO Night ", kind: "met_where", options: metWhere }), { eventId: "e1", kind: "event", title: "CFO Night" });
  assert.deepEqual(resolveCompletionAnswer({ answer: "紹介", kind: "met_where", options: metWhere }), { kind: "note", line: "出会い：紹介" });
  assert.deepEqual(resolveCompletionAnswer({ answer: "前職の同僚", kind: "met_where", options: metWhere }), { kind: "note", line: "出会い：前職の同僚" });
  assert.deepEqual(resolveCompletionAnswer({ answer: "覚えていない", kind: "met_where", options: metWhere }), { kind: "forgot" });
  assert.equal(resolveCompletionAnswer({ answer: "Made-up Event", kind: "met_where", options: metWhere }), null);

  const organization = buildCompletionOptions({ contact: contact({ contactId: "q", emails: ["r@kanade.example"] }), events: [], kind: "organization", others: [{ emails: ["a@kanade.example"], organization: "Kanade AI" }] });
  assert.deepEqual(resolveCompletionAnswer({ answer: "Kanade AI", kind: "organization", options: organization }), { kind: "organization", value: "Kanade AI" });
  assert.deepEqual(resolveCompletionAnswer({ answer: "  架空商事  ", kind: "organization", options: organization }), { kind: "organization", value: "架空商事" });
  assert.deepEqual(resolveCompletionAnswer({ answer: "覚えていない", kind: "organization", options: organization }), { kind: "forgot" });
  assert.equal(resolveCompletionAnswer({ answer: "自分で入力", kind: "organization", options: organization }), null, "the placeholder itself is not a company");
  assert.equal(resolveCompletionAnswer({ answer: "x".repeat(121), kind: "organization", options: organization }), null);
});

test("question text names the person", () => {
  assert.equal(completionQuestionText("met_where", "岡田 紗希"), "岡田 紗希さんとは、どこで？");
  assert.equal(completionQuestionText("organization", "岡田 紗希"), "岡田 紗希さんの会社は？");
});
