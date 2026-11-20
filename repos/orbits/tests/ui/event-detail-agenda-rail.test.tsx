// 活动详情 2026-11-21 改单页（docs/designs/redesign-2026-10/event-detail-ia-proposal.html 方案 A，用户拍板 W1 / W2）：
// 没有 tab；主栏 封面 → 紹介 → アジェンダ → 参加者（→ 主催，无右栏时）；右栏 参加卡（唯一主按钮）→ あなたに関係すること → 主催。
// （本文件原来测 2026-11-15 的议程卡 / 右栏两张卡，断言按新结构改写。）
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AGENDA_FOLD, DetailRail, EventDetailBody, PhoneDetailBody, currentAgendaIndex } from "../../app/(app)/app/orbit-2026/events/EventDetail";
import { filterPeople } from "../../app/(app)/app/orbit-2026/events/EventPeople";
import { journeyTranslator } from "../../app/(app)/app/orbit-2026/events/DiscoverTab";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { eventOverviewResponseSchema } from "../../shared/api-schema/event-overview";
import type { EventOverviewAttendee, EventOverviewResponse } from "../../shared/contract/event-overview";

const t = journeyTranslator("zh");
const ja = journeyTranslator("ja");
const base: EventOverviewResponse = {
  agenda: [], attendeeCounts: { all: 0, known: 0, planFit: 0 }, attendees: [], deadlineSoon: false, emoji: "🥂", endsAt: "2099-11-28T08:30:00Z", eventId: "evt6",
  hasPlan: true, knownAttendees: [], organizer: { averageAttendance: 30, editions: 5, emoji: "🥂", myAttendance: 2, name: "日中创新创业协会", organizerId: "org1", slug: "jcia", bio: "连接中日创业者与投资人的交流社群，每月一次。",
    past: [{ attendance: 32, eventId: "evt5", startsAt: "2099-10-25T05:00:00Z", title: "第五期 中日创业交流会" }, { attendance: null, eventId: "evt4", startsAt: "2099-09-27T05:00:00Z", title: "第四期 中日创业交流会" }] },
  registration: { href: "/events/evt6/register", status: "none" }, review: true, startsAt: "2099-11-28T05:00:00Z", title: "第六期 中日创业交流会", registrationClosesAt: "2099-11-26T05:00:00Z",
  assessment: { basis: "", display: { goalFit: 0, people: 0, timeCost: 0 }, score: 0, verdict: "conditional", relevance: { group: "topic", known: null, people: [], topic: { labels: ["融过资的创业者"] }, warnings: [] } as never },
};
const person = (id: string, extra: Partial<EventOverviewAttendee> = {}): EventOverviewAttendee => ({ attendeeId: id, initial: id.charAt(0).toUpperCase(), known: false, name: `Person ${id}`, org: `Org ${id}`, planFit: false, role: "CFO", wanted: false, ...extra });
const render = (node: React.ReactNode) => renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);
const agenda = Array.from({ length: 7 }, (_, index) => ({ at: `${14 + Math.floor(index / 2)}:${index % 2 ? "30" : "00"}`, title: `第${index + 1}项`, detail: index === 1 ? "日中创新创业协会 会长" : null }));

test("no tabs: cover → 紹介 → アジェンダ → 参加者; with the rail no 关联 / host card in the main column", () => {
  const html = render(<EventDetailBody data={{ ...base, description: "介绍正文", agenda }} language="zh" t={t} railShown />);
  assert.doesNotMatch(html, /role="tab"|data-detail-tab/);
  const order = ["data-detail-cover", "data-detail-intro", "data-detail-agenda", "data-detail-people"].map((key) => html.indexOf(key));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]!)), String(order));
  assert.doesNotMatch(html, /data-detail-host=|data-detail-relevance/);
});

test("no rail (< 1280 / public page): 关联 right under the cover, host card last", () => {
  const html = render(<EventDetailBody data={{ ...base, description: "介绍", agenda }} language="zh" t={t} />);
  const order = ["data-detail-cover", "data-detail-relevance", "data-detail-intro", "data-detail-agenda", "data-detail-people", "data-detail-host="].map((key) => html.indexOf(key));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]!)), String(order));
});

test("missing blocks are left out: no description / no agenda → no card; no capacity → three facts; no fee → no cell", () => {
  const html = render(<EventDetailBody data={base} language="zh" t={t} railShown />);
  assert.doesNotMatch(html, /data-detail-intro|data-detail-agenda|主办方还没有公布议程/);
  assert.match(html, /data-detail-facts="2"/, "date + place only (no fee, no capacity)");
  assert.match(html, /待定/, "no venue → 待定");
  const full = render(<EventDetailBody data={{ ...base, venue: "东京", priceYen: 0, capacity: 40, remaining: 31, attendeeCounts: { all: 9, known: 0, planFit: 0 } }} language="zh" t={t} railShown />);
  assert.match(full, /data-detail-facts="4"/); assert.match(full, /免费|無料|Free/); assert.match(full, /40人 · 剩余31/);
  assert.match(render(<EventDetailBody data={{ ...base, priceYen: 3000 }} language="zh" t={t} railShown />), /data-detail-facts="3"/);
});

test("agenda: more than 5 items folds behind すべて見る (no number); header says N 项; live → the current item is highlighted", () => {
  const html = render(<EventDetailBody data={{ ...base, agenda }} language="ja" t={ja} railShown />);
  assert.match(html, /data-detail-agenda="7"/); assert.match(html, /7項目/);
  assert.equal((html.match(/<time/g) ?? []).length, AGENDA_FOLD);
  assert.match(html, /data-detail-agenda-all=""[^>]*>すべて見る</);
  assert.match(html, /<time[^>]*>14:30<\/time><div[^>]*><b>第2项<\/b><small>日中创新创业协会 会长<\/small>/);
  const short = render(<EventDetailBody data={{ ...base, agenda: agenda.slice(0, 5) }} language="ja" t={ja} railShown />);
  assert.doesNotMatch(short, /data-detail-agenda-all/);
  // 14:00 / 14:30 / 15:00 …：15:10 Tokyo → index 2.
  assert.equal(currentAgendaIndex(agenda, Date.parse("2099-11-28T06:10:00Z")), 2);
  assert.equal(currentAgendaIndex(agenda, Date.parse("2099-11-28T04:00:00Z")), -1);
});

test("status is said once: ended → only the cover chip; closed → 受付終了 on the cover; open → no chip", () => {
  const ended = { ...base, startsAt: "2026-04-25T09:30:00Z", endsAt: "2026-04-25T12:00:00Z" };
  const body = render(<EventDetailBody data={ended} language="ja" t={ja} railShown />);
  assert.equal((body.match(/イベントは終了しました/g) ?? []).length, 1); assert.match(body, /data-detail-stage="ended"/);
  assert.doesNotMatch(render(<DetailRail data={ended} t={ja} language="ja" onRegister={() => {}} />), /イベントは終了しました/);
  assert.match(render(<EventDetailBody data={{ ...base, registrationClosesAt: "2026-01-01T00:00:00Z" }} language="ja" t={ja} railShown />), /data-detail-stage="closed"[^>]*>受付終了/);
  assert.doesNotMatch(render(<EventDetailBody data={base} language="ja" t={ja} railShown />), /data-detail-stage/);
});

test("rail: 参加 card (締切 / 審査 + the one 参加登録 button, no explanation line) → 关联 → host", () => {
  const html = render(<DetailRail data={base} t={ja} language="ja" onRegister={() => {}} />);
  const order = ["data-detail-register", "data-detail-relevance", "data-detail-host="].map((key) => html.indexOf(key));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]!)), String(order));
  assert.match(html, /締切<\/span><b>11\/26（木）<\/b>/); assert.match(html, /審査<\/span><b>あり<\/b>/);
  assert.equal((html.match(/>参加登録</g) ?? []).length, 1);
  assert.doesNotMatch(html, /AI が5問|参加登録をはじめる|会えそうな人|data-detail-meet/);
  // Registration closed and not registered → no card.
  assert.doesNotMatch(render(<DetailRail data={{ ...base, registrationClosesAt: "2026-01-01T00:00:00Z" }} t={ja} language="ja" onRegister={() => {}} />), /data-detail-register/);
});

test("rail when registered: status chip + 会う準備へ + ⋯ in the card; no date / venue repeated", () => {
  const html = render(<DetailRail data={{ ...base, venue: "渋谷", registration: { href: "", status: "registered" } }} t={ja} language="ja" onRegister={() => {}} actions={{ onCalendar: () => {}, onCancel: () => {} }} />);
  assert.match(html, /data-detail-going/); assert.match(html, /参加確定/); assert.match(html, /href="\/app\/events\/evt6\/prep"[^>]*>会う準備へ/);
  assert.match(html, /data-detail-more/); assert.doesNotMatch(html.slice(html.indexOf("data-detail-going"), html.indexOf("data-detail-relevance")), /渋谷|受付 QR/);
});

test("rail when ended: 参加しました + 会場の記録 (or ふりかえり); not registered → no card; no 关联; host card ends with 次回", () => {
  const ended = { ...base, startsAt: "2026-04-25T09:30:00Z", endsAt: "2026-04-25T12:00:00Z" };
  const record = render(<DetailRail data={{ ...ended, registration: { href: "", status: "attended" }, venueRecord: { checkedIn: true, exchanged: 0, recommended: 0, tablemates: 3 } }} t={ja} language="ja" onRegister={() => {}} />);
  assert.match(record, /参加しました/); assert.match(record, /href="\/app\/events\/evt6\/live"[^>]*>.*会場の記録/);
  assert.match(render(<DetailRail data={{ ...ended, registration: { href: "", status: "attended" } }} t={ja} language="ja" onRegister={() => {}} />), /href="\/app\/events\/evt6\/after"[^>]*>ふりかえり/);
  const none = render(<DetailRail data={ended} t={ja} language="ja" onRegister={() => {}} />);
  assert.doesNotMatch(none, /data-detail-join|data-detail-register|data-detail-relevance/);
  assert.match(none, /data-detail-ended=""[^>]*><span>次回<\/span>/); assert.match(none, /data-detail-ended-none/);
  const next = render(<DetailRail data={{ ...ended, organizer: { ...ended.organizer, next: { eventId: "evt next/7", startsAt: "2099-12-19T10:00:00Z", title: "第七期" } } }} t={ja} language="ja" onRegister={() => {}} />);
  assert.match(next, /data-detail-ended-next="evt next\/7" href="\/app\/events\/evt%20next%2F7"><span[^>]*>12\/19<\/span><b[^>]*>第七期<\/b>/);
});

test("host card: one stats line, follow on the same row, bio, 以往活动 (2, linked, N 人 only when known) and 主办方页面 ›; anonymous host → no host block", () => {
  const html = render(<DetailRail data={base} t={t} language="zh" onRegister={() => {}} />);
  assert.match(html, /data-detail-host-stats="">办过5场 · 平均30人参加 · 你去过2次</);
  assert.match(html, /data-detail-follow=""[^>]*>关注</);
  assert.match(html, /data-detail-host-bio="">连接中日创业者与投资人的交流社群，每月一次。</);
  assert.match(html, /以往活动/); assert.match(html, /href="\/app\/o\/jcia"[^>]*>主办方页面/);
  assert.match(html, /href="\/app\/events\/evt5"[^>]*><span[^>]*>10\/25<\/span><span[^>]*>第五期 中日创业交流会<\/span><span[^>]*>32人</);
  assert.match(html, /href="\/app\/events\/evt4"[^>]*><span[^>]*>09\/27<\/span><span[^>]*>第四期 中日创业交流会<\/span><\/a>/);
  const bare = render(<DetailRail data={{ ...base, organizer: { name: "主办方A", editions: 1, averageAttendance: null, myAttendance: 0 } }} t={t} language="zh" onRegister={() => {}} />);
  assert.match(bare, /data-detail-host-stats="">办过1场</); assert.doesNotMatch(bare, /data-detail-host-bio|以往活动|主办方页面|data-detail-follow/);
  const anon = { ...base, organizer: { name: "Organizer #1N54UV4", unnamed: true } };
  assert.doesNotMatch(render(<DetailRail data={anon} t={t} language="zh" onRegister={() => {}} />), /data-detail-host=/);
  assert.doesNotMatch(render(<EventDetailBody data={anon} language="zh" t={t} />), /data-detail-host=|Organizer #/);
});

test("people preview: avatars + プランに合う / 知り合い line + up to 3 plan-fit people (else the first 3) + 知り合い row + 全員を見る N名 → /people", () => {
  const attendees = [person("a"), person("b", { planFit: true, wanted: true }), person("c"), person("d", { planFit: true }), person("e"), person("f")];
  const data = { ...base, attendeeCounts: { all: 120, known: 2, planFit: 2 }, attendees, knownAttendees: [{ initial: "山", name: "山田 健太" }, { initial: "鈴", name: "鈴木 一郎", speaker: true }], rosterLocked: false, registration: { href: "", status: "registered" as const } };
  const html = render(<EventDetailBody data={data} language="ja" t={ja} railShown onOpenPerson={() => {}} selectedPersonId="b" />);
  assert.match(html, /data-detail-people-counts=""><span>プランに合う <b>2<\/b><\/span><span>知り合い <b>2<\/b><\/span>/);
  assert.match(html, /data-detail-picks="2"/); assert.match(html, /会いたい人/);
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*data-detail-person="b"/); assert.match(html, /<button[^>]*aria-pressed="false"[^>]*data-detail-person="d"/);
  assert.doesNotMatch(html, /data-detail-person="a"/);
  assert.match(html, /data-detail-known="2"[\s\S]*知り合い 2名も参加[\s\S]*山田さん · 鈴木さん（登壇）/);
  assert.match(html, /data-detail-people-all="" href="\/app\/events\/evt6\/people">全員を見る 120名/);
  // Nobody fits the plan → first three of the list, no 会いたい人 label.
  const plain = render(<EventDetailBody data={{ ...data, attendees: attendees.map((item) => ({ ...item, planFit: false })) }} language="ja" t={ja} railShown />);
  assert.match(plain, /data-detail-picks="3"/); assert.doesNotMatch(plain, /会いたい人/);
  assert.match(plain, /data-detail-person-row="a"[\s\S]*data-detail-person-row="b"[\s\S]*data-detail-person-row="c"/);
  // Phone: same block, 全員を見る as a full-width button.
  const phone = render(<PhoneDetailBody data={data} language="ja" t={ja} onRegister={() => {}} onOpenPerson={() => {}} />);
  assert.match(phone, /data-detail-picks="2"/); assert.match(phone, /href="\/app\/events\/evt6\/people"[^>]*>全員を見る 120名</);
  assert.doesNotMatch(phone, /role="tab"|data-detail-tab/);
});

test("people zero / locked: one line, or mosaic avatars + count + one sentence with no extra button", () => {
  assert.match(render(<EventDetailBody data={base} language="ja" t={ja} railShown />), /data-detail-people-none=""[^>]*>まだ申込はありません/);
  const locked = render(<EventDetailBody data={{ ...base, attendeeCounts: { all: 128, known: 3, planFit: 0 }, rosterLocked: true }} language="ja" t={ja} railShown />);
  assert.equal((locked.match(/data-roster-masked/g) ?? []).length, 5);
  assert.match(locked, /参加予定 <b>128<\/b>名/); assert.match(locked, /知り合い <b>3<\/b>名/);
  assert.match(locked, /data-roster-gate=""[\s\S]*参加登録すると、名前と一言が見られます/);
  assert.doesNotMatch(locked.slice(locked.indexOf("data-detail-people")), /<button|全員を見る|data-detail-people-all/);
});

test("phone: no tabs; order cover → 关联 → 紹介 → アジェンダ → 参加者 → 主催; bottom bar = ☆ + 参加登録; ended → no bar", () => {
  const html = render(<PhoneDetailBody data={{ ...base, description: "介绍", agenda }} language="ja" t={ja} onRegister={() => {}} />);
  const order = ["data-detail-cover", "data-detail-relevance", "data-detail-intro", "data-detail-agenda", "data-detail-people", "data-detail-host="].map((key) => html.indexOf(key));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]!)), String(order));
  assert.match(html, /data-detail-cta=""[\s\S]*aria-label="[^"]+"[\s\S]*>参加登録</);
  const ended = render(<PhoneDetailBody data={{ ...base, startsAt: "2026-04-25T09:30:00Z", endsAt: "2026-04-25T12:00:00Z" }} language="ja" t={ja} onRegister={() => {}} />);
  assert.doesNotMatch(ended, /data-detail-cta|data-detail-relevance/);
  const going = render(<PhoneDetailBody data={{ ...base, registration: { href: "", status: "registered" } }} language="ja" t={ja} onRegister={() => {}} actions={{ onCalendar: () => {}, onCancel: () => {} }} />);
  assert.match(going, /data-detail-going/); assert.match(going, /data-detail-cta=""[\s\S]*href="\/app\/events\/evt6\/prep"[^>]*>会う準備へ/);
});

test("full roster page filter: plan fit / known / all + search over name, company and title", () => {
  const people = [person("a", { name: "王 磊", org: "華東キャピタル", planFit: true }), person("b", { known: true, name: "陳 浩", org: "深圳ハードウェア" }), person("c", { name: "Ito", org: "Kite Partners", role: "Associate" })];
  assert.deepEqual(filterPeople(people, "planFit", "").map((item) => item.attendeeId), ["a"]);
  assert.deepEqual(filterPeople(people, "known", "").map((item) => item.attendeeId), ["b"]);
  assert.deepEqual(filterPeople(people, "all", " kite ").map((item) => item.attendeeId), ["c"]);
  assert.deepEqual(filterPeople(people, "all", "associate").map((item) => item.attendeeId), ["c"]);
  assert.deepEqual(filterPeople(people, "planFit", "陳"), []);
});

test("overview schema: organizer bio / past are optional and tolerant (old clients and bad rows)", () => {
  const parsed = eventOverviewResponseSchema.parse({ ...base, organizer: { ...base.organizer, bio: 5, past: [{ eventId: "x", title: "t", startsAt: "s", attendance: -1 }, { bad: true }] } });
  assert.equal(parsed.organizer.bio, null);
  assert.deepEqual(parsed.organizer.past, [{ attendance: null, eventId: "x", startsAt: "s", title: "t" }]);
  const { bio: _b, past: _p, ...older } = base.organizer;
  assert.equal(eventOverviewResponseSchema.parse({ ...base, organizer: older }).organizer.past, undefined);
});
