// 主办方手机版的状态（b13 HM-S12 / S13 / M9 / M10 / K9 / P5，2026-11-26）：冲突、已结束、次数用完、受付终了、部分失败。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostImportView } from "../../app/(app)/app/orbit-2026/host/HostImport";
import { HostMatchingPhone } from "../../app/(app)/app/orbit-2026/host/HostMatchingPhone";
import { ReportLoadFailure } from "../../app/(app)/app/orbit-2026/host/HostReport";
import { NoticesPhone } from "../../app/(app)/app/orbit-2026/host/HostSetupPhone";
import { HostPeopleView } from "../../app/(app)/app/orbit-2026/host/HostPeople";
import { HostSetupView } from "../../app/(app)/app/orbit-2026/host/HostSetup";
import { KioskPhoneView } from "../../app/(app)/app/orbit-2026/host/KioskPhone";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { draftOf } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { DEFAULT_HOST_MOCK_STATE, HOST_EVENT_IDS, hostEventView, hostKiosk, hostMatching, hostPeople, hostReport, hostSetup } from "../../shared/mock/demo-world/host-events";

const t = hostTranslator("ja");
const NOW = new Date("2026-10-07T03:00:00.000Z");

test("申込設定 phone: conflict shows the reload banner; an ended event is read-only with no publish bar", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const conflict = renderToStaticMarkup(<HostSetupView phone data={data} draft={draftOf(data)} t={t} language="ja" now={NOW} saveState="conflict" />);
  assert.match(conflict, /data-host-setup-conflict/);
  assert.match(conflict, /再読み込み/);
  assert.match(conflict, /data-host-setup-publish/);
  const ended = { ...data, event: { ...data.event, status: "ended" as const } };
  const html = renderToStaticMarkup(<HostSetupView phone data={ended} draft={draftOf(ended)} t={t} language="ja" now={NOW} />);
  assert.match(html, /data-host-setup-ended/);
  assert.match(html, /開催済みのため、申込設定は変更できません/);
  assert.doesNotMatch(html, /data-host-setup-publish/);
  assert.match(html, /inert/);
});

test("申込設定 phone empty form (b13 HM-S9): templates, then the 質問案 card, then 質問 with the library hint, and 受付の設定 after them", () => {
  const data = hostSetup(HOST_EVENT_IDS.asakai3)!;
  assert.equal(data.questions.length, 0);
  const html = renderToStaticMarkup(<HostSetupView phone data={data} draft={draftOf(data)} t={t} language="ja" now={NOW} />);
  const at = (needle: string) => html.indexOf(needle);
  assert.ok(at("data-host-setup-templates") > -1 && at("data-host-suggestion") > at("data-host-setup-templates"));
  assert.ok(at("data-host-questions") > at("data-host-suggestion") && at("data-host-setup-settings") > at("data-host-questions"));
  assert.match(html, /質問案を 3つ追加しますか？/);
  assert.match(html, /「製造業 DX 朝会」の過去 2回の回答傾向から作成しました/);
  assert.match(html, /立場・業界・会いたい人など \d+問/);
  assert.doesNotMatch(html, /回答はテーブル編成に使われます/);
  const dismissed = renderToStaticMarkup(<HostSetupView phone data={data} draft={draftOf(data)} t={t} language="ja" now={NOW} suggestionOpen={false} />);
  assert.doesNotMatch(dismissed, /data-host-suggestion/);
  const filled = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const normal = renderToStaticMarkup(<HostSetupView phone data={filled} draft={draftOf(filled)} t={t} language="ja" now={NOW} />);
  assert.ok(normal.indexOf("data-host-setup-settings") < normal.indexOf("data-host-questions"));
  assert.doesNotMatch(normal, /data-host-setup-templates|data-host-suggestion/);
});

test("マッチング phone: no generations left disables 生成 and 再生成; published has no 移動 / 公開", () => {
  const data = hostMatching(HOST_EVENT_IDS.cfo18)!;
  const used = { ...data, generationsUsed: data.generationsLimit };
  const none = renderToStaticMarkup(<HostMatchingPhone data={{ ...used, state: "none" }} t={t} language="ja" />);
  assert.match(none, /data-host-generate=""[^>]*disabled|disabled=""[^>]*data-host-generate/);
  const draft = renderToStaticMarkup(<HostMatchingPhone data={{ ...used, state: "draft" }} t={t} language="ja" />);
  assert.match(draft, /残り 0回/);
  assert.match(draft, /disabled=""[^>]*>[^<]*<svg[^>]*>[\s\S]*?再生成/);
  const published = renderToStaticMarkup(<HostMatchingPhone data={{ ...data, state: "published" }} t={t} language="ja" />);
  assert.match(published, /公開済み/);
  assert.doesNotMatch(published, /data-host-move=/);
  assert.doesNotMatch(published, /data-host-publish=/);
});

test("受付 phone: closed shows the banner and no scan button", () => {
  const live = hostKiosk(HOST_EVENT_IDS.cfo18, "")!;
  const html = renderToStaticMarkup(<KioskPhoneView data={{ ...live, closed: true }} t={t} now={NOW} online q="" rows={[]} queue={[]} devices={1} />);
  assert.match(html, /data-kiosk-closed/);
  assert.match(html, /受付は終了しました/);
  assert.doesNotMatch(html, /data-kiosk-scan/);
  assert.match(html, /受付の記録/);
});

test("参加者 phone: a conflicting row keeps its note in place", () => {
  const data = hostPeople(HOST_EVENT_IDS.cfo18, "pending")!;
  const first = data.rows[0]!;
  const html = renderToStaticMarkup(<HostPeopleView phone language="ja" data={data} t={t} rows={data.rows} query={{ bucket: "pending", incomplete: false, q: "" }} selected={new Set([first.actorId])} selecting issues={new Map([[first.actorId, "conflict" as const]])} />);
  assert.match(html, /他の運営者が先に更新しました/);
  assert.match(html, /data-host-bulk="1"/);
});

test("名簿の取り込み phone (b13 HM-P10): full-screen sub-page, three tiles side by side, rows as list rows, export at the bottom", () => {
  const event = hostEventView(HOST_EVENT_IDS.cfo18)!;
  const rows = [{ email: "t.tanaka@example.com", name: "田中 健一", status: "applied" as const }, { email: "y.matsumoto@example.com", name: "松本 由紀", status: "registered" as const }, { email: "m.sasaki@example.com", name: "佐々木 恵", status: "unregistered" as const }];
  const html = renderToStaticMarkup(<HostImportView phone event={event} language="ja" file={{ at: "2026-10-16T01:00:00.000Z", match: "done", name: "peatix_vol2.csv", rows }} origin="https://orbit.app" />);
  assert.match(html, /data-host-setup-sub="import"/);
  assert.match(html, /<b>名簿の取り込み<\/b><small>CFO Night Tokyo vol\.18<\/small>/);
  assert.match(html, /選び直す/);
  assert.deepEqual([...html.matchAll(/data-host-import-count="(\w+)"/gu)].map((m) => m[1]), ["applied", "registered", "unregistered"]);
  assert.deepEqual([...html.matchAll(/data-host-import-status="(\w*)"[^>]*>([^<]+)</gu)].map((m) => [m[1], m[2]]), [["applied", "申込済み"], ["registered", "登録済み · 未申込"], ["unregistered", "Orbit 未登録"]]);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /example\.com/);
  assert.match(html, /照合表を書き出す（CSV）[\s\S]*連絡先には追加されません/);
  assert.match(html, /未申込 2名へは/);
  const empty = renderToStaticMarkup(<HostImportView phone event={event} language="zh" file={null} origin="https://orbit.app" />);
  assert.match(empty, /data-host-import-pick/);
  assert.doesNotMatch(empty, /data-host-import-table/);
});

test("お知らせ phone (b13 HM-S8 / S8b): six templates, the open one first with ▾, one shared note, preview with the note; a link turns the field red", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const html = renderToStaticMarkup(<NoticesPhone data={data} t={t} kind="admission_approved" note="当日は 18:45 から受付を開始します" readOnly={false} />);
  assert.equal([...html.matchAll(/aria-pressed="(true|false)"/gu)].length, 6);
  assert.match(html, /aria-pressed="true"[^>]*><span[^>]*><b>承認<\/b>/u);
  assert.match(html, /主催者より：<\/b>当日は 18:45 から受付を開始します/u);
  assert.match(html, /定型文は変更できません/);
  const bad = renderToStaticMarkup(<NoticesPhone data={data} t={t} kind="admission_approved" note="資料は https://example.com に" readOnly={false} />);
  assert.match(bad, /ひとことにリンクは入れられません/);
  assert.doesNotMatch(bad, /主催者より/);
});

test("レポート (b13 HM-R5): under 5 people the numbers show —; a failed read is one card with 再読み込み", () => {
  const all = hostReport(HOST_EVENT_IDS.founders11, "all", { ...DEFAULT_HOST_MOCK_STATE, report: "suppressed" })!.all!;
  assert.equal(all.exchanges, null);
  assert.equal(all.followups, null);
  assert.deepEqual(all.standing, []);
  assert.equal(hostReport(HOST_EVENT_IDS.founders11, "all")!.all!.exchanges, 48, "normal state unchanged");
  const html = renderToStaticMarkup(<ReportLoadFailure t={t} />);
  assert.match(html, /data-host-failure="report"/);
  assert.match(html, /読み込めませんでした[\s\S]*再読み込み/u);
});
