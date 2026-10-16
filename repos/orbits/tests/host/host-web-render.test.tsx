/**
 * R17 主催 Web 渲染（第 1 段）：運営センター 空 / 少 / 大 / 下書き·中止·アーカイブ，イベント運営 概要 + 状态横幅 + 定型通知确认。
 * 数据全部来自 mock 示例世界（shared/mock/demo-world/host-events.ts），与像素门禁同一份。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostCenterView, parseCenterFilter } from "../../app/(app)/app/orbit-2026/host/HostCenter";
import { HostConsoleView, NoticeConfirm, consoleSubtitle } from "../../app/(app)/app/orbit-2026/host/HostConsole";
import { parseConsoleTab } from "../../app/(app)/app/orbit-2026/host/HostConsoleTabs";
import { fillPercent, hostTranslator, rowNote } from "../../app/(app)/app/orbit-2026/host/host-model";
import { DEFAULT_HOST_MOCK_STATE, HOST_EVENT_IDS, hostCenter, hostNoticePreview, hostOverview, type HostMockState } from "../../shared/mock/demo-world/host-events";

const state = (patch: Partial<HostMockState>): HostMockState => ({ ...DEFAULT_HOST_MOCK_STATE, ...patch });
const count = (html: string, needle: string) => html.split(needle).length - 1;

test("運営センター · 空：はじめての案内 + 入口 3 枚 + 示例 3 行（A2 副标题），没有 KPI / 筛选", () => {
  const html = renderToStaticMarkup(<HostCenterView data={hostCenter(state({ center: "empty" }))} filter="all" query="" language="ja" />);
  assert.match(html, /data-host-center="empty"/);
  assert.match(html, /最初のイベントを主催しましょう/);
  assert.match(html, /CSV から招待リンクを作る/);
  assert.match(html, /href="\/app\/events\/center\/new"/);
  assert.match(html, /href="\/app\/host\/join"/);
  assert.equal(count(html, "data-host-row="), 3);
  assert.doesNotMatch(html, /data-host-filters/);
});

test("運営センター · 少：一场 + 4 格 spotlight + 筛选", () => {
  const html = renderToStaticMarkup(<HostCenterView data={hostCenter(state({ center: "few" }))} filter="all" query="" language="ja" />);
  assert.match(html, /data-host-center="list"/);
  assert.equal(count(html, "data-host-row="), 1);
  assert.match(html, /資金調達 実践ラウンドテーブル/);
  assert.match(html, /data-host-filters/);
});

test("運営センター · 大：六场、対応が必要なこと、受付を開く 指向 kiosk", () => {
  const html = renderToStaticMarkup(<HostCenterView data={hostCenter(state({ center: "many" }))} filter="all" query="" language="ja" />);
  assert.equal(count(html, "data-host-row="), 6);
  assert.match(html, /data-host-todo/);
  assert.match(html, new RegExp(`/app/events/${HOST_EVENT_IDS.cfo18}/operations/check-in`));
  assert.doesNotMatch(html, /下書き · 中止 · アーカイブ/); // 没有停用活动时不出这个页签
});

test("運営センター · 下書き / 中止 / アーカイブ（b12 #438）：页签无计数、三行状态文案", () => {
  const data = hostCenter(state({ center: "inactive" }), "inactive");
  const html = renderToStaticMarkup(<HostCenterView data={data} filter="inactive" query="" language="ja" />);
  assert.match(html, /下書き · 中止 · アーカイブ/);
  assert.match(html, /data-host-status="draft"/);
  assert.match(html, /data-host-status="cancelled"/);
  assert.match(html, /data-host-status="archived"/);
  assert.doesNotMatch(html, /data-host-todo/);
  const t = hostTranslator("ja");
  assert.equal(rowNote(data.events.find((row) => row.status === "draft")!, t), "未公開 · 申込ページは閉じています");
});

test("筛选 / 页签参数与进度条", () => {
  assert.equal(parseCenterFilter("live"), "live");
  assert.equal(parseCenterFilter("bogus"), "all");
  assert.equal(parseConsoleTab("people"), "people");
  assert.equal(parseConsoleTab("checkin"), "overview");
  assert.equal(fillPercent(128, 150), 85);
  assert.equal(fillPercent(5, null), 0);
});

test("イベント運営 · 概要 開場前（web.html #20）：4 格、推移 14 本、进度当前步「公開する」、プロフィール未完了", () => {
  const data = hostOverview(HOST_EVENT_IDS.cfo18, state({ overview: "pre_open" }))!;
  const html = renderToStaticMarkup(<HostConsoleView data={data} tab="overview" language="ja" />);
  assert.match(html, /data-host-tabs="underline"/); // §41-1：概要也用下划线页签
  assert.match(html, /data-host-trend/);
  assert.match(html, /data-host-progress="publish"/);
  assert.match(html, /推薦の生成/);
  assert.match(html, /data-host-todo="profile_incomplete"/);
  assert.doesNotMatch(html, /data-host-banner/);
  assert.match(html, /\/operations\/check-in/); // 受付 页签跳 kiosk
});

test("イベント運営 · 申込設定 / レポート 仍是占位，页签下划线画法", () => {
  const data = hostOverview(HOST_EVENT_IDS.cfo18)!;
  const html = renderToStaticMarkup(<HostConsoleView data={data} tab="setup" language="ja" />);
  assert.match(html, /data-host-tab-placeholder="setup"/);
  assert.match(html, /data-host-tabs="underline"/);
});

test("イベント運営 · 下書き / 中止 / アーカイブ 横幅（b12 #440 / #442 / #444）", () => {
  const inactive = state({ center: "inactive" });
  const cases = [[HOST_EVENT_IDS.roundtable, "draft", /公開する/], [HOST_EVENT_IDS.asakai3, "cancelled", /アーカイブ/], [HOST_EVENT_IDS.asakai2, "archived", /アーカイブを解除/]] as const;
  for (const [eventId, banner, action] of cases) {
    const data = hostOverview(eventId, inactive)!;
    const html = renderToStaticMarkup(<HostConsoleView data={data} tab="overview" language="ja" />);
    assert.match(html, new RegExp(`data-host-banner="${banner}"`), banner);
    assert.match(html, action, banner);
    assert.match(html, /data-host-tabs="underline"/);
    assert.doesNotMatch(html, /data-host-trend/);
  }
  const t = hostTranslator("ja");
  const draft = hostOverview(HOST_EVENT_IDS.roundtable, inactive)!.event;
  assert.match(consoleSubtitle(draft, "ja", t, new Date("2026-10-16T03:00:00Z")), /^主催 · 11月5日（木）18:30 · 下書き$/);
});

test("定型のお知らせ確認（b12 #408）：人数、定型文、送信ボタン", () => {
  const preview = hostNoticePreview(HOST_EVENT_IDS.cfo18, "profile_incomplete")!;
  const html = renderToStaticMarkup(<NoticeConfirm preview={preview} t={hostTranslator("ja")} busy={false} onCancel={() => {}} onSend={() => {}} />);
  assert.match(html, new RegExp(`${preview.recipients}名に送る`));
  assert.ok(html.includes(preview.title));
});

test("三语都有文案（zh / en 不回退成日文标题）", () => {
  for (const language of ["zh", "en"] as const) {
    const html = renderToStaticMarkup(<HostCenterView data={hostCenter(state({ center: "empty" }))} filter="all" query="" language={language} />);
    assert.doesNotMatch(html, /最初のイベントを主催しましょう/, language);
  }
});
