/**
 * R17 主催 Web 渲染（第 2 段）：マッチング 空 / 少 / 大 / 公開確認，参加者 空 / 少 / 大（批量条、部分失败与 409 就地标出），共同運営者抽屉。
 * 数据来自 mock 示例世界（shared/mock/demo-world/host-events.ts），与像素门禁同一份。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostCohostsView, historyText } from "../../app/(app)/app/orbit-2026/host/HostCohosts";
import { HostConsoleView } from "../../app/(app)/app/orbit-2026/host/HostConsole";
import { HostMatchingView, PublishConfirm, fillSeatsMoves, standingToneMap, tableSizeText } from "../../app/(app)/app/orbit-2026/host/HostMatching";
import { HostPeopleView, peopleIsEmpty, runDecisions } from "../../app/(app)/app/orbit-2026/host/HostPeople";
import { peopleQueryString } from "../../app/(app)/app/orbit-2026/host/host-api";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { HOST_EVENT_IDS, hostCohosts, hostMatching, hostOverview, hostPeople } from "../../shared/mock/demo-world/host-events";

const t = hostTranslator("ja");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const pending = { bucket: "pending" as const, incomplete: false, q: "" };

test("マッチング · 空（b6 #3）：三项检查、条件卡（投資家 off）、サンプル 3 卓淡显", () => {
  const data = hostMatching(HOST_EVENT_IDS.asakai3)!;
  const html = renderToStaticMarkup(<HostMatchingView data={data} t={t} language="ja" />);
  assert.match(html, /data-host-matching="none"/);
  assert.match(html, /申込 42名/);
  assert.match(html, /プロフィール完了 30 \/ 42名/);
  assert.match(html, /未完了の 12名/);
  assert.match(html, /notice=profile_incomplete/); // リマインドを確認 → 概要的定型通知确认
  assert.match(html, /生成は 1イベント 3回まで/);
  assert.equal(count(html, 'role="switch"'), 3);
  assert.equal(count(html, 'aria-checked="false"'), 1);
  assert.equal(count(html, "data-host-table="), 3);
  assert.match(html, /サンプル/);
});

test("マッチング · 少（b6 #4）：两轮切换、下書き、4 卓 span6、残り 2回", () => {
  const data = hostMatching(HOST_EVENT_IDS.roundtable)!;
  const html = renderToStaticMarkup(<HostMatchingView data={data} t={t} language="ja" openWhy={new Set(["B"])} />);
  assert.match(html, /data-host-matching="draft"/);
  assert.match(html, /第1ラウンド 19:20–19:50/);
  assert.match(html, /第2ラウンド 20:00–20:30/);
  assert.match(html, /下書き · 未公開/);
  assert.match(html, /18名 · 4テーブル · 1卓 4〜5名/);
  assert.match(html, /残り 2回/);
  assert.equal(count(html, "data-host-table="), 4);
  assert.match(html, /data-host-why="B"/);
  assert.doesNotMatch(html, /data-host-why="A"/);
  assert.doesNotMatch(html, /data-host-unplaced/);
  assert.equal(tableSizeText(4, 5), "4〜5");
});

test("マッチング · 大（b6 #5）：前 6 卓、未配置 3名、残り 16テーブル、拿起的人与主催者が配置", () => {
  const base = hostMatching(HOST_EVENT_IDS.cfo18)!;
  const tables = base.tables.map((table) => (table.table === "A" ? { ...table, members: table.members.map((member, index) => (index === 0 ? { ...member, placedByHost: true } : member)) } : table));
  const data = { ...base, tables };
  const picked = { from: "B", member: data.tables[1]!.members[2]! };
  const html = renderToStaticMarkup(<HostMatchingView data={data} t={t} language="ja" openWhy={new Set(["A"])} picked={picked} />);
  assert.equal(count(html, "data-host-table="), 6);
  assert.match(html, /未配置 3名/);
  assert.match(html, /未配置の 3名/);
  assert.match(html, /残り 16テーブルを表示/);
  assert.match(html, /欠席連絡 1名/);
  assert.match(html, /主催者が配置/); // 人工移动过的人
  assert.match(html, /藤井 誠一を移動中/);
  assert.match(html, /ここに移動/); // 键盘可达的落点
  // 立場 chip：同一立場同一色，按首次出现顺序
  const tones = standingToneMap(data.tables);
  assert.equal(tones.get("事業会社"), "teal");
  assert.equal(tones.get("投資家"), "lav");
  assert.equal(tones.get("金融"), "");
});

test("空き席に入れる：未配置的人放进人数最少、未满的桌", () => {
  const data = hostMatching(HOST_EVENT_IDS.cfo18)!;
  const short = { ...data, tables: data.tables.map((table) => (table.table === "C" ? { ...table, members: table.members.slice(0, 3) } : table)) };
  const moves = fillSeatsMoves(short);
  assert.deepEqual(moves.map((move) => move.toTable), ["C", "C"]); // C 只有 3 人，补到 5 为止，第 3 人没有空位
  assert.equal(moves.every((move) => move.round === 1), true);
});

test("公開確認（b6 #6）：两轮各 22テーブル · 109名、未配置 3名、再通知说明、共同運営者勾选", () => {
  const data = hostMatching(HOST_EVENT_IDS.cfo18)!;
  const html = renderToStaticMarkup(<PublishConfirm data={data} t={t} busy={false} onCancel={() => {}} onPublish={() => {}} />);
  assert.match(html, /マッチング結果を公開しますか？/);
  assert.match(html, /参加者 112名/);
  assert.equal(count(html, "22テーブル · 109名"), 2);
  assert.match(html, /3名 · 当日受付で割り当て/);
  assert.match(html, /影響を受ける参加者にだけ再通知/);
  assert.match(html, /共同運営者（3名）にも公開を知らせる/);
});

test("参加者 · 空（b6 #7）：申込ページリンク、QR、申込設定摘要、招待者リストを取り込む（A2）", () => {
  const data = hostPeople(HOST_EVENT_IDS.asakai3, "pending")!;
  assert.equal(peopleIsEmpty(data), true);
  const html = renderToStaticMarkup(<HostPeopleView data={data} t={t} rows={data.rows} query={pending} selected={new Set()} origin="orbit.app" />);
  assert.match(html, /data-host-people="empty"/);
  assert.match(html, /orbit\.app\/e\/mfg-dx-asakai-3/);
  assert.match(html, /リンクをコピー/);
  assert.match(html, /QR コード/);
  assert.match(html, /質問 3問 · 審査制/);
  assert.match(html, /CSV から招待リンクと照合表/);
});

test("参加者 · 少（b6 #8）：四段计数、3 行、残り枠 15、§39 审核说明", () => {
  const data = hostPeople(HOST_EVENT_IDS.roundtable, "pending")!;
  const html = renderToStaticMarkup(<HostPeopleView data={data} t={t} rows={data.rows} query={pending} selected={new Set()} />);
  for (const label of ["審査待ち 3", "承認済み 15", "キャンセル待ち 0", "見送り 0"]) assert.match(html, new RegExp(label));
  assert.equal(count(html, "data-host-row="), 3);
  assert.match(html, /承認済み · 残り枠 15/);
  assert.match(html, /主催者からのひとこと/);
  assert.match(html, /未完了/); // 45% 的清水
  assert.doesNotMatch(html, /data-host-bulk/);
  assert.doesNotMatch(html, /さらに表示/);
});

test("参加者 · 大（b6 #9）：勾两行 → 批量条「2名を選択中 · 2名を承認」、さらに表示（4名）", () => {
  const data = hostPeople(HOST_EVENT_IDS.cfo18, "pending")!;
  const selected = new Set([data.rows[0]!.actorId, data.rows[1]!.actorId]);
  const html = renderToStaticMarkup(<HostPeopleView data={data} t={t} rows={data.rows} query={pending} selected={selected} />);
  assert.match(html, /data-host-bulk="2"/);
  assert.match(html, /2名を選択中/);
  assert.match(html, /2名を承認/);
  assert.match(html, /キャンセル待ちへ/);
  assert.match(html, /さらに表示（4名）/);
  assert.match(html, /承認済み · 残り枠 46/);
  assert.equal(count(html, 'aria-checked="true"'), 2);
});

test("批量部分失败：逐条调用各带版本号，409 的行就地标「他の運営者が先に更新しました」", async () => {
  const data = hostPeople(HOST_EVENT_IDS.cfo18, "pending")!;
  const targets = data.rows.slice(0, 3);
  const seen: Array<[string, number]> = [];
  const result = await runDecisions(targets, async (row) => {
    seen.push([row.actorId, row.applicationVersion]);
    if (row.actorId === targets[1]!.actorId) return { ok: false, reason: "conflict" };
    if (row.actorId === targets[2]!.actorId) return { ok: false, reason: "network" };
    return { ok: true };
  });
  assert.equal(seen.length, 3);
  assert.equal(result.ok, 1);
  assert.equal(result.failed.get(targets[1]!.actorId), "conflict");
  assert.equal(result.failed.get(targets[2]!.actorId), "failed");
  const html = renderToStaticMarkup(<HostPeopleView data={data} t={t} rows={data.rows} query={pending} selected={new Set(result.failed.keys())} issues={result.failed} />);
  assert.match(html, /data-issue="conflict"/);
  assert.match(html, /他の運営者が先に更新しました/);
  assert.match(html, /data-issue="failed"/);
  assert.match(html, /更新できませんでした/);
  assert.equal(t("conflictFirst"), "他の運営者が先に更新しました");
});

test("参加者查询参数", () => {
  assert.equal(peopleQueryString({ bucket: "approved", incomplete: true, q: " 森 " }), "bucket=approved&q=%E6%A3%AE&incomplete=1");
  assert.equal(peopleQueryString(pending), "bucket=pending");
});

test("共同運営者抽屉（b6 #20）：owner 変更不可、改角色要理由（空则保存置灰）、役割表、変更履歴", () => {
  const data = hostCohosts(HOST_EVENT_IDS.cfo18)!;
  const html = renderToStaticMarkup(<HostCohostsView data={data} t={t} inviteRole="check_in" target="" reason="" edit={{ actorId: "demo-actor-kobayashi", kind: "role", role: "manager" }} />);
  assert.match(html, /CFO Night Tokyo vol.18 · 4名/);
  assert.match(html, /佐藤 健一（あなた）/);
  assert.match(html, /オーナー · 変更不可/);
  assert.match(html, /data-cohost-edit="role"/);
  assert.match(html, /マッチングの公開・参加者の審査ができるようになります/);
  assert.match(html, /変更理由（必須）/);
  assert.match(html, /0 \/ 100/);
  assert.match(html, /理由を入力すると保存できます/);
  assert.match(html, /disabled="">変更を保存/);
  assert.match(html, /招待リンクは 7日間有効です/);
  assert.match(html, /役割でできること/);
  assert.equal(historyText(data.history[0]!, t), "伊藤 直子 を管理者に");
  assert.equal(historyText(data.history[1]!, t), "渡辺 翔 を招待（閲覧）");
  assert.match(html, /理由：申込審査を分担するため · 佐藤/);
  const filled = renderToStaticMarkup(<HostCohostsView data={data} t={t} inviteRole="check_in" target="" reason="受付と審査を兼ねるため" edit={{ actorId: "demo-actor-kobayashi", kind: "role", role: "manager" }} />);
  assert.doesNotMatch(filled, /理由を入力すると保存できます/);
  const issued = renderToStaticMarkup(<HostCohostsView data={data} t={t} inviteRole="check_in" target="" reason="" issued={{ expiresAt: "2026-10-14T14:59:00.000Z", inviteId: "i1", link: "/app/host/join/x", shortCode: "H-7KQM-2TR4" }} />);
  assert.match(issued, /H-7KQM-2TR4/);
  assert.match(issued, /今だけ表示されます/);
});

test("页签：参加者角标在参加者页签本身不显示；三语不回退日文", () => {
  const data = hostOverview(HOST_EVENT_IDS.cfo18)!;
  const onPeople = renderToStaticMarkup(<HostConsoleView data={data} tab="people" language="ja" content={<div />} />);
  const onMatching = renderToStaticMarkup(<HostConsoleView data={data} tab="matching" language="ja" content={<div />} />);
  assert.doesNotMatch(onPeople, />参加者<span/);
  assert.match(onMatching, />参加者<span[^>]*>12</);
  for (const language of ["zh", "en"] as const) {
    const html = renderToStaticMarkup(<HostMatchingView data={hostMatching(HOST_EVENT_IDS.asakai3)!} t={hostTranslator(language)} language={language} />);
    assert.doesNotMatch(html, /まだマッチングを生成していません/, language);
  }
});
