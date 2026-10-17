# R20a — 実装記録（進行中）

2026-10-18、run-01。承認済み PLANNER rev2 に沿って実行中。本記録は SC-02 のサーバー修正、SC-12 の OAuth 前提、SC-11a の骨格までで、Sprint 完了を示さない。

- 開始 HEAD：`1524d3667`。主会話のナビゲーション修正 `56da437ef` は別作業。
- PLANNER SHA256：`091e9e2ca8249a8e39aa7e87e0c7be3b1175b9a86c664c7939cb9eae5b6bc159`。
- pristine 基線（主会話実行）：Web **7,475 tests / 31 fail / 1,015 skip**、App **3,324 tests / 4 fail / 2 skip**。ログは `/var/folders/3q/sc3_n8917jn8w_j_jltbz_xr0000gn/T/orbit-cd-baseline.fk6V4SASy3/{d-orbits.log,d-app.log}`。SC-02 / OAuth 実装中は App 基線待ちのため App を変更せず、完了通知後に SC-11a の App 実装を開始した。
- Web 失敗の 25 件は scrubbed 環境でローカル DB URL がない明示的な環境失敗。残る 6 件は manifest/new P0、business-card merge text、dev fixture route import、card-scan browser 3 件で、旧 R30 記録との差分か実際の未解決不具合かは未確定。App 4 件は dictionary key-count、joined-person click timeout、plan overview undo click timeout、tasks-unification ファイル失敗（assertion なし）。R30 の Web 7,443 / 7 fail、App 3,322 / 2 fail とは区別し、pass として扱わない。DB 設定付き追加診断は主会話が担当する。

## SC 対照

| SC | 現在の結果 |
| --- | --- |
| SC-02 フォロー | サーバー修正と回帰テスト済み。実 PostgreSQL で App 向け API は 503 → 200、Web loader は unavailable → success。画面操作とスクリーンショットは後続検証に残す。 |
| SC-12 OAuth 前提 | `returnTo=settings` を含む二つの固定遷移先を実装・検証済み。外部日程 API / UI / Google 実接続は本段階では未実装。 |
| SC-11a 日程提案骨格 | §7.6 の二つの path / export / 同形 props と、三段の空構造を実装。両端の三語 rendering tests、Web 閉じる操作を検証。SC-11 の業務実装と像素は未完了。 |
| その他 SC | この段階では未実装。SC-11a は別コミットで実施する。 |

## フォロー 根因

`features/followups/storage/lifecycle-task-pages.ts` の `assertLifecycleSortRuntimeFor` は、`VERIFIED_LIFECYCLE_SORT_RUNTIMES` に登録済みの Node / PostgreSQL の組だけを許可する。既存表には PostgreSQL 16 の組しかなかったが、D のローカル PostgreSQL は **18.3**（`server_version_num=180003`）だった。Node は 25.8.1 / ICU 78.2 / Unicode 17.0 / en-US、PostgreSQL は UTF8 / `und-x-icu` catalog=actual=153.136 / provider=i / deterministic=true。

SQL 自体は正しい行を返す。その直後の共通チェックが `LIFECYCLE_SORT_RUNTIME_UNVERIFIED` を投げ、App API の `app/api/relationship-tasks/page/handler.ts` は 503、Web の `app/(app)/app/tasks/lifecycle-pages-route-service.ts` は unavailable に変換していた。両 catch は根因コードを記録していなかった。App にしかない workspace 照合は、両端で同時に失敗する原因ではなかった。

修正前に `tests/services/r20a-followup-pg18.test.ts` で両経路の RED を確認。allowlist を変える前に、実 SQL と旧 reader の分類・件数・並び順（current 63 / history 21 / orphan 1）、App API reader の SQL 結果、既存の独立した Unicode probe fixture 全 **19,942 文字**の PG 順位を **665 batch** で照合した。PG の runtime 値を偽装したりチェックを無効化したりしていない。

追加した組は ICU78.2 / Unicode17.0 / en-US + PG18 / UTF8 / 153.136 / deterministic ICU の一組だけ。PG18 + ICU78.3、未確認 collation、catalog/actual 不一致などは引き続き拒否する。SQL、所有者条件、カーソル署名、読取り件数の上限は変更していない。

両 catch は `lifecycle_read_failed` と固定の `check` / `code` を記録する。既知の診断コードと閉じた SQLSTATE リストだけを使い、任意の error message / actor / title / query / row は記録しない。ログ出力失敗時も既存の再試行可能な応答を返す。

## 検証

証拠：`/Users/xzhao/orbit-sprint-evidence/redesign/R20a/run-01/`。

- `sc02-red.log`：5 tests / 2 pass / 3 fail / 0 skip。差分照合は pass、App API 503、Web unavailable、診断ログ欠落で期待どおり RED。
- `sc02-private-code-red.log`：任意の五文字コードをログに出さない保護の RED。
- `sc02-green.log`：8 ファイル、31 tests / **29 pass / 0 fail / 2 skip**。新規 PG 回帰、Unicode 照合、runtime 拒否、API 入力、既存 Web、既存 PG の分類・権限・cursor・home 比較を含む。
- skip は明示的 opt-in の大規模成長試験 2 件：`growing tasks and associated contacts/connections together stays bounded; unrelated actor growth does not change output`、`same-actor lifecycle growth keeps cold output bounded, measured against old facts`。既存 relationship PG 試験の 10,000 件増加は実行済み（total=10,068、返却 8,741 bytes、1 query）。
- PG テストは `ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost/orbit_line_d` のランダム専用 schema だけに書き、終了時にその schema を削除。既存データは未変更。
- 全量・全体 typecheck・画面・像素は本段階では未実行。主会話の基線完了後、Sprint の残りとまとめて検証する。R31a / R31b 合流前の像素収束は行わない。

## 交接

B 線（R11 / R13）：`VERIFIED_LIFECYCLE_SORT_RUNTIMES` に実測済み PG18 / ICU78.2 の組を追加した。`createLifecycleTaskPagesReader` / `createRelationshipTaskPageReader` / home summary の共通 runtime admission が、このローカル組で通る。読取・権限・ソート規則の変更はない。

### SC-12 OAuth `returnTo` 前提（独立コミット）

C 線（R18a）：`GET /api/integrations/google_calendar/authorize?returnTo=settings` を利用できる。認証成功後は **`/app/settings`** に戻る。`returnTo=calendar`、未指定、未知値は **`/app/tasks?tab=calendar`** に戻る。App も同じキーを使う。App の Web へのフォールバック表示は C 線の担当で、本変更は App を触らない。

遷移キーは authorize 時に既存 HMAC 署名 state に入れ、callback は検証済み state だけから読む。callback に `returnTo` を追記しても無視する。任意 URL、`//host`、`constructor` / `toString` などは固定の calendar 行きになる。従来の state（キーなし）も受理して calendar 行きとする。既存の actor / provider / session / 有効期限 / cookie / 一回限り消費の条件は維持した。

二つの route の処理を隣接 `handler.ts` に移し、route は GET を再 export する。これは外部 Google・実 DB・環境変数なしで実際の authorize→callback 経路を検証するためで、既定依存は従来どおり。token 交換、失効通知、state cookie 削除の処理は維持した。

証拠（同じ R20a/run-01 ディレクトリ）：`oauth-red.log` は署名 state に戻り先がない RED。`oauth-route-red.log` は旧 callback 遷移先と authorize の未接線による RED（4 tests / 1 pass / 3 fail）。`oauth-green.log` は新規 state/route 試験と既存 `agent-integrations-security.test.ts`、**14 tests / 14 pass / 0 fail / 0 skip**。本機の注入した service double のみを使い、Google・実 DB・付費 AI 呼出しはない。

### SC-11a 日程提案骨格（独立した里程碑）

R11 向け：App は `src/screens/calendar/MeetingProposalSheet.tsx` の `MeetingProposalSheet` / `MeetingProposalSheetProps`、Web は `orbit-2026/calendar/MeetingProposalModal.tsx` の `MeetingProposalModal` / `MeetingProposalModalProps` を import する。両端とも props は `{ open, contactId, onClose, onSent?, appointmentId?, initialCandidates?: readonly { startsAt; endsAt }[] }`。Web は既存の Orbit2026Scope 内で利用する。現段階は三つの空ステップを表示するだけで、候補生成や送信はしない。後続 SC-11 で同じ props を維持して処理を加える。

画板 #25–#29 の事前チェックは `preflight-checklist.md` と証拠ディレクトリに記録。App は新規 calendar 字典（4 キー、日中英）と既存 i18n の追加登録、Web は `copy/task.ts` を使用。component/token は変更していない。

RED は空描画 stub に対して App 3 fail / 1 pass、Web 3 fail。GREEN：`sc11a-app-green.log` **4/4 pass**、`sc11a-web-green.log` **3/3 pass**。Web は Chromium で三語表示と閉じる操作、onSent が呼ばれないことを確認。App は実 BottomSheet / UiText を react-native-web 静的描画（native gesture は未検証）。既存 BottomSheet の pointerEvents 非推奨警告が一行出るが失敗ではない。

App guards：`sc11a-app-guards.log` **12 pass / 1 fail**。失敗は pristine 基線にある `the split dictionaries carry exactly the pre-split keys and values`（en **2813 != 2253**、本変更の calendar は ADDED_SINCE_SPLIT に登録して除外済み）で、修正済みとはしない。hardcoded-copy / Ionicons guards と三語 key-set は pass。`sc11a-copy.log` は App calendar **4 entries / 0 issues**。通常 Node 実行は既存 `host-kinds` の拡張子解決で失敗したため、既存 TypeScript loader を付けた `node --import tsx scripts/copy-qa/cli.mjs --app calendar` で検証した。

Web guards：`sc11a-web-guards.log` は hardcoded-copy / CSS token / scope の **12/12 pass**。`sc11a-web-copy.log` は新規 task table **4 entries / 0 issues**。

## 请求

本段階では追加なし。`contacts/new/drafts` のサーバー側破棄要求は SC-07 の交接で記録する。

## 待主会话代定

本段階では追加なし。

## 待用户授权

本段階では追加なし。Neon / production / deploy / real Google / TestFlight は未使用。

## 交接表追加（逐行四栏原文）

本段階では追加なし。共用文書は主会話が更新する。

## 越线自查

SC-02 の Web/API catch、最小の共通 follow-up runtime 修正、診断 helper、SC-12 の integrations OAuth、SC-11a の二つの component / Web CSS / 四キー文案と追加登録 / 対応テスト、およびこの REPORT / preflight だけを変更。B 線許可領域の修正は上記で交接済み。SC-03 別 worker の task service / mirror 変更は本コミットに含めない。`shell-routes.ts`、`shared/compute/follow-up-task.ts`、plan、memo、component library、token、他線文書は未変更。

## 文档更新请求

SC-02 の runtime 根因・回帰証拠を後続の R20a 完了確認時に参照する。README / HANDOFF / DEFERRED / screen-ownership の変更は未実施。
