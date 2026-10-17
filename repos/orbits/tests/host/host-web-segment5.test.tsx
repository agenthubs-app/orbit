/**
 * R17 主催 Web 第 5 段：运营台页头「⋯」菜单（决定表 §44，b12 #480 / #481 W-R17-24）。
 * owner 看得到「イベントを中止」（珊瑚色，capabilities 有 event.cancel）；共同运营者（受付）看不到中止 / 编辑 / 再発行。
 * 另：编辑页不再有「公開と中止」卡；公开页登录弹层只有 Google / メール（b7 #39）。
 * ShellPage 是 slot（SSR 不渲染页头），所以菜单直接渲染 HostMoreMenu。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostMoreMenu, hostMenuItems } from "../../app/(app)/app/orbit-2026/host/HostConsole";
import { draftFromEvent, HostEventFormView } from "../../app/(app)/app/orbit-2026/host/HostEventForm";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import type { HostEventView } from "../../shared/contract/host-events";
import { DEFAULT_HOST_MOCK_STATE, HOST_EVENT_IDS, hostOverview, type HostMockState } from "../../shared/mock/demo-world/host-events";

const t = hostTranslator("ja");
const state = (patch: Partial<HostMockState>): HostMockState => ({ ...DEFAULT_HOST_MOCK_STATE, ...patch });
const ownerEvent = (): HostEventView => hostOverview(HOST_EVENT_IDS.cfo18)!.event;
const staffEvent = (): HostEventView => ({ ...ownerEvent(), myRole: "check_in" as const, capabilities: ["event.center.read", "check_in.roster.read_limited", "check_in.roster.write", "check_in.walk_in", "analytics.read_aggregate"] });

test("⋯ 菜单 · owner（公開中）：基本情報を編集 / 参加コードを再発行 / 申込ページを開く / 分隔线 / イベントを中止（珊瑚色）", () => {
  const event = ownerEvent();
  assert.equal(event.myRole, "owner");
  assert.ok(event.capabilities.includes("event.cancel"));
  const closed = renderToStaticMarkup(<HostMoreMenu event={event} t={t} />);
  assert.match(closed, /data-host-more=""/);
  assert.match(closed, /aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-host-menu=""/);
  const html = renderToStaticMarkup(<HostMoreMenu event={event} t={t} defaultOpen />);
  const items = [...html.matchAll(/data-host-menu-item="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(items, ["edit", "reissue", "open", "cancel"]);
  assert.match(html, /基本情報を編集/);
  assert.match(html, /参加コードを再発行/);
  assert.match(html, /申込ページを開く/);
  assert.match(html, /イベントを中止/);
  assert.match(html, /role="separator"/);
  assert.match(html, new RegExp(`href="/app/events/${HOST_EVENT_IDS.cfo18}/edit"`));
  assert.match(html, new RegExp(`href="/e/${event.publicSlug}" target="_blank"`));
  assert.match(html, /data-host-menu-item="cancel" data-tone="coral"/); // 珊瑚色
});

test("⋯ 菜单 · 非 owner（受付担当）：只剩「申込ページを開く」，没有中止 / 编辑 / 再発行", () => {
  const event = staffEvent();
  const items = hostMenuItems(event);
  assert.deepEqual(items, { archive: false, cancel: false, edit: false, openPage: true, reissue: false });
  const html = renderToStaticMarkup(<HostMoreMenu event={event} t={t} defaultOpen />);
  assert.match(html, /申込ページを開く/);
  assert.doesNotMatch(html, /イベントを中止/);
  assert.doesNotMatch(html, /基本情報を編集/);
  assert.doesNotMatch(html, /role="separator"/);
  // manager（有 event.edit 无 event.cancel）：能编辑 / 再発行，仍不能中止
  const manager = { ...event, myRole: "manager" as const, capabilities: [...event.capabilities, "event.edit"] };
  assert.deepEqual(hostMenuItems(manager), { archive: false, cancel: false, edit: true, openPage: true, reissue: true });
});

test("⋯ 菜单 · 状态：下書き 只有编辑（公開する 在横幅）；中止 / アーカイブ済み 没有可做的项 → 不画按钮", () => {
  const inactive = state({ center: "inactive" });
  const draft = hostOverview(HOST_EVENT_IDS.roundtable, inactive)!.event;
  assert.deepEqual(hostMenuItems(draft), { archive: false, cancel: false, edit: true, openPage: false, reissue: false });
  for (const id of [HOST_EVENT_IDS.asakai3, HOST_EVENT_IDS.asakai2]) {
    const event = hostOverview(id, inactive)!.event;
    assert.equal(renderToStaticMarkup(<HostMoreMenu event={event} t={t} defaultOpen />), "", event.status);
  }
  const ended = { ...ownerEvent(), status: "ended" as const };
  const items = hostMenuItems(ended);
  assert.equal(items.archive, true);
  assert.equal(items.cancel, false);
});

test("编辑页：不再有「公開と中止」卡（§44-3）", () => {
  const event = ownerEvent();
  const html = renderToStaticMarkup(<HostEventFormView mode="edit" draft={draftFromEvent(event, [])} profiles={[]} language="ja" event={event} />);
  assert.doesNotMatch(html, /data-host-manage/);
  assert.doesNotMatch(html, /公開と中止/);
  assert.doesNotMatch(html, /data-host-cancel-open/);
});
