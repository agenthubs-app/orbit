// 主办方手机版的状态（b13 HM-S12 / S13 / M9 / M10 / K9 / P5，2026-11-26）：冲突、已结束、次数用完、受付终了、部分失败。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostMatchingPhone } from "../../app/(app)/app/orbit-2026/host/HostMatchingPhone";
import { HostPeopleView } from "../../app/(app)/app/orbit-2026/host/HostPeople";
import { HostSetupView } from "../../app/(app)/app/orbit-2026/host/HostSetup";
import { KioskPhoneView } from "../../app/(app)/app/orbit-2026/host/KioskPhone";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { draftOf } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { HOST_EVENT_IDS, hostKiosk, hostMatching, hostPeople, hostSetup } from "../../shared/mock/demo-world/host-events";

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
