// 参加者詳細（HostPersonView）と開催済みの申込設定（HostSetupView）— 2026-11-13。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostPersonView } from "../../app/(app)/app/orbit-2026/host/HostPersonDrawer";
import { HostSetupView } from "../../app/(app)/app/orbit-2026/host/HostSetup";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { draftOf } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { hostPersonResponseObject } from "../../shared/api-schema/host-console";
import { HOST_EVENT_IDS, hostPerson, hostSetup } from "../../shared/mock/demo-world/host-events";

const t = hostTranslator("ja");

test("参加者詳細: answers, profile, tables with tablemates and the first five suggestions", () => {
  const data = hostPerson(HOST_EVENT_IDS.cfo18, "actor:hp-morita")!;
  assert.ok(hostPersonResponseObject.safeParse(data).success, "the demo matches the response schema");
  const html = renderToStaticMarkup(<HostPersonView data={data} t={t} />);
  assert.match(html, /申込時の回答/);
  assert.match(html, /今回いちばん話したいことは？/);
  assert.match(html, /いちばん話したいこと/, "profile keys are translated");
  assert.match(html, /第1ラウンド · テーブル A/);
  assert.match(html, /第2ラウンド · テーブル C/);
  assert.match(html, /同じテーブル/);
  assert.match(html, /おすすめの相手/);
  assert.ok(((html.match(/<li /g) ?? []) as string[]).length <= 5, "the first five suggestions only");
  assert.doesNotMatch(html, /AI/);
  assert.doesNotMatch(html, /連絡先/);
  const withContacts = renderToStaticMarkup(<HostPersonView data={{ ...data, contactMethods: { wechatId: "morita-wechat", phone: "03-5555-0142" } }} t={t} />);
  assert.match(withContacts, /連絡先/);
  assert.match(withContacts, /morita-wechat/);
  assert.match(withContacts, /03-5555-0142/);
});

test("参加者詳細: library questions and their choices follow the interface language (2026-11-26)", () => {
  const base = hostPerson(HOST_EVENT_IDS.cfo18, "actor:hp-morita")!;
  const data = { ...base, hostAnswers: [{ label: "あなたの立場に近いものを選んでください", value: "自由に書いた答え" }] };
  const zh = renderToStaticMarkup(<HostPersonView data={data} t={hostTranslator("zh")} language="zh" />);
  assert.match(zh, /请选择最接近你身份的一项/);
  assert.doesNotMatch(zh, /あなたの立場/);
  assert.match(zh, /自由に書いた答え/, "free text is shown as written");
});

test("参加者詳細: before publishing, a short note instead of tables", () => {
  const base = hostPerson(HOST_EVENT_IDS.cfo18, "actor:hp-morita")!;
  const html = renderToStaticMarkup(<HostPersonView data={{ ...base, matching: { published: false, recommendations: [], tables: [] } }} t={t} />);
  assert.match(html, /マッチングを公開すると/);
  assert.doesNotMatch(html, /同じテーブル/);
});

test("申込設定: an ended event is read-only (banner, no save bar, no suggestions)", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const ended = { ...data, event: { ...data.event, status: "ended" as const } };
  const html = renderToStaticMarkup(<HostSetupView data={ended} draft={draftOf(ended)} t={t} language="ja" />);
  assert.match(html, /開催済みのため、申込設定は変更できません/);
  assert.match(html, /data-host-setup="ended"/);
  assert.doesNotMatch(html, /data-host-setup-save=/);
});

test("受付: after closing (12 h past the end) the kiosk is view-only — banner, no scan, no row actions", async () => {
  const { HostKioskView } = await import("../../app/(app)/app/orbit-2026/host/HostKiosk");
  const { hostKiosk } = await import("../../shared/mock/demo-world/host-events");
  const open = hostKiosk(HOST_EVENT_IDS.cfo18, "森")!;
  const data = { ...open, closed: true };
  const html = renderToStaticMarkup(<HostKioskView data={data} t={t} now={new Date(data.now)} online q="森" rows={data.rows} queue={[]} devices={1} />);
  assert.match(html, /data-kiosk-closed=""/);
  assert.match(html, /受付は終了しました/);
  assert.doesNotMatch(html, /data-kiosk-scan=""/);
  assert.doesNotMatch(html, /data-kiosk-arrive=""|data-kiosk-undo=""|data-kiosk-walkin=""/);
  const live = renderToStaticMarkup(<HostKioskView data={open} t={t} now={new Date(open.now)} online q="森" rows={open.rows} queue={[]} devices={1} />);
  assert.doesNotMatch(live, /data-kiosk-closed/);
});

test("申込設定: the host contact card sits in the right column with the event's IDs; ended events have no save button", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const withContact = { ...data, event: { ...data.event, contact: { lineId: "line_demo", note: null, wechatId: "wx_demo" } } };
  const html = renderToStaticMarkup(<HostSetupView data={withContact} draft={draftOf(withContact)} t={t} language="ja" />);
  assert.match(html, /data-host-setup-contact=""/);
  assert.match(html, /value="wx_demo"/);
  assert.match(html, /value="line_demo"/);
  assert.match(html, /data-host-setup-contact-save=""/);
  const ended = { ...withContact, event: { ...withContact.event, status: "ended" as const } };
  const endedHtml = renderToStaticMarkup(<HostSetupView data={ended} draft={draftOf(ended)} t={t} language="ja" />);
  assert.match(endedHtml, /data-host-setup-contact=""/);
  assert.doesNotMatch(endedHtml, /data-host-setup-contact-save/);
});

test("申込設定: the open question card has a collapse button next to delete; collapsed cards show none", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const open = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" editing={0} />);
  assert.equal((open.match(/data-host-question-collapse=""/g) ?? []).length, 1, "only the open card can be collapsed");
  assert.match(open, /aria-label="Q1 を閉じる"/);
  const closed = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={t} language="ja" editing={-1} />);
  assert.doesNotMatch(closed, /data-host-question-collapse/);
});
