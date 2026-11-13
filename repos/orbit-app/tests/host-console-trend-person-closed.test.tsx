// 主催（App）2026-11-13/14 的 Web 改动移植：申込の推移（日期轴 / 合计 / 峰值 / 0 人底线 / 标注 / 逐日读屏）、
// 参加者（申込なしの成員は見るだけ、分组切换不闪旧行、参加者詳細）、受付終了（closed：横幅、无操作、拒绝时的提示键）。
// 夹具 = mock 服务器的真实回答（tests/fixtures/host），经同步来的 schema 解析。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";

import type { HostKioskResponse, HostOverviewResponse, HostPeopleResponse, HostPersonResponse } from "../src/api/contract/host-console";
import { hostKioskResponseSchema, hostOverviewResponseSchema, hostPeopleResponseSchema, hostPersonResponseSchema } from "../src/api/schema/host-console";
import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import { zh } from "../src/i18n/zh";
import { CheckInBody, checkInRefusalKey, kioskClosed } from "../src/screens/host/check-in-view";
import { canDecide, OverviewBody, PeopleBody, ReportBody } from "../src/screens/host/console-view";
import { HostPersonView, personMeta } from "../src/screens/host/person-view";
import { SignupTrend, signupTrendModel, trendDayLabel } from "../src/screens/host/signup-trend";
import { renderedText, renderToHtml } from "./helpers/render";

const dict = ja as Record<string, string>;
const t = (key: string, values?: Record<string, string | number>) => {
  const template = dict[`host.${key}`];
  assert.ok(template !== undefined, `missing host.${key}`);
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (values && name in values ? String(values[name]) : match));
};
const fixture = <T,>(name: string, schema: { parse: (value: unknown) => unknown }) => schema.parse(JSON.parse(readFileSync(new URL(`./fixtures/host/${name}.json`, import.meta.url), "utf8"))) as T;
const overview = fixture<HostOverviewResponse>("overview", hostOverviewResponseSchema);
const people = fixture<HostPeopleResponse>("people", hostPeopleResponseSchema);
const kiosk = fixture<HostKioskResponse>("kiosk", hostKioskResponseSchema);
const noop = () => undefined;

test("new host copy exists in all three languages", () => {
  const keys = ["trendRangeToEvent", "trendPeak", "trendNone", "trendTip", "kClosedTitle", "kClosedBody", "pdOpen", "pdNoForm", "pdShowAll", "pdNotPublished", "pdStatus_approved", "pf_positioning", "pf_seniority"];
  for (const locale of [ja, zh, en] as Record<string, string>[]) for (const key of keys) assert.ok(locale[`host.${key}`], `host.${key}`);
  assert.equal((zh as Record<string, string>)["host.trendRangeToEvent"], "截至活动");
  assert.equal(dict["host.trendRangeToEvent"], "開催まで");
});

test("申込の推移 model: M/D labels from the start date, total, peak and the axis step (last day always labelled)", () => {
  assert.equal(trendDayLabel("2026-10-30", 0), "10/30");
  assert.equal(trendDayLabel("2026-10-30", 3), "11/2");
  assert.equal(trendDayLabel(undefined, 3), "");
  const values = [4, 6, 5, 9, 7, 12, 8, 6, 10, 14, 9, 11, 16, 11];
  const model = signupTrendModel(values, "2026-10-24");
  assert.equal(model.total, 128);
  assert.equal(model.max, 16);
  assert.equal(model.peak, 12);
  assert.equal(model.labels[12], "11/5");
  // 14 本 → 2 日おき；最後の日（13）は必ず出し、隣の 12 は譲る。
  assert.deepEqual(model.axis.map((label) => label !== ""), [true, false, true, false, true, false, true, false, true, false, true, false, false, true]);
  assert.equal(model.axis[13], "11/6");
  // 7 本以下は毎日。
  assert.ok(signupTrendModel([0, 1, 0, 2, 0, 0, 1], "2026-11-01").axis.every((label) => label !== ""));
  // 全部 0：峰值なし。
  assert.equal(signupTrendModel([0, 0, 0], "2026-11-01").peak, -1);
});

test("申込の推移 renders the total, the peak day, the peak count on its bar only, a zero baseline and one spoken label per day", () => {
  const html = renderToHtml(<SignupTrend values={[0, 3, 1, 0, 5]} startDate="2026-11-01" t={t} />);
  const text = renderedText(<SignupTrend values={[0, 3, 1, 0, 5]} startDate="2026-11-01" t={t} />);
  assert.match(text, /^9 名/);
  assert.match(text, /最多 11\/5・5名/);
  for (const day of ["11/1：0名", "11/2：3名", "11/3：1名", "11/4：0名", "11/5：5名"]) assert.ok(html.includes(`aria-label="${day}"`), day);
  // 柱の上の数字は峰値の 5 だけ（3 と 1 は出さない）。
  assert.match(text, /最多 11\/5・5名 5 11\/1/);
  assert.doesNotMatch(text, / 3 11\/1/);
  assert.match(renderedText(<SignupTrend values={[0, 0, 0]} startDate="2026-11-01" t={t} />), /0 名 この期間の申込はありません/);
  // 标注：单独一行在柱子上方。
  const marked = renderToHtml(<SignupTrend values={[1, 2, 3]} startDate="2026-11-01" t={t} marks={[{ index: 1, label: "告知メール" }]} />);
  assert.match(marked, /host-signup-trend-marks/);
  assert.ok(marked.indexOf("告知メール") < marked.indexOf('aria-label="11/1：1名"'));
  assert.doesNotMatch(renderToHtml(<SignupTrend values={[1, 2, 3]} startDate="2026-11-01" t={t} />), /host-signup-trend-marks/);
});

test("申込の推移: the column carrying the count / tip draws above the later bars (RN stacks siblings in order)", () => {
  const html = renderToHtml(<SignupTrend values={[0, 3, 1, 0, 5]} startDate="2026-11-01" t={t} />);
  const column = (index: number) => {
    const at = html.indexOf(`data-testid="host-trend-day-${index}"`);
    assert.ok(at >= 0, `column ${index}`);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at));
  };
  // 峰值柱（4）写着人数：压在上面；其它柱不抬。
  assert.match(column(4), /zIndex/);
  assert.doesNotMatch(column(1), /zIndex/);
});

test("概要 and レポート show the trend; an ended event says 開催まで; draft / cancelled / archived overview hide it", () => {
  const props = { onCheckIn: noop, onNotify: noop, onPublish: noop, onResults: noop, onReview: noop, t };
  const live = renderedText(<OverviewBody {...props} data={{ ...overview, trendStartDate: "2026-10-24" }} />);
  assert.match(live, /申込の推移 直近14日 128 名 最多 11\/5・16名/);
  const ended = renderedText(<OverviewBody {...props} data={{ ...overview, event: { ...overview.event, status: "ended" } }} />);
  assert.match(ended, /申込の推移 開催まで/);
  for (const status of ["draft", "cancelled", "archived"] as const) assert.doesNotMatch(renderedText(<OverviewBody {...props} data={{ ...overview, event: { ...overview.event, status } }} />), /申込の推移/);
  const report = renderedText(<ReportBody data={{ ...overview, event: { ...overview.event, status: "ended" } }} t={t} now={new Date("2026-10-07T13:00:00Z")} onPc={noop} />);
  assert.match(report, /受付率.*申込の推移 開催まで.*詳しいレポートは PC で/);
});

test("参加者: members registered without an application (applicationVersion 0) are view-only; rows open the detail", () => {
  assert.equal(canDecide({ applicationVersion: 0, status: "approved" }), false);
  assert.equal(canDecide({ applicationVersion: 0, status: "pending" }), false);
  assert.equal(canDecide({ applicationVersion: 2, status: "waitlisted" }), true);
  const member = { ...people.rows[0]!, actorId: "actor:member", applicationVersion: 0, name: "移行 太郎", status: "approved" as const };
  const approved: HostPeopleResponse = { ...people, bucket: "approved", rows: [member] };
  const html = renderToHtml(<PeopleBody data={approved} t={t} approving={null} onBucket={noop} onApprove={noop} onOpen={noop} />);
  assert.doesNotMatch(html, /host-approve-/);
  assert.match(html, /aria-label="移行 太郎 の詳細"/);
  const pending = renderToHtml(<PeopleBody data={people} t={t} approving={null} onBucket={noop} onApprove={noop} onOpen={noop} />);
  assert.match(pending, /host-approve-actor:hp-morita/);
});

test("参加者: switching tab shows a placeholder, never the previous tab's rows", () => {
  const html = renderToHtml(<PeopleBody data={people} bucket="approved" t={t} approving={null} onBucket={noop} onApprove={noop} />);
  assert.match(html, /host-people-loading/);
  assert.doesNotMatch(html, new RegExp(people.rows[0]!.name));
  assert.match(renderToHtml(<PeopleBody data={people} bucket="pending" t={t} approving={null} onBucket={noop} onApprove={noop} />), new RegExp(people.rows[0]!.name));
});

const recs = Array.from({ length: 7 }, (_, index) => ({ name: `相手 ${index + 1}`, org: index === 0 ? "みずほ台ベンチャーズ" : null, participantId: `p-${index}`, rank: index + 1, reason: index === 0 ? "同じ業界で資金調達を経験" : null, role: index === 0 ? "パートナー" : null }));
const person: HostPersonResponse = hostPersonResponseSchema.parse({
  actorId: "actor:hp-morita", attendCount: 2, checkedInAt: "2026-10-07T10:46:00.000Z", eventId: "event:1",
  hostAnswers: [{ label: "いちばん話したいこと", value: "シリーズAの資金調達" }], initial: "森",
  matching: { published: true, recommendations: recs, tables: [{ mates: [{ name: "青木 花", org: "青木商事", participantId: "p-aoki" }], round: 1, table: "C", theme: "資金調達", why: "同じ段階の起業家が集まる卓" }] },
  name: "森田 拓也", needs: ["投資家"], offers: ["SaaS の知見"], org: "Morita Labs", profile: [{ label: "positioning", value: "起業家" }, { label: "unknownKey", value: "そのまま" }],
  receptionNumber: "A-012", role: "CEO", source: "application", status: "approved", submittedAt: "2026-10-01T03:00:00.000Z", topics: ["資金調達", "採用"],
}) as HostPersonResponse;

test("参加者詳細: header, answers, profile, chips, tables and the first five suggested people", () => {
  assert.deepEqual(personMeta(person, t), ["受付済み 19:46", "受付番号 A-012", "2回", "申込 10/1"]);
  const text = renderedText(<HostPersonView data={person} t={t} />);
  for (const phrase of ["森田 拓也", "Morita Labs · CEO", "承認済み", "受付済み 19:46", "受付番号 A-012", "申込 10/1", "申込時の回答", "いちばん話したいこと", "シリーズAの資金調達", "プロフィール", "立場", "起業家", "unknownKey", "そのまま", "話したいテーマ", "資金調達", "提供できること", "SaaS の知見", "探していること", "投資家", "マッチング結果", "第1ラウンド · テーブル C", "同じ段階の起業家が集まる卓", "同じテーブル", "青木 花", "青木商事", "おすすめの相手", "相手 1", "みずほ台ベンチャーズ · パートナー", "同じ業界で資金調達を経験", "相手 5", "すべて表示（7名）"]) assert.ok(text.includes(phrase), phrase);
  assert.ok(!text.includes("相手 6"));
});

test("参加者詳細: a member without a form, unpublished matching, and published-but-not-seated", () => {
  const member: HostPersonResponse = { ...person, attendCount: 0, checkedInAt: null, hostAnswers: [], matching: { published: false, recommendations: [], tables: [] }, receptionNumber: null, source: "member", submittedAt: null };
  assert.deepEqual(personMeta(member, t), ["初参加", "申込フォームなしで参加登録"]);
  const text = renderedText(<HostPersonView data={member} t={t} />);
  assert.match(text, /申込フォームなしで参加登録/);
  assert.match(text, /マッチングを公開すると、テーブルとおすすめの相手がここに表示されます/);
  assert.doesNotMatch(text, /申込時の回答/);
  assert.match(renderedText(<HostPersonView data={{ ...person, matching: { published: true, recommendations: [], tables: [] } }} t={t} />), /公開済みのテーブルにこの人は入っていません/);
  assert.doesNotMatch(renderedText(<HostPersonView data={{ ...person, matching: null }} t={t} />), /マッチング結果/);
});

test("受付終了 (closed): banner, search kept, no 到着 / 取り消し / 当日枠 / 再試行; old servers stay open", () => {
  const props = { busy: null, devices: 0, onArrive: noop, onQ: noop, onRetry: noop, onUndo: noop, onWalkIn: noop, t };
  const queued = { at: "2026-10-07T10:46:00.000Z", eventId: kiosk.eventId, idempotencyKey: "k-1", initial: "木", name: "木村 洋平", org: null, participantId: "participant:hp-kimura" };
  const closed = { ...kiosk, closed: true };
  const html = renderToHtml(<CheckInBody {...props} data={closed} q="もり" rows={kiosk.rows} queue={[queued]} />);
  const text = renderedText(<CheckInBody {...props} data={closed} q="もり" rows={kiosk.rows} queue={[queued]} />);
  assert.match(text, /受付は終了しました/);
  assert.match(text, /開催終了から12時間が過ぎたため、受付の記録を見るだけになります。/);
  assert.match(html, /host-check-in-search/);
  assert.doesNotMatch(html, /host-arrive-|host-retry-/);
  assert.match(text, /森田 拓也 .*未到着/);
  const open = renderToHtml(<CheckInBody {...props} data={kiosk} q="もり" rows={kiosk.rows} queue={[queued]} />);
  assert.match(open, /host-arrive-participant:hp-morita/);
  assert.doesNotMatch(open, /受付は終了しました/);
  assert.equal(kioskClosed(kiosk), false);
  assert.equal(kioskClosed(closed), true);
  assert.equal(kioskClosed(null), false);
});

test("受付 refusals: closed after re-reading → 受付は終了しました; CHECK_IN_CLOSED outside the window → 今は受付時間外です", () => {
  assert.equal(checkInRefusalKey("VALIDATION", true), "kClosedTitle");
  assert.equal(checkInRefusalKey("CHECK_IN_CLOSED", true), "kClosedTitle");
  assert.equal(checkInRefusalKey("CHECK_IN_CLOSED", false), "kClosedErr");
  assert.equal(checkInRefusalKey("VERSION_CONFLICT", false), null);
  assert.equal(t("kClosedErr"), "今は受付時間外です");
});
