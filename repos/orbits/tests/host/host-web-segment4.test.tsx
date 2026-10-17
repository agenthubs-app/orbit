/**
 * R17 主催 Web 渲染（第 4 段）：公開主催者ページ 空 / 少 / 大（b7 #33–#35）、建活动 / 编辑（b12 #396 / #398）与表单换算、
 * 公開と中止カード（下書き / 公開中 / 中止）、主催者ページ編集（b12 #412）、共同運営に参加（b12 #414：输码 / 无效 / 有效）、
 * 名簿の取り込み（b12 #476）与 CSV 解析、§43 申込推移横轴截到开催日。数据来自 mock 示例世界（与像素门禁同一份）。
 */
import assert from "node:assert/strict";
import { HOST_INVITE_CODE_PATTERN, hostInviteCode, normalizeRosterEmail } from "../../shared/compute/host-invite";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { changedFields, draftFromEvent, draftToInput, HostEventFormView, noteProblem, tokyoInputs, tokyoIso } from "../../app/(app)/app/orbit-2026/host/HostEventForm";
import { HostImportView, maskEmail, parseCsv, rosterFromCsv } from "../../app/(app)/app/orbit-2026/host/HostImport";
import { HostJoinView, joinLoginHref, normalizeInviteCode } from "../../app/(app)/app/orbit-2026/host/HostJoin";
import { HostProfilesView, profileDraftOf, profileInput } from "../../app/(app)/app/orbit-2026/host/HostProfiles";
import { feeLabel, organizerAuthHref, OrganizerPublicView } from "../../app/(app)/app/orbit-2026/host/OrganizerPublic";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { DEFAULT_HOST_MOCK_STATE, HOST_EVENT_IDS, hostCohostInvitePreview, hostEventView, hostReport, organizerProfiles, organizerPublic, trendAxisLabels } from "../../shared/mock/demo-world/host-events";

const t = hostTranslator("ja");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const state = (organizer: "empty" | "few" | "many") => ({ ...DEFAULT_HOST_MOCK_STATE, organizer });

test("公開ページ · 空（b7 #33）：0回 / 0名 / 12、イベントなし卡 + 虚线两行、无过去活动；未登录 = ログイン / Orbit をはじめる", () => {
  const data = organizerPublic("cfo-night", state("empty"), null)!;
  const html = renderToStaticMarkup(<OrganizerPublicView data={data} language="ja" signedIn={false} following={false} />);
  assert.match(html, /data-organizer-public="empty"/);
  assert.match(html, /CFO Night 実行委員会/);
  assert.match(html, />0<small>回<\/small>/);
  assert.match(html, />12<small><\/small>/);
  assert.match(html, /公開中のイベントはまだありません/);
  assert.equal(count(html, "次のイベントがここに表示されます"), 1);
  assert.doesNotMatch(html, /data-organizer-past/);
  assert.match(html, />ログイン</);
  assert.match(html, />Orbit をはじめる</);
  assert.match(html, /フォローする/);
});

test("公開ページ · 少（b7 #34，B9 口径）：1回 / 128名 / 140、vol.19 残り 32席 ¥5,000、過去 1件 · 参加 128名", () => {
  const data = organizerPublic("cfo-night", state("few"), null)!;
  const html = renderToStaticMarkup(<OrganizerPublicView data={data} language="ja" signedIn={false} following={false} />);
  assert.match(html, /data-organizer-public="few"/);
  assert.match(html, />1<small>回<\/small>/);
  assert.match(html, />128<small>名<\/small>/);
  assert.match(html, /残り 32席/);
  assert.match(html, /11月11日（水）19:00 · 渋谷ストリーム 4F · ¥5,000/);
  assert.match(html, /10月7日 · 参加 128名/);
  assert.match(html, />1件</);
  assert.doesNotMatch(html, /すべて見る/);
});

test("公開ページ · 大（b7 #35）：18回 / 2,140名 / 860、两场（申込受付前）、过去先列 6 件 + すべて見る（18件）；登录后 = Orbit を開く / フォロー中", () => {
  const data = organizerPublic("cfo-night", state("many"), true)!;
  const html = renderToStaticMarkup(<OrganizerPublicView data={data} language="ja" signedIn following />);
  assert.match(html, /data-organizer-public="many"/);
  assert.match(html, />2,140<small>名<\/small>/);
  assert.equal(count(html, "data-organizer-upcoming="), 2);
  assert.match(html, /申込受付前/);
  assert.equal(count(html, "参加 1"), 6);
  assert.match(html, /すべて見る（18件）/);
  assert.match(html, /フォロー中/);
  assert.match(html, /Orbit を開く/);
  assert.doesNotMatch(html, />ログイン</);
  const expanded = renderToStaticMarkup(<OrganizerPublicView data={data} language="ja" signedIn following expanded />);
  assert.doesNotMatch(expanded, /すべて見る/);
});

test("公開ページ：参加費表示与登录回跳（只放行 /app 下 → /app/o/<slug>?follow=1）", () => {
  assert.equal(feeLabel({ feeAmountYen: 5000, feeKind: "amount" }, t), "¥5,000");
  assert.equal(feeLabel({ feeAmountYen: null, feeKind: "free" }, t), "無料");
  assert.equal(feeLabel({ feeAmountYen: 2000, feeKind: "pay_at_door" }, t), "当日払い ¥2,000");
  assert.equal(organizerAuthHref("login", "cfo-night"), "/app/account/login?next=%2Fapp%2Fo%2Fcfo-night%3Ffollow%3D1");
  assert.equal(organizerAuthHref("signup", "cfo-night", false), "/app/account/signup?next=%2Fapp%2Fo%2Fcfo-night");
  assert.equal(organizerPublic("no-such-host", state("few")), null);
});

// 页头（标题 / 下書き保存 / 公開へ進む / 変更を保存）走壳的 ShellPage slot，SSR 渲染里没有。
test("建活动（b12 #396）：空表单、主催者ページ下拉、预览占位；模板三种只在 ?from=template", () => {
  const profiles = organizerProfiles().profiles;
  const draft = draftFromEvent(null, profiles);
  const html = renderToStaticMarkup(<HostEventFormView mode="create" draft={draft} profiles={profiles} language="ja" showTemplates />);
  assert.match(html, /data-host-event-form="create"/);
  assert.match(html, /所属する主催者ページ \*/);
  assert.equal(count(html, "<option value=\"demo-"), profiles.length);
  assert.match(html, /🥂 CFO Night 実行委員会/);
  assert.equal(count(html, "aria-pressed="), 3);
  assert.match(html, /0 \/ 200/);
  const plain = renderToStaticMarkup(<HostEventFormView mode="create" draft={draft} profiles={profiles} language="ja" />);
  assert.doesNotMatch(plain, /data-host-templates/);
});

test("编辑（b12 #398）：CFO18 带出 10/7 19:00、渋谷ストリーム、¥5,000；只送改了的字段", () => {
  const event = hostEventView(HOST_EVENT_IDS.cfo18)!;
  const profiles = organizerProfiles().profiles;
  const draft = draftFromEvent(event, profiles);
  assert.deepEqual(tokyoInputs(event.startsAt), { date: "2026-10-07", time: "19:00" });
  const html = renderToStaticMarkup(<HostEventFormView mode="edit" draft={draft} profiles={profiles} language="ja" event={event} />);
  assert.match(html, /data-host-event-form="edit"/);
  const result = draftToInput({ ...draft, venueName: "渋谷ストリーム 6F ホール B" });
  assert.ok(result.input);
  assert.deepEqual(Object.keys(changedFields(event, result.input!)), ["venueName"]);
});

test("表单换算：东京时间 → ISO、跨零点、必填与参加費校验；中止ひとこと ≤140 不能带链接", () => {
  assert.equal(tokyoIso("2026-11-04", "19:00"), "2026-11-04T10:00:00.000Z");
  assert.equal(tokyoIso("2026-11-04", ""), null);
  const base = draftFromEvent(null, organizerProfiles().profiles);
  const ok = { ...base, date: "2026-11-04", end: "01:00", start: "23:00", title: "夜会", venueName: "渋谷" };
  assert.equal(draftToInput(ok).input?.endsAt, "2026-11-04T16:00:00.000Z");
  assert.equal(draftToInput({ ...ok, title: " " }).problem, "evInvalidName");
  assert.equal(draftToInput({ ...ok, venueName: "" }).problem, "evInvalidVenue");
  assert.equal(draftToInput({ ...ok, venueName: "", online: true }).problem, null);
  assert.equal(draftToInput({ ...ok, feeKind: "amount", feeAmount: "" }).problem, "evInvalidFee");
  assert.equal(draftToInput({ ...ok, feeKind: "external_link", feeUrl: "http://x" }).problem, "evInvalidFee");
  assert.equal(draftToInput({ ...ok, feeKind: "amount", feeAmount: "5000" }).input?.feeAmountYen, 5000);
  assert.equal(noteProblem(""), false);
  assert.equal(noteProblem("会場の都合により中止となりました。"), false);
  assert.equal(noteProblem("詳細は https://example.com へ"), true);
  assert.equal(noteProblem("あ".repeat(141)), true);
});

test("主催者ページ編集（b12 #412）：两份资料、选中 CFO Night、URL 只读、公開 / リンクを知っている人；新建时可填 slug", () => {
  const profiles = organizerProfiles().profiles;
  const first = profiles[0]!;
  const html = renderToStaticMarkup(<HostProfilesView profiles={profiles} selectedId={first.profileId} draft={profileDraftOf(first)} stats={{ attendeesTotal: 2140, eventsHeld: 18, followers: 860 }} language="ja" />);
  assert.match(html, /data-host-profiles="2"/);
  assert.match(html, /イベント 18件/);
  assert.match(html, /イベント 3件/);
  assert.match(html, /\/o\/cfo-night/);
  assert.match(html, /2,140名/);
  assert.match(html, /リンクを知っている人/);
  const fresh = renderToStaticMarkup(<HostProfilesView profiles={[]} selectedId="new" draft={profileDraftOf(null)} stats={null} language="ja" />);
  assert.match(fresh, /data-host-orgform="new"/);
  assert.match(fresh, /名前から自動で作られます/);
  assert.equal(profileInput({ ...profileDraftOf(null), displayName: "新しい会", slug: "ab" }, true), null);
  assert.deepEqual(profileInput({ ...profileDraftOf(null), displayName: "新しい会", slug: "new-kai" }, true)?.slug, "new-kai");
  assert.equal(profileInput({ ...profileDraftOf(first), slug: "changed" }, false)?.slug, undefined);
});

test("共同運営に参加（b12 #414）：输码 / 无效 / 有效（未登录 = ログインして参加する，已登录 = 参加する）", () => {
  const code = renderToStaticMarkup(<HostJoinView code={null} preview={null} signedIn={false} language="ja" />);
  assert.match(code, /data-host-join="code"/);
  assert.match(code, /無料で始める/);
  const invalid = renderToStaticMarkup(<HostJoinView code="H-BAD" preview={hostCohostInvitePreview("H-BAD")} signedIn={false} language="ja" />);
  assert.match(invalid, /data-host-join="invalid"/);
  assert.match(invalid, /この招待は使えません/);
  const preview = hostCohostInvitePreview("H-7KQM-2TR4");
  const out = renderToStaticMarkup(<HostJoinView code="H-7KQM-2TR4" preview={preview} signedIn={false} language="ja" />);
  assert.match(out, /data-host-join="valid"/);
  assert.match(out, /CFO Night 実行委員会 · 佐藤 健一 さんから/);
  assert.match(out, /役割：受付/);
  assert.match(out, /ログインして参加する/);
  assert.match(out, /招待は 7日間有効 · 10\/14 まで/);
  assert.match(out, new RegExp(joinLoginHref("H-7KQM-2TR4").replace(/[?]/gu, "\\?")));
  const signedIn = renderToStaticMarkup(<HostJoinView code="H-7KQM-2TR4" preview={preview} signedIn language="ja" />);
  assert.match(signedIn, /data-host-join-accept/);
  assert.doesNotMatch(signedIn, /無料で始める/);
  assert.equal(normalizeInviteCode("h 7kqm２tr4"), "H-7KQM-2TR4");
  assert.equal(normalizeInviteCode("H7KQM2TR4"), "H-7KQM-2TR4");
});

test("名簿の取り込み（b12 #476）：CSV 解析（引用符・BOM・列名）、メールはローカル部だけ、未選択 / 選択後；未公開は招待リンクなし", () => {
  assert.deepEqual(parseCsv("﻿名前,メール\r\n\"田中, 健一\",t.tanaka@example.com\n\n松本,\"y\"\"m@x.jp\"\n"), [["名前", "メール"], ["田中, 健一", "t.tanaka@example.com"], ["松本", "y\"m@x.jp"]]);
  assert.deepEqual(rosterFromCsv("Name,Email\nA,a@x.jp\n,\n"), [{ email: "a@x.jp", name: "A" }]);
  assert.equal(rosterFromCsv("foo,bar\n1,2"), null);
  assert.equal(maskEmail("t.tanaka@example.com"), "t.tanaka@…");
  const event = hostEventView(HOST_EVENT_IDS.asakai3)!;
  const empty = renderToStaticMarkup(<HostImportView event={event} language="ja" file={null} origin="https://orbit.app" />);
  assert.match(empty, /data-host-import-pick/);
  assert.match(empty, /Orbit からはメールを送りません/);
  const rows = [{ email: "t.tanaka@example.com", name: "田中 健一" }, { email: "y.matsumoto@example.com", name: "松本 由紀" }];
  const html = renderToStaticMarkup(<HostImportView event={event} language="ja" file={{ at: "2026-10-16T01:00:00.000Z", match: "pending", name: "peatix_vol2.csv", rows }} origin="https://orbit.app" />);
  assert.match(html, /照合表 · peatix_vol2\.csv/);
  assert.match(html, /2行 · 読み込み 10月16日/);
  assert.match(html, /t\.tanaka@…/);
  assert.doesNotMatch(html, /example\.com/);
  assert.match(html, event.publicSlug ? /orbit\.app\/e\// : /公開すると招待リンクが使えます/);
  assert.match(html, /未申込 2名へは/);
  if (event.publicSlug) assert.match(html, new RegExp(`/e/${event.publicSlug}\\?inv=${hostInviteCode(event.eventId)}`), "R17-11: the invite link carries ?inv=");
  // R17-11：照合済み → 三类计数与行状态（申込済み / 登録済み · 未申込 / Orbit 未登録），未申込人数只数没申込的。
  const matched = renderToStaticMarkup(<HostImportView event={event} language="ja" file={{ at: "2026-10-16T01:00:00.000Z", match: "done", name: "peatix_vol2.csv", rows: [{ ...rows[0]!, status: "applied" }, { ...rows[1]!, status: "registered" }, { email: "x@y.jp", name: "佐々木 恵", status: "unregistered" }] }} origin="https://orbit.app" />);
  assert.match(matched, /data-host-import-count="applied"[^>]*>[\s\S]*?<b>1/u);
  assert.deepEqual([...matched.matchAll(/data-host-import-status="(\w*)"[^>]*>([^<]+)</gu)].map((m) => [m[1], m[2]]), [["applied", "申込済み"], ["registered", "登録済み · 未申込"], ["unregistered", "Orbit 未登録"]]);
  assert.match(matched, /未申込 2名へは/);
  const limited = renderToStaticMarkup(<HostImportView event={event} language="ja" file={{ at: "2026-10-16T01:00:00.000Z", match: "limited", name: "peatix_vol2.csv", rows }} origin="https://orbit.app" />);
  assert.match(limited, /1時間に 10回まで/);
});

test("R17-11 招待码：每场固定 4 位、不混淆字符；邮箱规范化同账号（trim + 小写）", () => {
  assert.match(hostInviteCode(HOST_EVENT_IDS.asakai3), HOST_INVITE_CODE_PATTERN);
  assert.equal(hostInviteCode("e-1"), hostInviteCode("e-1"));
  assert.notEqual(hostInviteCode("e-1"), hostInviteCode("e-2"));
  assert.equal(normalizeRosterEmail("  T.Tanaka@Example.COM "), "t.tanaka@example.com");
});

test("§43 レポート申込推移横轴截到开催日：Founders Lunch #11 = 8月7日…8月27日，vol.17 = 8月20日…9月9日", () => {
  assert.deepEqual(hostReport(HOST_EVENT_IDS.founders11, "all")?.all?.trendLabels, ["8月7日", "8月14日", "8月21日", "8月27日"]);
  assert.deepEqual(hostReport(HOST_EVENT_IDS.cfo17, "all")?.all?.trendLabels, ["8月20日", "8月27日", "9月3日", "9月9日"]);
  assert.equal(hostReport(HOST_EVENT_IDS.founders11, "all")?.all?.trend.length, 21);
  assert.deepEqual(trendAxisLabels(null, 21), []);
});
