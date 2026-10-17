// R17 主催（App）：運営センター / イベント運営（概要・マッチング・参加者・レポート）/ 受付 / 共同運営に参加 / 公開主催者ページ 的渲染（各三态），
// 受付的本机队列（幂等补发、网络中断、被拒留队）与名单缓存（TTL = cacheUntil、没有权限即清），以及路由接线。
// 夹具 = mock 服务器（示例世界，画板数据）的真实回答，经同步来的 schema 解析。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";

import type { HostKioskResponse, HostMatchingResponse, HostOverviewResponse, HostPeopleResponse } from "../src/api/contract/host-console";
import type { HostCenterResponse } from "../src/api/contract/host-events";
import type { OrganizerPublicResponse } from "../src/api/contract/organizer-profile";
import { hostKioskResponseSchema, hostMatchingResponseSchema, hostOverviewResponseSchema, hostPeopleResponseSchema } from "../src/api/schema/host-console";
import { hostCenterResponseSchema } from "../src/api/schema/host-events";
import { organizerPublicResponseSchema } from "../src/api/schema/organizer-profile";
import { ja } from "../src/i18n/ja";
import { HostCenterBody, normalizeCode } from "../src/screens/host/center-view";
import { CheckInBody } from "../src/screens/host/check-in-view";
import { MatchingBody, OverviewBody, PeopleBody, ReportBody, SegChips } from "../src/screens/host/console-view";
import { JoinCard } from "../src/screens/host/join-view";
import { OrganizerBody } from "../src/screens/host/organizer-view";
import { consoleHref, consoleSubtitle, hostEventsRowSub, parseSeg, rowNote } from "../src/screens/host/host-model";
import { applyRoster, flushQueue, memoryKioskStore, readRoster, searchRoster, streamRows, type KioskQueueItem, purgeExpiredRosters } from "../src/screens/host/kiosk-queue";
import { renderedText } from "./helpers/render";

const dict = ja as Record<string, string>;
const t = (key: string, values?: Record<string, string | number>) => {
  const template = dict[`host.${key}`];
  assert.ok(template !== undefined, `missing host.${key}`);
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (values && name in values ? String(values[name]) : match));
};
const fixture = <T,>(name: string, schema: { parse: (value: unknown) => unknown }) => schema.parse(JSON.parse(readFileSync(new URL(`./fixtures/host/${name}.json`, import.meta.url), "utf8"))) as T;
const center = fixture<HostCenterResponse>("center-many", hostCenterResponseSchema);
const overview = fixture<HostOverviewResponse>("overview", hostOverviewResponseSchema);
const matching = fixture<HostMatchingResponse>("matching", hostMatchingResponseSchema);
const people = fixture<HostPeopleResponse>("people", hostPeopleResponseSchema);
const kiosk = fixture<HostKioskResponse>("kiosk", hostKioskResponseSchema);
const organizer = fixture<OrganizerPublicResponse>("organizer", organizerPublicResponseSchema);
const noop = () => undefined;
const centerProps = { filter: "all" as const, language: "ja", onCheckInOnly: noop, onCreate: noop, onFilter: noop, onJoin: noop, onOpenRow: noop, onRowAction: noop, onSendPc: noop, onTemplate: noop, t };

test("運営センター: empty shows the guide, three tiles and the faded sample (b6 #21)", () => {
  const empty: HostCenterResponse = { ...center, events: [], filterCounts: { all: 0, ended: 0, inactive: 0, live: 0, upcoming: 0 }, kpi: null, summary: { activeCount: 0, appliedThisMonth: 0, eventCount: 0 }, todo: [] };
  const text = renderedText(<HostCenterBody {...centerProps} data={empty} />);
  for (const phrase of ["最初のイベントを", "PC で開くリンクを自分に送る", "テンプレート", "共同運営に参加", "受付だけ担当", "作成するとこう並びます", "サンプル", "受付中 · 残り 42名"]) assert.match(text, new RegExp(phrase));
});

test("運営センター: one event has no filter and the PC card (b12 #420); many shows the filter and every row (b6 #22)", () => {
  const one = { ...center, events: center.events.slice(2, 3), summary: { ...center.summary, eventCount: 1 } };
  const few = renderedText(<HostCenterBody {...centerProps} data={one} />);
  assert.match(few, /資金調達 実践ラウンドテーブル/);
  assert.match(few, /審査待ち 3名/);
  assert.match(few, /作成と申込フォームの編集は PC が便利です/);
  assert.doesNotMatch(few, /開催前.*開催中.*終了/);
  const many = renderedText(<HostCenterBody {...centerProps} data={center} />);
  for (const phrase of ["すべて", "開催前", "開催中", "終了", "CFO Night Tokyo vol.18", "10月7日（水）19:00 · 渋谷ストリーム", "受付を開く", "運営画面へ", "マッチング未生成", "会後フォロー 61%"]) assert.match(many, new RegExp(phrase.replace(/[()（）]/g, ".")));
  assert.match(many, /128\s*\/150/);
  assert.equal(rowNote(center.events[0]!, t), "受付中 · 残り 42名");
});

test("イベント運営 概要 (b6 #23): counts, arrival, matching draft and the two todos; レポート摘要 (b12 #430)", () => {
  const text = renderedText(<OverviewBody data={overview} t={t} onCheckIn={noop} onNotify={noop} onPublish={noop} onResults={noop} onReview={noop} />);
  for (const phrase of ["到着 86 / 128 · 67%", "2ラウンド · 22テーブル", "下書き", "結果を見る", "公開する", "未配置 3名", "要対応", "審査待ち 12名", "当日枠 8名分", "プロフィール未完了 16名", "申込設定とレポートの詳細は PC で編集できます"]) assert.match(text, new RegExp(phrase));
  const quiet = renderedText(<OverviewBody data={{ ...overview, matching: { ...overview.matching, state: "none" }, todos: [] }} t={t} onCheckIn={noop} onNotify={noop} onPublish={noop} onResults={noop} onReview={noop} />);
  assert.doesNotMatch(quiet, /要対応|公開する/);
  const report = renderedText(<ReportBody data={overview} t={t} now={new Date("2026-10-07T13:00:00Z")} onPc={noop} />);
  assert.match(report, /受付率/); assert.match(report, /到着 86 \/ 128名 · 名刺交換 312件 · 本日 21:40 時点/); assert.match(report, /PC で詳細/);
  assert.match(renderedText(<ReportBody data={{ ...overview, reportSummary: null }} t={t} now={new Date()} onPc={noop} />), /開催後に受付率/);
  assert.match(renderedText(<SegChips seg="overview" t={t} pending={12} onSeg={noop} />), /参加者 12/);
  assert.equal(consoleSubtitle(overview.event.startsAt, "live", new Date("2026-10-07T12:00:00Z"), "ja", t), "本日 19:00 · 開催中");
});

test("マッチング結果 (b12 #422, view only) and 参加者 · 審査 (b12 #424)", () => {
  const text = renderedText(<MatchingBody data={matching} t={t} onRound={noop} />);
  assert.match(text, /見るだけです/); assert.match(text, /テーブル A/); assert.match(text, /第1ラウンド/);
  assert.match(renderedText(<MatchingBody data={{ ...matching, state: "none", tables: [] }} t={t} onRound={noop} />), /マッチングはまだ生成されていません/);
  const list = renderedText(<PeopleBody data={people} t={t} approving={null} onBucket={noop} onApprove={noop} />);
  assert.match(list, /審査待ち 12/); assert.match(list, /承認/); assert.match(list, /まとめて審査・見送りの理由メモは PC で/);
  assert.match(renderedText(<PeopleBody data={{ ...people, rows: [] }} t={t} approving={null} onBucket={noop} onApprove={noop} />), /条件に合う申込者はいません/);
});

const queued: KioskQueueItem = { at: "2026-10-07T10:46:00.000Z", eventId: kiosk.eventId, idempotencyKey: "k-1", initial: "木", name: "木村 洋平", org: "みずほ台ベンチャーズ", participantId: "participant:hp-kimura" };
const checkInProps = { busy: null, devices: 3, onArrive: noop, onQ: noop, onRetry: noop, onUndo: noop, onWalkIn: noop, t };

test("受付 (b6 #24): search results by status, the unsent row with 再試行, and the empty stream", () => {
  const text = renderedText(<CheckInBody {...checkInProps} data={kiosk} q="もり" rows={kiosk.rows} queue={[queued]} />);
  for (const phrase of ["到着", "86", "/ 128名", "森田 拓也", "テーブル C", "キャンセル待ち", "最新の受付", "3台で受付中", "19:46 · 送信できませんでした", "再試行", "藤井 誠一"]) assert.match(text, new RegExp(phrase));
  const none = renderedText(<CheckInBody {...checkInProps} data={kiosk} q="ほげ" rows={[]} queue={[]} />);
  assert.match(none, /「ほげ」に一致する方が見つかりません/);
  const before = renderedText(<CheckInBody {...checkInProps} data={{ ...kiosk, checkedIn: 0, recent: [] }} q="" rows={[]} queue={[]} />);
  assert.match(before, /最初の受付がここに流れます/);
  assert.equal(streamRows(kiosk.recent, [queued])[0]!.queued, true);
  assert.equal(streamRows(kiosk.recent, [queued]).filter((row) => row.participantId === queued.participantId).length, 1);
});

test("受付 offline queue: re-sends in order with the same keys, stops on network loss, keeps rejected items", async () => {
  const store = memoryKioskStore();
  await store.enqueue({ ...queued, at: "2026-10-07T10:40:00.000Z", idempotencyKey: "a", participantId: "p-a" });
  await store.enqueue({ ...queued, at: "2026-10-07T10:41:00.000Z", idempotencyKey: "b", participantId: "p-b" });
  await store.enqueue({ ...queued, at: "2026-10-07T10:42:00.000Z", idempotencyKey: "c", participantId: "p-c" });
  await store.enqueue({ ...queued, at: "2026-10-07T10:40:00.000Z", idempotencyKey: "a", participantId: "p-a" });
  assert.equal(store.dump().queue.length, 3, "same idempotency key is stored once");
  const seen: string[] = [];
  const ok = (participantId: string, duplicate = false) => ({ data: { checkedInAt: null, duplicate, name: "", overCapacity: false, participantId, receptionNumber: null, status: "checked_in" as const, table: null }, ok: true as const });
  const first = await flushQueue(store, kiosk.eventId, async (item) => { seen.push(item.idempotencyKey); return item.idempotencyKey === "b" ? { ok: false, reason: "network" } : ok(item.participantId); });
  assert.deepEqual(seen, ["a", "b"]);
  assert.deepEqual(first, { duplicate: 0, failed: 0, sent: 1, stopped: true });
  const second = await flushQueue(store, kiosk.eventId, async (item) => (item.idempotencyKey === "c" ? { ok: false, reason: "conflict" } : ok(item.participantId, true)));
  assert.deepEqual(second, { duplicate: 1, failed: 1, sent: 0, stopped: false });
  assert.deepEqual(store.dump().queue.map((item) => [item.idempotencyKey, item.error]), [["c", "conflict"]]);
  const auto = await flushQueue(store, kiosk.eventId, async () => { throw new Error("rejected items are not retried automatically"); });
  assert.equal(auto.sent + auto.failed, 0);
  await flushQueue(store, kiosk.eventId, async (item) => ok(item.participantId), true);
  assert.equal(store.dump().queue.length, 0, "manual 再試行 re-sends the rejected item");
});

test("受付 roster cache: kept until cacheUntil by the kiosk clock, cleared when expired or when access is gone", async () => {
  const store = memoryKioskStore();
  const now = new Date(kiosk.now);
  const saved = await applyRoster(store, kiosk.eventId, { data: { cacheUntil: kiosk.cacheUntil, rows: kiosk.rows }, ok: true }, now);
  assert.ok(saved);
  assert.ok(await readRoster(store, kiosk.eventId, now));
  assert.equal(searchRoster(saved!.rows, "もり", new Set(["participant:hp-morita"])).find((row) => row.name === "森田 拓也")?.status, "checked_in");
  assert.equal(await readRoster(store, kiosk.eventId, new Date(Date.parse(kiosk.cacheUntil) + 1)), null);
  assert.equal(store.dump().rosters.length, 0, "expired roster is deleted");
  await applyRoster(store, kiosk.eventId, { data: { cacheUntil: kiosk.cacheUntil, rows: kiosk.rows }, ok: true }, now);
  await applyRoster(store, kiosk.eventId, { ok: false, reason: "forbidden" }, now);
  assert.equal(store.dump().rosters.length, 0, "no check-in access → no cached roster");
  assert.equal(await applyRoster(store, kiosk.eventId, { data: { cacheUntil: "2026-10-01T00:00:00Z", rows: kiosk.rows }, ok: true }, now), null);
});

test("共同運営に参加 (b12 #416) and the invalid invite", () => {
  const valid = renderedText(<JoinCard invite={{ eventId: "e", eventTitle: "CFO Night Tokyo vol.18", expiresAt: "2026-10-14T05:00:00Z", inviterName: "佐藤 健一", organizerName: "CFO Night 実行委員会", role: "check_in", valid: true }} t={t} busy={false} onCode={noop} onJoin={noop} />);
  for (const phrase of ["共同運営への招待", "CFO Night 実行委員会 · 佐藤 健一 さんから", "役割：受付", "当日の受付と到着の記録ができます", "参加する", "コードを入力する", "10/14 まで"]) assert.match(valid, new RegExp(phrase));
  assert.match(renderedText(<JoinCard invite={{ eventId: null, eventTitle: null, expiresAt: null, inviterName: null, organizerName: null, role: null, valid: false }} t={t} busy={false} onCode={noop} onJoin={noop} />), /この招待は使えません/);
  assert.equal(normalizeCode("h7kq m2tr"), "H7KQ-M2TR");
});

test("公開主催者ページ (b7 #36–#38): empty, few and many (3 past, then すべて見る)", () => {
  const props = { busy: false, following: false, language: "ja", onFollow: noop, onOpen: noop, onSeeAll: noop, onShare: noop, t };
  const empty = renderedText(<OrganizerBody {...props} data={{ ...organizer, past: [], pastTotal: 0, upcoming: [] }} />);
  assert.match(empty, /公開中のイベントはまだありません/); assert.match(empty, /次のイベントがここに表示されます/);
  const many = { ...organizer, past: [1, 2, 3, 4].map((n) => ({ ...organizer.past[0]!, eventId: `p${n}`, title: `vol.${n}` })), pastTotal: 18 };
  const text = renderedText(<OrganizerBody {...props} data={many} />);
  for (const phrase of ["主催者", "開催回数", "フォローする", "これからのイベント", "詳細・申込", "共有", "過去のイベント", "18件", "すべて見る（18件）", "このページは主催者が公開しています"]) assert.match(text, new RegExp(phrase.replace(/[()（）]/g, ".")));
  assert.doesNotMatch(text, /vol\.4/);
  assert.match(renderedText(<OrganizerBody {...props} data={many} expanded following />), /vol\.4[\s\S]*|フォロー中/);
});

test("model helpers: seg parsing, links, マイページ row text", () => {
  assert.equal(parseSeg("people"), "people"); assert.equal(parseSeg("bogus"), "overview");
  assert.equal(consoleHref("a b", "report"), "/events/a%20b/operations?seg=report");
  assert.equal(hostEventsRowSub({ activeCount: 1, appliedThisMonth: 0, eventCount: 2 }, t), "2件 · 運営中 1");
  assert.equal(hostEventsRowSub({ activeCount: 0, appliedThisMonth: 0, eventCount: 0 }, t), "イベントを主催する");
});

test("routes: R17 screens behind the right gates; old operations pages redirect to ?seg=", () => {
  const read = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
  assert.match(read("events/center.tsx"), /withOrbitPrivateRoute\(withOnlineOnlyRoute\(HostCenterScreen\)\)/);
  assert.match(read("events/[id]/operations.tsx"), /withOrbitPrivateRoute\(withOnlineOnlyRoute\(HostConsoleScreen\)\)/);
  const checkIn = read("events/[id]/operations/check-in.tsx");
  assert.match(checkIn, /withOrbitPrivateRoute\(HostCheckInScreen\)/);
  assert.doesNotMatch(checkIn, /withOnlineOnlyRoute/, "check-in works offline (queue + cached roster)");
  for (const [file, seg] of [["events/[id]/operations/admission.tsx", "people"], ["events/[id]/operations/experience.tsx", "overview"], ["events/[id]/operations/roles.tsx", "overview"], ["events/[id]/analytics.tsx", "report"]] as const) assert.match(read(file), new RegExp(`LegacyOperationsRedirect to="${seg}"`), file);
  assert.match(read("o/[slug].tsx"), /OrganizerPublicPage/);
  assert.match(read("host/join/[code].tsx"), /HostJoinScreen/);
  assert.match(read("e/[slug].tsx"), /EventShortLinkScreen/);
  for (const file of ["events/center/new.tsx", "events/center/profiles.tsx", "events/center/profiles/[id].tsx", "events/[id]/edit.tsx"]) assert.match(read(file), /HostPcOnlyScreen/, file);
});

test("受付 本机清理（R17 复核）：启动清所有过期名单；失去权限清这场的名单与队列；注销 clearAll", async () => {
  const store = memoryKioskStore();
  await store.saveRoster({ cacheUntil: "2026-10-08T11:00:00Z", eventId: "e-old", rows: [], savedAt: "2026-10-07T00:00:00Z" });
  await store.saveRoster({ cacheUntil: "2026-10-09T00:00:00Z", eventId: "e-now", rows: [], savedAt: "2026-10-08T00:00:00Z" });
  assert.equal(await purgeExpiredRosters(store, new Date("2026-10-08T12:00:00Z")), 1);
  assert.deepEqual(store.dump().rosters.map((cache) => cache.eventId), ["e-now"]);
  await store.enqueue({ at: "2026-10-08T11:59:00Z", eventId: "e-now", idempotencyKey: "k1", initial: "森", name: "森 由香", org: null, participantId: "p1" });
  await store.enqueue({ at: "2026-10-08T11:59:30Z", eventId: "e-other", idempotencyKey: "k2", initial: "木", name: "木村", org: null, participantId: "p2" });
  await store.clearEvent("e-now");
  assert.deepEqual(store.dump().rosters, []);
  assert.deepEqual(store.dump().queue.map((item) => item.idempotencyKey), ["k2"]);
  await store.clearAll();
  assert.deepEqual(store.dump().queue, []);
});

