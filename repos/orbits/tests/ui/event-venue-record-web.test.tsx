// 2026-11-20 活动页改版 Web（event-web-revisit-cover-width-proposal）：会場の記録 / 参加者の詳細 / 活动图片 / 主办上传。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { exchangeView, tokyoMonthDay } from "../../app/(app)/app/orbit-2026/events/AttendeeProfile";
import { EventCard, coverBands, journeyTranslator } from "../../app/(app)/app/orbit-2026/events/DiscoverTab";
import { EventDetailBody } from "../../app/(app)/app/orbit-2026/events/EventDetail";
import { VenueRecordView, firstRecordPerson, recordSummary } from "../../app/(app)/app/orbit-2026/events/VenueRecord";
import { dragFocus } from "../../app/(app)/app/orbit-2026/host/CoverField";
import { coverShown } from "../../app/(app)/app/orbit-2026/host/HostEventForm";
import { COVER_TARGET, coverKindOf, fitEdge, needsShrink } from "../../app/(app)/app/orbit-2026/host/cover-upload";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import type { EventOverviewResponse } from "../../shared/contract/event-overview";
import type { EventVenueResponse } from "../../shared/contract/event-venue";

const t = journeyTranslator("ja");
const render = (node: React.ReactNode) => renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);

test("D2 coverBands: a row (3 per row) with any image bands its image-less cards; a row with no image stays as is", () => {
  assert.deepEqual(coverBands([{ coverUrl: "/a.jpg" }, {}, { coverUrl: null }, {}, {}, {}, {}]), [false, true, true, false, false, false, false]);
  assert.deepEqual(coverBands([{}, {}, {}, {}, { coverUrl: "/b.jpg" }]), [false, false, false, true, false]);
  assert.deepEqual(coverBands([]), []);
});

test("EventCard: image = 2:1 bleed + registered chip on the image, no emoji tile; band = colour band + emoji; plain = unchanged", () => {
  const row = { emoji: "🥂", eventId: "e1", href: "/app/events/e1", registrationCount: 24, startsAt: "2026-11-28T10:00:00Z", title: "投資家×起業家 ナイトサロン" };
  const withImage = render(<EventCard row={{ ...row, coverUrl: "/orbit-covers/events/investor-founder-salon.jpg" }} index={0} language="ja" t={t} onOpen={() => {}} />);
  assert.match(withImage, /data-discover-cover=""><img src="\/orbit-covers\/events\/investor-founder-salon.jpg"/);
  assert.match(withImage, /data-discover-registered="">申込 24名/);
  assert.doesNotMatch(withImage, /🥂/);
  const banded = render(<EventCard row={row} index={1} band language="ja" t={t} onOpen={() => {}} />);
  assert.match(banded, /data-discover-band=""><span[^>]*>🥂<\/span>/);
  const plain = render(<EventCard row={row} index={1} language="ja" t={t} onOpen={() => {}} />);
  assert.doesNotMatch(plain, /data-discover-band|data-discover-cover/);
  assert.match(plain, /🥂/);
});

const overview: EventOverviewResponse = {
  agenda: [], attendeeCounts: { all: 2, known: 0, planFit: 0 }, attendees: [{ attendeeId: "a1", initial: "王", known: false, name: "王 磊", org: "華東キャピタル", planFit: false, wanted: false }, { attendeeId: "a2", initial: "陳", known: false, name: "陳 浩", org: "深圳ハードウェア", planFit: false, wanted: false }],
  coverUrl: "/orbit-covers/events/chinese-business-community-salon.jpg", deadlineSoon: false, emoji: "🥂", endsAt: "2026-10-03T12:30:00Z", eventId: "e1", knownAttendees: [], organizer: { name: "主催" },
  registration: { href: "/x", status: "attended" }, review: false, rosterLocked: false, startsAt: "2026-10-03T10:00:00Z", title: "サロン", venueRecord: { checkedIn: true, exchanged: 2, recommended: 3, tablemates: 5 },
} as EventOverviewResponse;

test("detail body: cover image replaces the gradient band; attendee cards are buttons with › and a selected ring only when openable", () => {
  const html = render(<EventDetailBody data={overview} language="ja" t={t} railShown onOpenPerson={() => {}} selectedPersonId="a1" />);
  assert.match(html, /<img[^>]*src="\/orbit-covers\/events\/chinese-business-community-salon.jpg"[^>]*data-detail-cover-photo=""/);
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*data-detail-person="a1"/);
  assert.match(html, /<button[^>]*aria-pressed="false"[^>]*data-detail-person="a2"/);
  // 2026-11-21 单页：不可点开时（公开页）参加者是普通行（data-detail-person-row），不是按钮。
  const pub = render(<EventDetailBody data={{ ...overview, coverUrl: null }} language="ja" t={t} railShown />);
  assert.doesNotMatch(pub, /data-detail-person=|data-detail-cover-photo/, "public page / no image: unchanged");
  assert.match(pub, /data-detail-person-row="a1"/);
});

test("参加者の詳細 exchange footer: exchanged / incoming (needs id + revision) / requested / request / none", () => {
  const base = { canRequestExchange: false, contactId: null, requestId: null, requestRevision: null };
  assert.equal(exchangeView({ ...base, contactId: "c1", exchange: "exchanged" }), "exchanged");
  assert.equal(exchangeView({ ...base, exchange: "incoming", requestId: "r1", requestRevision: 1 }), "incoming");
  assert.equal(exchangeView({ ...base, exchange: "incoming" }), "none", "incoming without ids cannot be answered");
  assert.equal(exchangeView({ ...base, exchange: "requested" }), "requested");
  assert.equal(exchangeView({ ...base, canRequestExchange: true, exchange: "none" }), "request");
  assert.equal(exchangeView({ ...base, exchange: "none" }), "none", "after 30 days: nothing to do");
  assert.equal(tokyoMonthDay("2026-11-02T12:30:00.000Z"), "11/2");
  assert.equal(tokyoMonthDay("2026-11-02T16:00:00.000Z"), "11/3", "Tokyo date");
  assert.equal(tokyoMonthDay(null), "");
});

const venue = (patch: Partial<EventVenueResponse> = {}): EventVenueResponse => ({
  agenda: [{ at: "19:00", title: "受付" }], attendeeTotal: 3, attendees: [], checkedIn: true, endsAt: "2026-10-03T12:30:00Z", eventId: "e1", nextOrder: [], now: "2026-10-07T03:00:00Z", openers: [], readOnly: true,
  recommendations: [{ attendeeId: "w", exchange: "exchanged", initial: "王", name: "王 磊", participantId: "w", relation: "exchanged", table: "A-1", wanted: true, why: "シード投資" }],
  rounds: [
    { round: 1, table: "A-1", theme: "資金調達", title: "R1 · 自己紹介", why: "投資家が揃うテーブル", whyDetail: "申込の回答から", tablemates: [{ attendeeId: "w", initial: "王", name: "王 磊" }, { attendeeId: "l", initial: "劉", name: "劉 洋" }] },
    { round: 2, table: "C-2", tablemates: [{ attendeeId: "l", initial: "劉", name: "劉 洋" }, { attendeeId: "c", initial: "陳", name: "陳 浩" }] },
  ],
  startsAt: "2026-10-03T10:00:00Z", state: "ended", stats: { exchanged: 2, incoming: 1, wantedMet: 1, wantedTotal: 2 }, title: "サロン", ...patch,
});

test("record summary: distinct tablemates across rounds; empty only when no rounds and no recommendations; first person = first tablemate", () => {
  assert.deepEqual(recordSummary(venue()), { empty: false, exchanged: 2, tablemates: 3, wantedMet: 1, wantedTotal: 2 });
  assert.equal(recordSummary(venue({ rounds: [], recommendations: [] })).empty, true);
  assert.equal(recordSummary(venue({ rounds: [] })).empty, false);
  assert.equal(firstRecordPerson(venue())?.attendeeId, "w");
  assert.equal(firstRecordPerson(venue({ rounds: [] }))?.attendeeId, "w");
  assert.equal(firstRecordPerson(venue({ rounds: [], recommendations: [] })), null);
});

test("record page groups: no write actions; stats with ふりかえり link only when checked in; rounds with table / theme / ? / clickable mates; empty state", () => {
  const html = render(<VenueRecordView data={venue()} eventId="e1" language="ja" t={t} />);
  assert.match(html, /当日の記録 · 閲覧のみ/);
  assert.doesNotMatch(html, /交換を申請|承認して交換|下書きをつくる|現場|マップ/);
  assert.match(html, /data-record-after=""[^>]*>今日のふりかえりへ/);
  assert.match(html, /data-record-round="1"[\s\S]*Round 1 · 自己紹介[\s\S]*資金調達[\s\S]*A-1[\s\S]*投資家が揃うテーブル/);
  assert.match(html, /data-record-person="l"/);
  assert.doesNotMatch(render(<VenueRecordView data={venue({ checkedIn: false })} eventId="e1" language="ja" t={t} />), /data-record-after/);
  const empty = render(<VenueRecordView data={venue({ recommendations: [], rounds: [] })} eventId="e1" language="ja" t={t} />);
  assert.match(empty, /data-record-empty=""[\s\S]*あなたはグループ分けに入っていませんでした[\s\S]*参加者一覧[\s\S]*アジェンダ/);
  // 2026-11-21：「参加者一覧」= 全名单页（与详情页「全員を見る」同一页）。
  assert.match(empty, /href="\/app\/events\/e1\/people"[^>]*>[\s\S]*?参加者一覧/);
  assert.doesNotMatch(empty, /data-record-tabs/);
});

test("host cover: shown image per pending change; drag maps to focusY within the overflow; file kinds and shrink rule", () => {
  assert.equal(coverShown({ kind: "keep" }, "/saved.webp"), "/saved.webp");
  assert.equal(coverShown({ kind: "remove" }, "/saved.webp"), null);
  assert.equal(coverShown({ blob: new Blob([]), focusY: 0.5, kind: "new", name: "a.jpg", url: "blob:x" }, null), "blob:x");
  // 1000×1000 image in a 600×300 box: shown 600 tall, overflow 300 → 30px down = focus −0.1.
  assert.equal(dragFocus(0.5, 30, { height: 300, width: 600 }, { height: 1000, width: 1000 }), 0.4);
  assert.equal(dragFocus(0.5, -1000, { height: 300, width: 600 }, { height: 1000, width: 1000 }), 1);
  assert.equal(dragFocus(0.5, 30, { height: 300, width: 600 }, { height: 500, width: 1000 }), 0.5, "already 2:1: nothing to move");
  assert.equal(coverKindOf({ name: "a.HEIC", type: "" }), "heic");
  assert.equal(coverKindOf({ name: "a.png", type: "image/png" }), "image");
  assert.equal(coverKindOf({ name: "a.gif", type: "image/gif" }), "unsupported");
  assert.equal(needsShrink(COVER_TARGET - 1, 2400, 1200), false);
  assert.equal(needsShrink(COVER_TARGET, 1600, 800), true);
  assert.equal(needsShrink(1000, 4000, 3000), true);
  assert.deepEqual(fitEdge(4000, 3000, 2400), { height: 1800, width: 2400 });
  assert.deepEqual(fitEdge(800, 400, 2400), { height: 400, width: 800 });
});

test("参加者の詳細 first paint (2026-11-21): skeleton while nothing is known; the last answer shows at once with no skeleton and no 未公開", async () => {
  const { AttendeeProfilePanel } = await import("../../app/(app)/app/orbit-2026/events/AttendeeProfile");
  const { rememberAnswer, resetLastAnswersForTests } = await import("../../app/(app)/app/orbit-last-answer");
  const { setSharedReadAccount } = await import("../../app/(app)/app/orbit-shared-read");
  resetLastAnswersForTests();
  setSharedReadAccount("actor:me");
  const seed = { attendeeId: "p1", initial: "王", name: "王 磊", org: "華東キャピタル", role: null };
  const cold = render(<AttendeeProfilePanel eventId="e1" seed={seed} language="ja" t={t} onClose={() => {}} />);
  assert.match(cold, /data-person-loading=""/);
  assert.match(cold, /王 磊/);
  assert.doesNotMatch(cold, /data-person-hidden/);
  rememberAnswer("events:attendee:e1:p1", { answers: [{ a: "SaaS", q: "業界" }], attendeeId: "p1", canRequestExchange: false, contactId: null, exchange: "none", exchangeUntil: null, initial: "王", intro: "越境 EC の話ができます", memo: null, name: "王 磊", org: "華東キャピタル", participantId: "p1", role: null, together: { recommended: false, sharedRounds: [], why: null, whyDetail: null } });
  const warm = render(<AttendeeProfilePanel eventId="e1" seed={seed} language="ja" t={t} onClose={() => {}} />);
  assert.doesNotMatch(warm, /data-person-loading/);
  assert.match(warm, /越境 EC の話ができます/);
  setSharedReadAccount(null);
  resetLastAnswersForTests();
});

test("rounds read 「Round n」, never a bare 「R1」 (2026-11-23: R1 / R2 meant nothing to people)", async () => {
  const { eventsJourneyCopy } = await import("../../app/(app)/app/orbit-2026/copy/eventsJourney");
  const bare = Object.entries(eventsJourneyCopy).flatMap(([key, entry]) => (["ja", "zh", "en"] as const).filter((lang) => /(^|[^A-Za-z])R\{|(^|[^A-Za-z])R\d/u.test((entry as Record<string, string>)[lang] ?? "")).map((lang) => `${key}.${lang}`));
  assert.deepEqual(bare, []);
  const { readFileSync } = await import("node:fs");
  for (const file of ["VenuePage.tsx", "VenueRecord.tsx", "AttendeeProfile.tsx"]) {
    const source = readFileSync(`app/(app)/app/orbit-2026/events/${file}`, "utf8");
    assert.doesNotMatch(source, />R\{|`R\$\{/u, file);
  }
});
