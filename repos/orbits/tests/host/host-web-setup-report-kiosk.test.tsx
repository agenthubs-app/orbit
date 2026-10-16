/**
 * R17 主催 Web 渲染（第 3 段）：申込設定 空 / 少 / 大，レポート 開催前 / 少 / 全体 / 自分の視点（抑制 →「—」），受付 kiosk 空 / 大 / 离线，
 * 以及 kiosk 离线队列的幂等补发与名单缓存 TTL（内存实现，不依赖浏览器）。数据来自 mock 示例世界（与像素门禁同一份）。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { consoleSubtitle } from "../../app/(app)/app/orbit-2026/host/HostConsole";
import { HostKioskView, minutesToDoors, notArrived, streamRows } from "../../app/(app)/app/orbit-2026/host/HostKiosk";
import { HostReportView, barHeights, funnelPercent, orDash, tableScale } from "../../app/(app)/app/orbit-2026/host/HostReport";
import { HostSetupView } from "../../app/(app)/app/orbit-2026/host/HostSetup";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { flushQueue, memoryKioskStore, readRoster, searchRoster, type KioskQueueItem } from "../../app/(app)/app/orbit-2026/host/kiosk-store";
import { addSuggested, agoText, charCount, draftInput, draftOf, draftProblems, hasLink, moveItem, switchKind, templateQuestions } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { DEFAULT_HOST_MOCK_STATE, HOST_EVENT_IDS, hostKiosk, hostKioskRoster, hostReport, hostSetup } from "../../shared/mock/demo-world/host-events";

const t = hostTranslator("ja");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const NOW = new Date("2026-10-07T03:00:00.000Z");

test("申込設定 · 空（b6 #13）：テンプレート 4 种、質問案 3つ、预览与受付の設定用朝会 #3", () => {
  const data = hostSetup(HOST_EVENT_IDS.asakai3)!;
  const html = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" host="orbit.app" now={NOW} />);
  assert.match(html, /data-host-setup="empty"/);
  assert.equal(count(html, "data-host-template="), 4);
  assert.match(html, /質問案を 3つ追加しますか？/);
  assert.match(html, /「製造業DX 朝会」の過去 2回の回答傾向から作成しました/);
  assert.match(html, /0 \/ 200/);
  assert.match(html, /60名/);
  assert.match(html, /10月20日（火）23:59/);
  assert.match(html, /orbit\.app\/e\/mfg-dx-asakai-3/);
  assert.match(html, /（説明文を入力するとここに表示されます）/);
  assert.doesNotMatch(html, /data-host-setup-save/);
  assert.equal(consoleSubtitle(data.event, "ja", t, NOW, "setup", data.formPublished), "主催 · 申込フォーム未公開");
});

test("申込設定 · 少（b6 #14）：下書き 2問、Q1 编辑中（4 选项 + 選択肢を追加）、公開する", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18, { ...DEFAULT_HOST_MOCK_STATE, setup: "few" })!;
  const html = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" now={NOW} />);
  assert.match(html, /data-host-setup="draft"/);
  assert.match(html, /2問 · ドラッグで並べ替え/);
  assert.equal(count(html, "data-editing"), 1);
  assert.match(html, /選択肢を追加/);
  assert.match(html, />下書き</);
  assert.match(html, />公開する</);
  assert.match(html, /64 \/ 200/);
  assert.match(html, /data-host-setup-settings/);
});

test("申込設定 · 大（b6 #15）：公開中 5問、未公開の変更 2件、変更を公開；预览只出前 3 问；公开中不出受付の設定", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const html = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" editing={1} now={new Date("2026-10-07T03:00:00.000Z")} />);
  assert.match(html, /data-host-setup="published"/);
  assert.match(html, /5問 · ドラッグで並べ替え/);
  assert.match(html, /未公開の変更 2件 · 2分前に自動保存/);
  assert.match(html, />変更を公開</);
  assert.doesNotMatch(html, /data-host-setup-settings/);
  assert.equal(consoleSubtitle(data.event, "ja", t, NOW, "setup", true), "主催 · 申込フォーム公開中");
});

test("申込設定 · 纯函数：字数、排序、题型切换暂存、模板、建议去重、草稿入力、链接检测、N分前", () => {
  assert.equal(charCount("𠮷野家"), 3);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  const q = { id: "x", kind: "single" as const, options: ["A", "B"], prompt: "Q", required: true };
  const free = switchKind(q, "free");
  assert.deepEqual(free.options, ["A", "B"]);
  assert.deepEqual(draftInput({ admissionMode: "review", capacity: 10, description: " d ", questions: [free, { ...q, options: ["A", " ", ""] }], registrationClosesAt: null }, 3).questions.map((item) => item.options), [[], ["A"]]);
  assert.equal(draftProblems({ admissionMode: "review", capacity: null, description: "", questions: [{ ...q, prompt: " " }], registrationClosesAt: null }), 1);
  assert.equal(templateQuestions("mixer", t).length, 3);
  assert.equal(templateQuestions("blank", t).length, 1);
  const suggested = hostSetup(HOST_EVENT_IDS.asakai3)!.suggestion!.questions;
  assert.equal(addSuggested(suggested.slice(0, 1), suggested).length, 3);
  assert.equal(addSuggested(Array.from({ length: 5 }, (_, i) => ({ ...q, id: `q${i}`, prompt: `p${i}` })), suggested).length, 5);
  assert.equal(hasLink("詳しくは https://example.com"), true);
  assert.equal(hasLink("example.jp を見て"), true);
  assert.equal(hasLink("名刺を 20枚ほどお持ちください。"), false);
  assert.equal(agoText("2026-10-07T02:58:00.000Z", NOW, t, () => "D"), "2分前");
  assert.equal(agoText("2026-10-05T02:58:00.000Z", NOW, t, () => "D"), "D");
});

test("お知らせの文面（b12 #406，折叠区）：6 种定型只显示 + ひとこと 140 字计数 + 预览", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const closed = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" now={NOW} />);
  assert.match(closed, /data-host-notices-toggle/);
  assert.doesNotMatch(closed, /data-host-notices=""/);
  const html = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" now={NOW} notesOpen noteDraft={data.hostNote!} />);
  assert.equal(count(html, 'aria-pressed="'), 6);
  assert.match(html, /38 \/ 140/); // 画板写 36（数错了），实际 38 字
  assert.match(html, /主催者より：/);
  assert.match(html, /CFO Night Tokyo vol\.18 への参加が承認されました/);
});

test("レポート · 開催前（b6 #16）：说明卡、申込 42 / 60名、推移 9 + 12 根、サンプル 4 格", () => {
  const data = hostReport(HOST_EVENT_IDS.asakai3, "all")!;
  const html = renderToStaticMarkup(<HostReportView data={data} t={t} />);
  assert.match(html, /data-host-report="before"/);
  assert.match(html, /レポートは開催後に表示されます/);
  assert.match(html, /42<small>\/ 60名<\/small>/);
  assert.match(html, /開催まで 14日/);
  assert.match(html, /公開から 9日/);
  assert.match(html, /サンプル/);
  assert.equal((html.match(/<i[ >\/]/g) ?? []).length, 9 + 12 + 1);
  assert.deepEqual(barHeights([3, 5, 8], true), [27, 45, 72]);
  assert.equal(consoleSubtitle(data.event, "ja", t, NOW, "report"), "主催 · 10月21日（水）8:00 · 開催前");
});

test("レポート · 少 / 全体（b6 #17 / #18）：受付率环、交換率 why、ファネル、テーブル別、立場；柱上标注", () => {
  const few = renderToStaticMarkup(<HostReportView data={hostReport(HOST_EVENT_IDS.founders11, "all")!} t={t} />);
  assert.match(few, /22<small[^>]*> \/ 24<\/small>/);
  assert.match(few, /1人あたり 2\.2名/);
  assert.match(few, /73% · 7日以内/);
  assert.equal(count(few, "data-mk="), 2);
  assert.doesNotMatch(few, /テーブル E は/);
  const data = hostReport(HOST_EVENT_IDS.cfo17, "all")!;
  const many = renderToStaticMarkup(<HostReportView data={data} t={t} why />);
  assert.match(many, /312<small>組<\/small>/);
  assert.match(many, /受付済み 118名のうち/);
  assert.doesNotMatch(many, /NFC/);
  assert.match(many, /テーブル E は欠席 2名で 3名卓に/);
  assert.equal(funnelPercent(74, 107), 69);
  assert.equal(tableScale([19, 9]), 20);
  assert.deepEqual(barHeights([3, 12]), [24, 96]);
  assert.deepEqual(barHeights([1, 3]), [28, 84]);
  assert.equal(consoleSubtitle(data.event, "ja", t, NOW, "report"), "主催 · 9月9日（水）19:00 · 終了");
});

test("レポート · 抑制：null 一律「—」", () => {
  const base = hostReport(HOST_EVENT_IDS.cfo17, "all")!;
  const all = { ...base.all!, checkInRate: null, checkedIn: null, exchangeRate: null, exchanges: null, exchangesPerPerson: null, followupRate: null, followups: null, funnel: { drafted: null, exchanged: null, followed: null, meetings: null }, standing: [{ label: "投資家", percent: null }], tables: [{ exchanges: null, round: 1, table: "A" }] };
  const html = renderToStaticMarkup(<HostReportView data={{ ...base, all }} t={t} />);
  assert.ok(count(html, "—") >= 10);
  assert.equal(orDash(null, "%"), "—");
  assert.equal(orDash(5, "%"), "5%");
});

test("レポート · 自分の視点（b6 #19）：3 格 + プランへの貢献、未フォロー 5名、下書きを作成、進捗ログ", () => {
  const html = renderToStaticMarkup(<HostReportView data={hostReport(HOST_EVENT_IDS.cfo17, "mine")!} t={t} />);
  assert.equal(count(html, "data-host-report-mine="), 3);
  assert.match(html, /VC パートナー \+2名/);
  assert.match(html, /スコア \+20（2 \/ 3人）· シリーズA 資金調達/);
  assert.match(html, /5名 · 交換から 28日/);
  assert.equal(count(html, "下書きを作成"), 5);
  assert.match(html, /送信はしません · 送信はあなたが行います/);
  assert.match(html, /進捗ログに記録しますか？/);
  assert.match(html, /主催者として/);
});

test("受付 kiosk · 空（b6 #10）：0 / 128、開場まで あと 14分、空の最新の受付", () => {
  const data = hostKiosk(HOST_EVENT_IDS.cfo18, "", { ...DEFAULT_HOST_MOCK_STATE, kiosk: "before" })!;
  const html = renderToStaticMarkup(<HostKioskView data={data} t={t} now={new Date(data.now)} online q="" rows={[]} queue={[]} devices={1} />);
  assert.match(html, /data-host-kiosk="before"/);
  assert.match(html, /開場まで あと 14分/);
  assert.match(html, /最初の受付がここに流れます/);
  assert.equal(count(html, "— : —"), 4);
  assert.match(html, />18:46</);
  assert.equal(minutesToDoors(data.doorsOpenAt, new Date("2026-10-07T10:05:00.000Z")), null);
  assert.equal(notArrived(0, 128), 128);
});

test("受付 kiosk · 大（b6 #11）：「もり」3 行（到着にする / 取り消す / 当日枠で受付）、3台で受付中、最新行高亮", () => {
  const data = hostKiosk(HOST_EVENT_IDS.cfo18, "もり")!;
  const html = renderToStaticMarkup(<HostKioskView data={data} t={t} now={new Date(data.now)} online q="もり" rows={data.rows} queue={[]} devices={data.devices} focused />);
  assert.match(html, /data-host-kiosk="live"/);
  assert.equal(count(html, "data-kiosk-row="), 3);
  assert.equal(count(html, "data-kiosk-arrive"), 1);
  assert.equal(count(html, "data-kiosk-undo"), 1);
  assert.equal(count(html, "data-kiosk-walkin"), 1);
  assert.match(html, /受付済み 19:12 · テーブル C/);
  assert.match(html, /自動更新 · 3台で受付中/);
  assert.match(html, /data-kiosk-caret/);
  assert.match(html, />86<small>/);
});

test("受付 kiosk · 离线（b6 #12）：本机 3 件未送信、横幅、计数含本机", () => {
  const state = { ...DEFAULT_HOST_MOCK_STATE, kiosk: "offline" as const };
  const data = hostKiosk(HOST_EVENT_IDS.cfo18, "", state)!;
  assert.equal(data.checkedIn, 83);
  const queue: KioskQueueItem[] = ["hp-matsumoto", "hp-fujii", "hp-kimura"].map((id, index) => ({ at: `2026-10-07T10:4${5 + (index === 2 ? 1 : 0)}:0${index}.000Z`, eventId: HOST_EVENT_IDS.cfo18, idempotencyKey: `k${index}`, name: id, org: null, participantId: `participant:${id}` }));
  const html = renderToStaticMarkup(<HostKioskView data={data} t={t} now={new Date(data.now)} online={false} q="" rows={[]} queue={queue} devices={3} />);
  assert.match(html, /data-host-kiosk="offline"/);
  assert.match(html, /未送信 3件/);
  assert.match(html, />86<small>/);
  assert.equal(count(html, 'data-kiosk-stream="pending"'), 3);
  assert.equal(streamRows(data.recent, queue)[0]!.participantId, "participant:hp-kimura");
  const rows = searchRoster(hostKioskRoster(state), "もり", new Set());
  assert.deepEqual(rows.map((row) => row.name), ["森田 拓也", "森 由香", "森川 恵太"]);
});

test("kiosk 离线队列：按顺序补发、同一幂等键只入队一次、网络失败停下、4xx 标错留队、duplicate 出队", async () => {
  const store = memoryKioskStore();
  const item = (key: string, at: string): KioskQueueItem => ({ at, eventId: "e1", idempotencyKey: key, name: key, org: null, participantId: `p-${key}` });
  await store.enqueue(item("a", "2026-10-07T10:00:00Z"));
  await store.enqueue(item("a", "2026-10-07T10:00:00Z"));
  await store.enqueue(item("b", "2026-10-07T10:01:00Z"));
  await store.enqueue(item("c", "2026-10-07T10:02:00Z"));
  assert.equal((await store.queue("e1")).length, 3);
  const sentKeys: string[] = [];
  const result = { checkedInAt: null, duplicate: false, name: "", overCapacity: false, participantId: "", receptionNumber: null, status: "checked_in" as const, table: null };
  const first = await flushQueue(store, "e1", async (entry) => { sentKeys.push(entry.idempotencyKey); return entry.idempotencyKey === "b" ? { ok: false, reason: "network" } : { data: result, ok: true }; });
  assert.deepEqual(sentKeys, ["a", "b"]);
  assert.equal(first.stopped, true);
  assert.deepEqual((await store.queue("e1")).map((entry) => entry.idempotencyKey), ["b", "c"]);
  const second = await flushQueue(store, "e1", async (entry) => (entry.idempotencyKey === "c" ? { ok: false, reason: "conflict" } : { data: { ...result, duplicate: true }, ok: true }));
  assert.deepEqual(second, { duplicate: 1, failed: 1, sent: 0, stopped: false });
  const left = await store.queue("e1");
  assert.equal(left.length, 1);
  assert.equal(left[0]!.error, "conflict");
  const third = await flushQueue(store, "e1", async () => { throw new Error("不该再发"); });
  assert.equal(third.sent + third.failed, 0);
});

test("kiosk 名单缓存：TTL = cacheUntil，过期读时即清", async () => {
  const store = memoryKioskStore();
  await store.saveRoster({ cacheUntil: "2026-10-08T00:30:00.000Z", eventId: "e1", rows: hostKioskRoster(), savedAt: "2026-10-07T10:00:00.000Z" });
  assert.ok(await readRoster(store, "e1", new Date("2026-10-07T12:00:00.000Z")));
  assert.equal(await readRoster(store, "e1", new Date("2026-10-08T00:31:00.000Z")), null);
  assert.equal(store.dump().rosters.length, 0);
});
