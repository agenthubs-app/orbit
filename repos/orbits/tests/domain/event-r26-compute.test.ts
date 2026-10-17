import assert from "node:assert/strict";
import test from "node:test";

import { scoreEvent, scoreEventRange, eventVerdict, type EventScoreFacts, type EventScoreType } from "../../shared/compute/event-score";
import { parsePriceYen, eventTimeslot, toEventScoreFacts, tokyoMinuteOfDay } from "../../shared/compute/event-score-input";
import { networkingMinutesFromAgenda, formatFlags, connectionCounts } from "../../shared/compute/event-facts-derive";
import { estimateTravelMinutes, guessPlace } from "../../shared/compute/event-travel-estimate";
import { eventEmoji } from "../../shared/compute/event-emoji";
import { eventDisplayFromItems, displayValueText } from "../../shared/compute/event-assessment-display";
import { partialAttendance } from "../../shared/compute/event-partial-attendance";
import { typeAttendees, typeOfPerson } from "../../shared/compute/event-attendee-typing";

// R26 SC-R26-02 / event-score-input.test（PLANNER「测试」）：价格解析、议程 → 交流时间、移动时间表、emoji、3 维换算、区间、部分参加、参加者归类。

test("parsePriceYen：無料 / ¥15,000 / 1.5万円 / 3,000〜5,000円 / 不明", () => {
  const cases: [string | null, number | null][] = [
    ["無料", 0], ["0円", 0], ["Free", 0], ["¥15,000", 15000], ["15000円", 15000], ["１５，０００円", 15000], ["1.5万円", 15000],
    ["3,000〜5,000円", 5000], ["一般 ¥3,000 / 学生 ¥1,000", 3000], ["不明", null], ["未定", null], ["", null], [null, null],
  ];
  for (const [input, expected] of cases) assert.equal(parsePriceYen(input), expected, String(input));
});

test("eventTimeslot / tokyoMinuteOfDay：东京时间", () => {
  assert.equal(eventTimeslot("2026-10-07T19:00:00+09:00"), "evening"); // 水
  assert.equal(eventTimeslot("2026-10-16T10:00:00+09:00"), "daytime"); // 金
  assert.equal(eventTimeslot("2026-10-17T13:00:00+09:00"), "weekend"); // 土
  assert.equal(eventTimeslot("2026-10-15T23:30:00Z"), "daytime"); // = 10/16 8:30 JST 金
  assert.equal(eventTimeslot(undefined), null);
  assert.equal(tokyoMinuteOfDay("2026-10-16T09:30:00Z"), 18 * 60 + 30);
});

test("议程 → 交流时间：交流类条目时长合计；无议程 null；无交流 0", () => {
  const agenda = [
    { at: "10:00", title: "キーノート" },
    { at: "11:00", title: "VC セッション" },
    { at: "12:30", title: "ランチ・名刺交換" },
    { at: "13:30", title: "採用セッション" },
    { at: "17:00", title: "懇親会", minutes: 60 },
  ];
  assert.equal(networkingMinutesFromAgenda(agenda), 60 + 60);
  assert.equal(networkingMinutesFromAgenda(null), null);
  assert.equal(networkingMinutesFromAgenda([{ at: "10:00", title: "講演" }]), 0);
  assert.deepEqual(formatFlags({ agenda, format: { networking: true } }), { exchangeCorner: true, matching: null, nameTags: null });
});

test("toEventScoreFacts：映射表全规则（费、时段、交流、形式）", () => {
  const facts = toEventScoreFacts(
    { agenda: [{ at: "19:00", title: "講演" }, { at: "20:00", title: "交流タイム" }], endsAt: "2026-10-07T21:00:00+09:00", price: "¥5,000", startsAt: "2026-10-07T19:00:00+09:00" },
    { attendeeSource: "registrants", expected: { cfo: 6 }, firstDegree: 2, secondDegree: null, travelMinutes: 30 },
  );
  assert.equal(facts.fee, 5000);
  assert.equal(facts.timeslot, "evening");
  assert.equal(facts.networkingMinutes, 60);
  assert.equal(facts.travelMinutes, 30);
  assert.deepEqual(facts.expected, { cfo: 6 });
});

test("移动时间推定表：オンライン 0 · 同区 20 · 23 区内 30 · 同县 60 · 邻县 90 · 其他 150 · 认不出 null", () => {
  assert.deepEqual(estimateTravelMinutes({ event: "オンライン（Zoom）", home: null }), { estimated: true, minutes: 0 });
  assert.equal(estimateTravelMinutes({ event: "東京国際フォーラム", home: "東京都千代田区" })?.minutes, 20);
  assert.equal(estimateTravelMinutes({ event: "渋谷ストリーム", home: "東京都千代田区" })?.minutes, 30);
  assert.equal(estimateTravelMinutes({ event: "東京都八王子市", home: "東京都千代田区" })?.minutes, 60);
  assert.equal(estimateTravelMinutes({ event: "パシフィコ横浜", home: "東京都千代田区" })?.minutes, 90);
  assert.equal(estimateTravelMinutes({ event: "グランフロント大阪", home: "東京都千代田区" })?.minutes, 150);
  assert.equal(estimateTravelMinutes({ event: "グランフロント大阪", home: "大阪府大阪市北区" })?.minutes, 20);
  assert.equal(estimateTravelMinutes({ event: "どこか", home: "東京都千代田区" }), null);
  assert.equal(guessPlace("大阪府大阪市北区梅田")?.metro, "osaka");
});

test("eventEmoji：主办方优先 · 关键词 · 兜底", () => {
  assert.equal(eventEmoji({ emoji: "🚀", title: "Summit" }), "🚀");
  assert.equal(eventEmoji({ title: "Japan SaaS Summit 2026 秋" }), "🎤");
  assert.equal(eventEmoji({ title: "CFO Night Tokyo vol.18" }), "🥂");
  assert.equal(eventEmoji({ title: "製造業 DX カンファレンス 大阪" }), "🏭");
  assert.equal(eventEmoji({ title: "丸の内スタートアップ朝会 #42" }), "☕");
  assert.equal(eventEmoji({ title: "AI 勉強会" }), "📚");
  assert.equal(eventEmoji({ title: "なにか" }), "🎟️");
});

const types: EventScoreType[] = [
  { allocation: 30, key: "vc_partner", metCount: 2, skipped: false, targetCount: 3 },
  { allocation: 15, key: "cvc", metCount: 0, skipped: false, targetCount: 3 },
];
const baseFacts: EventScoreFacts = { attendeeSource: "speakers", exchangeCorner: true, expected: { cvc: 4, vc_partner: 3 }, fee: 15000, firstDegree: 2, matching: null, nameTags: null, networkingMinutes: 45, secondDegree: null, timeslot: "daytime", travelMinutes: 20 };

test("3 维换算：(fit+confidence)/60、(connections+format)/20、timeCost/20 → 0–100", () => {
  const result = scoreEvent({ facts: baseFacts, types });
  const display = eventDisplayFromItems(result.items);
  const of = (c: string) => result.items.find((item) => item.criterion === c)!.score;
  assert.equal(display.goalFit.value, Math.round(((of("fit") + of("confidence")) / 60) * 100));
  assert.equal(display.people.value, Math.round(((of("connections") + of("format")) / 20) * 100));
  assert.equal(display.timeCost.value, Math.round((of("timeCost") / 20) * 100));
  assert.equal(displayValueText({ max: 70, min: 55, value: 62 }), "55–70");
  assert.equal(displayValueText({ value: 64 }), "64");
});

test("区间：参加費不明 → min / max，total 不变、判定仍用 total；事实齐全 → null", () => {
  const facts = { ...baseFacts, fee: null };
  const result = scoreEvent({ facts, types });
  const range = scoreEventRange(result, facts)!;
  assert.ok(range.min < result.total && result.total < range.max);
  assert.equal(range.max - range.min, 8);
  assert.equal(result.verdict, eventVerdict(result.total));
  assert.equal(scoreEventRange(scoreEvent({ facts: baseFacts, types }), baseFacts), null);
  const display = eventDisplayFromItems(result.items, range);
  assert.ok(display.timeCost.min! < display.timeCost.max!);
});

test("部分参加：只有一部分时段相关时给窗口与提升后的时間対効果；无议程 / 全相关不出", () => {
  const agenda = [{ at: "10:00", title: "キーノート" }, { at: "11:00", title: "VC セッション" }, { at: "12:30", title: "採用セッション" }];
  const hint = partialAttendance({ agenda, endMinute: 18 * 60, keywords: ["キーノート", "VC"], timeCost: 64 });
  assert.equal(hint?.window, "10:00–12:30");
  assert.ok(hint!.timeCostAfter > 64 && hint!.timeCostAfter <= 100);
  assert.equal(partialAttendance({ agenda: null, keywords: ["VC"], timeCost: 64 }), null);
  assert.equal(partialAttendance({ agenda, endMinute: 18 * 60, keywords: ["セッション", "キーノート"], timeCost: 64 }), null);
});

test("参加者归类：登壇者 → 类型、展示社按标题关键词、来源", () => {
  const typing = [{ key: "vc_partner", shortLabel: "VC" }, { key: "cfo", shortLabel: "CFO" }, { key: "dx_lead", shortLabel: "製造業 DX 責任者" }];
  assert.equal(typeOfPerson({ org: "青葉ベンチャーズ", role: "パートナー" }, typing), "vc_partner");
  assert.equal(typeOfPerson({ role: "CFO" }, typing), "cfo");
  const result = typeAttendees({ exhibitorCount: 12, speakers: [{ name: "A", org: "青葉ベンチャーズ", role: "パートナー" }, { name: "B", org: "X Capital", role: "Partner" }, { name: "C", org: "Y社", role: "CFO" }], text: "製造業 DX 展示", types: typing });
  assert.equal(result.attendeeSource, "speakers");
  assert.equal(result.expected.vc_partner, 2);
  assert.equal(result.expected.cfo, 1);
  assert.equal(result.expected.dx_lead, 12);
  assert.deepEqual(typeAttendees({ types: typing }).attendeeSource, "none");
});

test("既存のつながり：报名者 ∩ 联系人（一度 / 二度）；外部活动按登壇者姓名；无信息 null", () => {
  const contacts = [{ id: "c1", name: "高橋 美咲" }, { id: "c2", name: "加藤 健" }];
  assert.deepEqual(connectionCounts({ myContacts: contacts }), { firstDegree: null, known: [], secondDegree: null });
  const internal = connectionCounts({ attendeeContactIds: ["c1", "x"], myContacts: contacts, secondDegreeContactIds: ["c2", "c1"] });
  assert.equal(internal.firstDegree, 1);
  assert.equal(internal.secondDegree, 1);
  const external = connectionCounts({ myContacts: contacts, speakerNames: ["加藤健", "誰か"] });
  assert.equal(external.firstDegree, 1);
  assert.equal(external.secondDegree, null);
});
