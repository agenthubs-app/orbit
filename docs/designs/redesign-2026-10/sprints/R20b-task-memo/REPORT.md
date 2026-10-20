# R20b — 実装記録（進行中）

2026-10-19 06:41 局所 C11 接続検証：計画 `docs/superpowers/plans/2026-10-19-r20b-c11-local-e2e.md` に従い、`tests/capabilities/r20b-memo-plan-local-e2e-postgres.test.ts` を追加した。明示した回環 `orbit_line_d` のランダム隔離 schema で、本人の面談メモを実際の notes HTTP handler から保存し、同じ PostgreSQL の note / extraction / Plan v2 記録を使用。保存時の C11 job は一件だけ発行され、再送では増えない。固定 AI provider・quota gate を注入して実 memo-extraction 状態機械を通し、2/3 問の回答から本人の確認カード一枚を作成。提案時の score は不変で、確認後に一回だけ増え、同鍵の確認・抽出再実行では二重計分も provider 再呼出もない。他 actor はメモを 404 として受け、確認カードも読めない。既存の PostgreSQL notes/mirror と R24 plan 対象 **15/15 pass**。このテストは製品の `after()` 実行コンテキストを scheduler spy で置き換え、AI provider／quota gate は固定応答であり、production の構成済み provider・実課金 ledger、端末の確認カード読回、UI / native / pixel を証明しない。SC-10 と全量受入は引き続き OPEN。

07:05 最終確認：新テストは永続行／再処理断言と型修正後 **1/1 pass、0 skip、exit0**。その前の再実行一回は PostgreSQL 接続確立の 2 秒 timeout で **0/1、exit1**（断言に到達せず）；DB が接続を受け付け、残留 schema 0 件であることを確認してから再走した。Web `tsc -p tsconfig.json --noEmit --incremental false` は型修正後 **exit0**。最終テスト後の独立照会でも `network_%` schema は **0**。全量テストや実 AI 呼出はこの検証では行っていない。

2026-10-18、D 線 `line-d`、run-01。主会話指定の R20a「除像素外」失敗帰属チェックポイントを受け、同じ隔離 worktree で R20b の独立した契約・画板調査から着手した。R20a 自体は未完了であり、Task 容器／旧画面削除／native／pixel はこの時点で R20b の合格根拠にしない。20:30 のチェックポイントで `origin/redesign` に rebase した。push はしていない。

2026-10-19 04:37 現行 D は `origin/redesign d8e6dafb7` への rebase 後。R20b notes の service / HTTP 定向 **25/25**、App mirror / view-model / search / outbox 定向 **22/22** は exit0。Web `npm run typecheck` / `typecheck:app` / `lint` と App `npm run typecheck` も現行 D tree で exit0（App check は同時進行の calendar locale 修正 `da0ef82bf` の commit 後）。R20b 全量、C11 保存→提議→確認後計分の単一本機 E2E、native / pixel と R20a 残項は OPEN。これらの局所結果を全量合格へ拡張しない。

2026-10-19 03:13 統合チェックポイント：D の clean な 5 件を C / R13 契約までの `origin/redesign b62a13a95` に、次いで上流の R18a / R20a REVIEW `5d277cbe9` に、いずれも衝突なく rebase した。現在の D は上流より 12 commit 先で、push していない。rebase 後の Web Task container **8/8** と隣接 task page **2/2** は exit0。C11 本機 PostgreSQL 保守ファイルは最初 **6/7**：一項が隔離 schema 作成中の接続 timeout で失敗し、断言失敗ではない。PostgreSQL 応答と利用接続を確認後、その一項を隔離再実行 **1/1 pass**、`network_*` schema 残留 **0**。最初の 6/7 を 7/7 に書き換えない。現在の D tree で Web `typecheck` / `typecheck:app` / `lint` と App `typecheck` は exit0。R20b 全量、C11 保存→提議→確認後計分の一体 E2E、native / pixel は引き続き OPEN。

## 2026-10-19 C11 補掃・ログの個人情報対策（部分）

`1f2af290f` で、従来の `contact_detail_states` memo 補掃を残したまま、`notes` 集合の `usedForPlan=true`／`meeting`／単一連絡先の筆記を候補に追加した。note の record ID と本人の `ownerUserId` / `accountId`、有効な同一 actor の連絡先を SQL で照合し、同じ `noteId + body hash` の終態作業があれば再抽出しない。候補は既存の一回最大 10 件・一 SQL 読取のまま。新筆記の `usedForPlan` も保守作業から既存 C11 入口へ渡す。保存直後の after-hook を失った本機隔離 PostgreSQL 用例は **0 件で RED → 1 件抽出・再走査 0 件で GREEN**、旧 memo を含む保守ファイル **6/6**。他 actor の連絡先、削除済み連絡先、非面談、未 opt-in、複数連絡先、所有者不一致も候補から除いた。テスト後の `network_%` schema 残留は **0**。

エラー記録の先行テストは **22 pass / 5 fail**。失敗の原因は actor/contact/note ID と例外文がログに出ること、また `beginCall` / 書戻しの任意例外文が提取記録に保存されることだった。両方を固定 stage / code に替え、同じ二ファイル **27/27 pass**。provider の呼出し回数、失敗後の再試行可否、抽出済み結果の保持は変更していない。Web `typecheck:app` exit0。通常の Web `typecheck` は B 線全量と重なり、空きメモリ 8% の時点でこちらから中断した（exit130）；合格扱いせず資源が落ち着いてから再走する。全量は Sprint 收口時のみという主会話の指示どおり未実行。C11 の保存→計画提議→確認後の計分、端末読回と UI は未検証で、SC-10 は OPEN のまま。

補助回帰として、新筆記の本文だけを変更すると新しい hash で再補掃され、再度の同一本文は実行されないことを実 PostgreSQL で確認した。終態、disabled、未来／到期 deferred の候補判定も同じ新筆記で確認し、保守ファイルは最終編集後 **7/7 pass**、隔離 `network_%` schema 残留 **0**。追加テストを含む作業ツリーで通常 Web `typecheck` を新規実行し **exit0**、Web `lint` も **exit0**。これは C11 の局所検証であり、Sprint 全量や E2E の合格ではない。

同じ D の現行ソースで R24 の本機 PostgreSQL `S1: memo proposal → pending → accept (scores)` を単独再実行し **1/1 pass**、隔離 schema 残留 **0**。下流の提議・確認後計分が動く証拠であり、新筆記の保存後 hook からそこまで通した E2E 証拠ではない。SC-10 は OPEN のまま。

新筆記の HTTP / service 定向二ファイルも **25/25 pass**。保存済みの面談・単一 contact だけを C11 に引き渡すこと、同じ保存の重放で重複起動しないこと、後処理失敗でも筆記を戻さないことを含む。これは上の PostgreSQL 補掃と R24 計分をつなぐ**各境界の回帰**であり、構成済み quota/provider を含む一つの本機 E2E、確認カードの端末読回、UI はなお未実行。

## 20:30 統合チェックポイント

`line-d` の clean `5e0419cdc` を `origin/redesign 324218dda` へ rebase し、HEAD は `c06741285` になった。157 commits の replay で止まったのは `add-contact-screens.test.tsx` の dialog entrance wait 一箇所だけ。上流 `936a7289d` が同じ待機を実装済みなので、その実装を残し、D 側の重複を入れなかった。rebase は exit0、直後の `git diff --check` は exit0。R20a / R20b の product source をこの衝突解消で変更していない。

rebase 後の軽量確認は Web notes route/service と task planLink route/service **29/29 pass**、App notes view-model/mirror/search と旧 local-first 画面 **28/28 pass**（各 `node --import tsx --test …`、exit0）。App の render test は `notes-native:fixture` の `useSafeAreaInsets` 未定義 export warning を出した。今回の 28 件に失敗はないが、warning は消していない。これは新しい upstream 上での定向結果で、rebase 前の full 40/11 failures、typecheck exit0、native/pixel 未完を上書きしない。新 upstream の full/typecheck は別に再実行する。

20:51 の監視点で upstream がさらに `bd39989dd` まで 5 commits 進んだ。D は clean `11c093cda` から同じ `origin/redesign` へ 160 commits を衝突なしに再適用し、HEAD `917978ff9`、`git diff --check` exit0。追加の upstream は R31a の App-add kit no-regress と文書であり、D の product 差分を手修正していない。この HEAD の定向 Web notes/planLink は **29 pass / 1 skip / 0 fail**、App notes view-model/mirror/search は **18/18 pass**。Web の 1 skip は後述の一般 task-list stale plan ETag 回帰で、合格ではない。新 upstream の full/typecheck は公平キューの結果待ちで、旧 HEAD の結果を移用しない。

21:01、同じ再適用済み product source（後続は文書だけ）で D App `npm run typecheck`、D Web `npm run typecheck` がいずれも診断なし **exit0**（実行 session `10023` / `81500`）。App full は公平キューから開始したが、この時点では結果待ち。Web full、Web `typecheck:app` / lint もまだ待機中で、compiler exit0 を全量合格へ拡大しない。

21:12、再適用後の D App full (`_evidence-d/R20b/run-01/d-app-full-post-rebase-324218dda.log`) は **3,356 tests / 3,333 pass / 19 fail / 2 cancelled / 2 skip、exit1**。前回の 11 failure names は残り、正規化した失敗／取消名の差分は新たに 10 件。内訳は profile の旧 callback scope 5 件、通知登録競合 2 件、password reset 1 件、personal schedule 2 件。新 10 件の raw error はすべて Playwright の 1.8/2.5 秒操作待ち、または Node test の 5 秒 timeout であり、今回の full は約 669 秒かかった。ただし負荷による一過性と**まだ確定しない**。該当 test/source は R20b では変更しておらず、個別再実行で再現性を確認するまでは「新規 0」とせず、App full を赤として保持する。Web full はその後の公平キューで開始。

21:19、再適用後の D Web full (`_evidence-d/R20b/run-01/d-web-full-post-rebase-324218dda.log`) は **7,789 tests / 6,716 pass / 39 fail / 0 cancelled / 1,034 skip、exit1**。前回 retained 40 failure names と正規化して比較すると新規名は 0、旧 R12 手入力 undo の 1 件だけ今回通過した。skip の 1 件増は一般 task-list の stale plan ETag 回帰を明示して止めたもの。39 fail とその skip は未解消であり、全量 green や SC-11 達成とは記さない。

21:21 監視点で `origin/redesign` は R31a 独立 REVIEW の `805b2ee7c` に進んだ。D は REPORT を `3cae527b8` に確定してから 164 commits を衝突なしに rebase し、HEAD `0e61b13cc`、ahead 164 / behind 0、worktree clean、`git diff --check` exit0。追加 upstream は REVIEW 文書のみで、21:12／21:19 の full 結果を新しい product source の合格とは言い換えない。

待機していた D Web `typecheck:app` / lint の旧 queue wrapper は双方 **exit137・出力 0 byte** で終了しており、実行済みとは扱わない。21:28、現 HEAD で独立ログ `d-web-app-tsc-post-rebase-805b2ee7c.log` と `d-web-lint-post-rebase-805b2ee7c.log` にそれぞれ再実行し、双方 **exit0**。前者は診断なし、後者もエラーなし。中断原因は未特定であり、App full の新規 timeout 10 件の再現確認はまだ必要。

21:42、App full で新たに timeout した 10 件を同じ product source で絞って再実行した。通知登録競合 file は **16/16 pass** (`d-app-notification-race-focused-post-rebase-805b2ee7c.log`)、profile の旧 callback scope、password reset、personal schedule の name-filtered serial run は **43/43 pass** (`d-app-timeout-focused-post-rebase-805b2ee7c.log`)。前回の新 10 件はこの再実行ですべて通ったため、full 並列時の時間余裕が疑わしい。ただし 21:12 の full **19 fail / 2 cancelled** は依然として赤であり、この局所再実行だけで「全量新規 0」とはしない。`--test-concurrency=4` の App full を公平キューに再登録し、同じ HEAD で失敗名を再比較する。

22:22、その限並列 App full (`_evidence-d/R20b/run-01/d-app-full-concurrency4-post-rebase-805b2ee7c.log`) は **3,356 tests / 3,341 pass / 13 fail / 0 cancelled / 2 skip、exit1**（約 425 秒）。前回 19 fail / 2 cancelled の新規 timeout／cancel 名 10 件はすべて今回は通った。一方、retained 11 failure names はすべて残り、以前は通っていた invite-code の「無効にする」sheet と plan overview の skip / undo が新たに 5 秒 click timeout になった。両者の Playwright raw log は背面ボタンへの overlay / scrim pointer-event interception で、R20b が変更した test/source ではない。この full は E 線 iOS xcodebuild と同時に重タスク 2 スロットで走ったため負荷の影響を疑うが、原因を断定しない。直後、同じ source と同じ E build 並走中にこの 2 名を serial name-filtered で再実行し、**2/2 pass / 0 skip / exit0** (`d-app-invite-plan-timeout-focused-post-rebase-805b2ee7c.log`)。よって R20b 新規恒常失敗の証拠はないが、全量 13 fail の赤はそのまま保持し、invite / plan の一時失敗も隠さない。

## 18:22 主会話継続の検証キュー（結果待ち）

D 実行者の終了時に、旧 `app-typecheck-after-contract.log` と `app-board-preflight.log` は **0 byte**、対応 runner PID も消えた。これは合格／失敗ではなく未実行として扱う。主会話は clean `66769b462` から独立した新規ログ名で App／Web `typecheck`、Web `typecheck:app`、App／Web 画板 preflight、Web full を全機 `heavy.sh` の公平キューへ再登録した。先に独立登録済みの App full も待機中。開始時の実際の source を確認してから成績を追記し、旧空ログを結果へ読み替えない。

軽量 Web copy QA は `node --import tsx scripts/copy-qa/cli.mjs --web --json` で **3,514 entries / 26 issues、exit1** (`_evidence-d/R20b/run-01/d-web-copy-post-owner-exit-66769b462.json`)。`web.*memo*` の issue は **0**。26 件が残るため Web 全体を copy 合格とはしない。R20a の未完 UI/native/pixel と R20b の本体 SC は引き続き OPEN。

19:08、fair queue の D App full が clean source HEAD `66769b462`（REPORT 追記のみ未コミット）で終わった。原始ログ `_evidence-d/R20b/run-01/app-full-after-note-offset-2272b8e48.log` は **3,342 tests / 3,328 pass / 12 fail / 0 cancelled / 2 skip**。前回 `R20a/run-01/d-app-full-post-rebase-1dad1a9a1.log` と失敗名を正規化して集合比較した `diff -u` は空で、今回の新規 failure name は **0**。12 件は R12 の期限切れ add/camera fixture 9 件、既知の辞書 key-count、joined-person click、plan overview overlay click 各 1 件と同名である。テスト増分 16 件が通っても全量 suite は赤のまま；D の App typecheck／Web full／両端 preflight は後続 queue の結果待ちで、SC-04/05/08 や R20a native/pixel の合格根拠にはしない。

19:25、clean product source `66769b462` の D Web full は **7,772 tests / 6,698 pass / 41 fail / 0 cancelled / 1,033 skip、exit1** (`_evidence-d/R20b/run-01/d-web-full-post-owner-exit-66769b462.log`)。前回 R20a `d-web-full-stale-read-fix.log` の 40 failure names と正規化比較した差は、R20b 自身の `the entire project typechecks with zero errors` だけで、既存 40 件は消えていない。独立 typecheck の診断は Web production 2 件（HTTP mention cast、`usedForPlan` の `unknown` return）、Web tests 1 件（union patch の直接 property access）、App 5 件（省略可能値を明示 `undefined` にした receipt/query と union patch の test access）だった。production の二件と App の optional input は元の runtime 値・検証境界を維持する型修正、test access は同じ payload 全体の deep equality に強化した。修正後の定向 Web notes service/HTTP/schema **29/29**、App view/outbox/search **13/13** は各 exit0 (`d-{web,app}-focused-ts-repair-working-tree.log`)、`git diff --check` も exit0。ただし fresh Web `typecheck` / `typecheck:app` / App `typecheck` は fair queue 待ちであり、ratchet と full suite を green と呼ばない。

画板 preflight の App / Web runner はそれぞれ exit0 (`{app,web}-board-preflight-post-owner-exit.{json,md,log}`) で、登録された原画を解析した。token 照合の内訳は Web exact 59 / near 2 / missing 1、App exact 255 / near 5 / missing 35。生成されたデータ出典表は空欄を含み、欠けた token も残るため、画板解析が走った証拠だけであって五項目のデータ出典・可達操作や pixel の合格ではない。

19:34、修正後の fresh `npm run typecheck` は D Web / D App とも **exit0**、D Web `npm run typecheck:app` も **exit0** (`_evidence-d/R20b/run-01/d-{web,web-app,app}-tsc-ts-repair-working-tree.log`)。compiler の赤は解消したが、Web/App full はそれぞれ `d-{web,app}-full-ts-repair-working-tree.log` へ fair queue で再実行待ち；以前の full 41/12 件を消去しない。

19:42、型修正後の fresh D Web full は **7,772 tests / 6,699 pass / 40 fail / 0 cancelled / 1,033 skip、exit1** (`_evidence-d/R20b/run-01/d-web-full-ts-repair-working-tree.log`)。`the entire project typechecks with zero errors` は同じ full 内で **pass**。前回 R20a の retained 40 failure names との正規化 `diff -u` は空で、今回の新規 failure name は 0。ただし 40 件が残るため全量 green とは言わない。D App full は同じ修正 source で後続 queue 実行中。

19:46、その D App full は **3,342 tests / 3,329 pass / 11 fail / 0 cancelled / 2 skip、exit1** (`_evidence-d/R20b/run-01/d-app-full-ts-repair-working-tree.log`)。retained R20a 12 failure names と比較すると新規 0 件で、以前の plan overview `skip: the confirm focuses ...` timeout が今回は通った。他の R12 camera/add 9 件、辞書 exact-key、joined-person の 11 件は残る。App / Web とも定向・型検査は通ったが full は依然赤、SC-04/05/08 / native / pixel を閉じない。

## 開始時点と基線

- D の開始 HEAD `6633cf27f`、worktree clean、`line-d` は `origin/redesign` に対し ahead 128 / behind 20。R31a / R31b の実際の App/Web kit export は両方ある。メモ用新画面はまだなく、R20a REPORT は「進行中」。
- R20b 開始直前の App full は R20a の `d-app-full-post-rebase-1dad1a9a1.log`: **3326 tests / 3312 pass / 12 fail / 2 skip、exit 1**。失敗名は D pristine の辞書・joined-person・plan overlay 3 件＋R12 の期限切れ fixture 9 件。Web full は `d-web-full-stale-read-fix.log`: **7744 / 6675 pass / 40 fail / 1029 skip、exit 1**。D pristine31件＋A kit Button ratchet 1件＋origin と同じ R11a fixture import 8件。失敗名の D-owned 新規は両端とも 0 と帰属済みだが、全量 green ではない。raw は `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R20a/run-01/`。
- `typecheck:app` は R20a の `d-web-typecheck-app-stale-read-fix.log` で exit0。R20b に入ってからの型検査・全量・pixel の成績は別に記録する。

## SC-01 / SC-02 着手

- `scripts/visual/views/{app,web}-R20b.json` に PLANNER rev2 §7 の App 6 枚と Web 1 枚を登録した。これは画板の参照表であり、画板 preflight、実装 screenshot、pixel pass ではない。Web 1024/390/深色と App 深色は対応する画板がない、b5 #47/#48 は次期、#52 は作废。AI／音声の一部は主会話改稿待ち。
- 静的画板の先読みでは Web #19 と App #26 が「すべて 12 / 面談 7 / 自由メモ 5」と表示しながら各 4 card だけを描く。実装時の count は service の `total` / filter 結果から出し、4 card の静的数をデータとして扱わない。Web #19 詳細の「3問中 2問」も画板の例示値で、実データに summary がなければ隠す。正式な五項目 preflight と pixel 判定は queued のまま。
- 共有／App strict outbox の契約テストを実装より先に実行し、Web **1 pass / 2 fail**、App **0 pass / 2 fail** の RED を確認した。無 `contactId` の event token、`noteKind` / `usedForPlan`、`planLink` を既存 schema が拒否していた。
- 共有 schema に mention の contact/event 分岐と非重複、メモ二字段、task の nullable `planLink` を追加し、followup patch には `planLink` を継承させない。`npm run sync:contract` で App 副本を生成。共有 focused **5/5**、App focused **3/3** GREEN；旧 contact token と旧 task patch は元の wire 形を維持し、task PATCH の `planLink:null` を確認した。サービス側 notes actor 権限は後述の定向で検証したが、App editor の unknown token 回伝と SC-02／03 全体は未完了。
- `NoteMentionContract.contactId` 必填から可選への変更は `shared/contract/BREAKING.md` に RD-33 代定として先に記録し、App 副本を同期した。snapshot 708 型を更新し、contract append-only / schema parity の focused **8/8** を確認した。これは runtime の cross-actor 検証を証明しない。
- notes service / HTTP に `noteKind`、`usedForPlan`、event mention を入れ、旧 payload の省略形を保持した。actor scoped association を拒む service、UTF-16 offset、未知 token の既存原形回伝／新造・改写拒否、三分類の件数・cursor と HTTP の厳格 field whitelist を RED→GREEN で確認。隣接の note history / Orbit AI task interaction / route / service / sync registry は **113/113 pass**。App reader は未知 kind を free に広く読み、壊れた同 actor 行だけを飛ばしてサーバー total を保持する；foreign actor 行は mirror 全体を拒否する。App offline overlay は event token を contactIds に混ぜず、unknown token は update だけ queue でき、create は拒否する。App view/mirror/outbox の個別定向は GREEN。
- `usedForPlan=true` は `meeting` かつ単一の actor 可視 contact のときだけ保存可とし、PATCH で kind / contact を壊す操作と単独 contact の unlink も拒否する。HTTP / service の RED→GREEN を確認した。新規保存だけ `onPersisted` で C11 の `runConfiguredMemoExtraction` に `after` handoff し、同じ idempotency key の replay は enqueue しない。enqueue 例外で筆記保存を巻き戻さず、本文なしの構造化エラーを出す。局所 HTTP / service **24/24 pass**。本機 PG mirror / HTTP handoff **9/9 pass**（actor B の GET は 404、test schema の残存 0）。これは C11 provider／quota ledger／提議回読の end-to-end 合格ではない。
- `domain-registry.ts` への fields 追加だけではデバイスに新字段が届かなかった。現行 `read-service.ts` の `mapNotePayload` が新字段を落としており、本機 PostgreSQL の新しい actor A/B mirror test は最初 **6/7、`noteKind` 未下発で RED**。projection の optional field を追加後、同ファイル **7/7 pass** (`_evidence-d/R20b/run-01/local-pg-notes-sync-after.log`)；`orbit_line_d` の test 作成 schema は後検査で 0。ここで確認したのは note の kind / flag / event token。
- App の離線草稿は旧 `contactId` 必須 validator のため `@活動` token を保存できず、新しい `noteKind` / `usedForPlan` も型・validator が受けなかった。草稿 round-trip test **2/3 RED → 3/3 GREEN**、隣接 App note model/outbox を含め **13/13 pass**。`b94cd2105` は旧草稿を維持し、event 分岐と optional 二字段を追加した。UI の新規／編集画面はまだこれらを渡していないので SC-08 完了ではない。
- App note source の鏡像選択側には三分類が既にあったが、query key と network `notesSearchPath` にはなかった。カテゴリを引数／cursor page／鏡像 pagination reset に通し、path test **0/1 RED → 1/1 GREEN**、mirror/source 隣接 **10/10 pass**。`3e6eb571b` の配線は旧画面未使用であり、画面分類の動作証拠ではない。
- 旧新規／編集画面の保存確認は全 `@mention.contactId` を集め、event mention の `undefined` を混入させる一方で `eventId` を確認対象に含めなかった。`noteAssociationsForReceipt` は明示 chip と contact/event token を別々に正規化し、両画面の `confirmedNote` に kind/flag も渡す。**6/7 RED → 7/7 GREEN**、草稿/outbox 近接込み **14/14 pass**。`7f7e7555e`。ブラウザ操作鎖は未検証。
- demo world は実際には 2 notes のみで、コメントの 5 と不一致だった。event token、`noteKind` / `usedForPlan` なしの旧行、voice、自由メモを追加し、全件 `sample:true`。`80985a8c6`、新 test **0/1 RED → 1/1 GREEN**、fixture 契約／日文 copy-qa 込み **7/7 pass**。実ユーザー行には触れていない。
- App の新しい「不正な server 行だけ skip」decoder を queued mutation にも使うと、不正な `usedForPlan` の本機行が skip されて `{localMutationState}` だけの ghost row が表示された。新 test **7/8 RED → 8/8 GREEN**、view/outbox 隣接 **19/19 pass**；`eb52b8f1f` は queue projection が一行正しく得られなければ mirror 全体を error にする。サービスからの不正行を skip する規則は変えない。
- queued mutation の `mentions:[null]` は projection の `entityType` 参照で TypeError を起こした。`01857ad5d` は投影前に非 object mention を fail closed にし、同じ test を **7/8 RED → 8/8 GREEN**、隣接 App view/outbox **21/21 pass** とした。これは frozen request 全経路の検証ではない。
- SC-08 の「本機 temporary contact id を先に同期し、note を後続出隊」は現行実装と一致しない。`mutation-adapters.ts::isOfflineEligible` は note / task / personal_schedule / relationship_message のみを許可し、contact create は含まない。`ManualContactScreen` の保存も `add-api.ts::saveManual` から `/api/contacts/manual` に直接 POST する。従って現行の手入力から temporary contact id を発行・ACK する outbox 経路はなく、このシナリオを通ったとは言えない。連絡先の offline create・ID alias・依存出隊は notes allowlist 外の基盤変更として主会話へ要請し、SC-08 は未完にする。

2026-10-19 主会話 RD-33 代定：上記の「オフラインで連絡先を新規作成→仮 ID をノートへ連結」は **R20b から除外**し、連絡先領域 B 線の後続 DEFERRED とする。SC-08 で本期確認するのは、**オンラインで保存済みの連絡先 ID を、オフライン作成／編集したノートが参照し、復帰後も同じ actor の連絡先を指すこと**。旧 PLANNER の仮 ID 依存出隊を実装済みとみなさず、オンライン保存→端末 mirror→機内モード→ノート queue→復帰読回の操作・本機回帰を別途取る。DEFERRED-A へ主会話が転記する文案：`R20b SC-08｜オフライン連絡先新規作成、仮 ID alias と依存ノート出隊｜B 線連絡先領域の後続設計・実装・actor 隔離／再試行検証へ移管｜R20b はオンライン作成済み連絡先をオフライン筆記から参照する経路のみ検証`。
- SC-09 の既存遷移を再確認した。新規保存の成功時は `ManualContactScreen` が b11 #18 の `ManualSavedView` を出し、そこにある「面談のメモを書く」行は既に `/notes/new?contactId=<保存済み ID>` へ進む。merge 成功時は本人ページへ push し、同じ CTA はない。失敗・duplicate review では note を作らず、undo は保存済み連絡先だけを戻す。PLANNER の「保存成功で新規 memo へ」と b11 の保存後確認 / undo を両立するなら、推奨は既存 saved view を残して明示 CTA を新 memo screen に接続すること；毎回の自動 redirect は R12 の確認画面を飛ばすため代定が要る。新 memo screen 未実装、merge 分岐と実保存→再読も未検証なので SC-09 は OPEN。
- これらの後続を合わせた serial focused run は Web **66/66 pass** (`_evidence-d/R20b/run-01/web-focused-after-demo-and-app-fixes.log`)、App **33/33 pass** (`app-focused-after-memo-fixes.log`)；両方 exit0 / skip0。これは full suite、型検査、ブラウザ操作、pixel の代用ではない。
- 共有 D worktree の別 App 作業者による `2272b8e48` は本文 trim 後の `@` token UTF-16 offset を補正し、局所 regression を追加した。こちらは後からその commit を確認し、既存行を上書きせず additive に続けた；独立の full compiler / browser はまだ待機中。
- `1dc0d05bd` は App request builder に `usedForPlan=true` の面談／単一 contact 構造チェックと三言語エラーを追加した。TDD **8/9 RED → 9/9 GREEN**、周辺 App **28/28 pass** (`app-focused-plan-use-local-validation.log`)。actor 可視性は従来どおり server が最終判定する。`i18n-domain-split` の古い exact count は **2890 vs 2253** で失敗（加鍵前から 2889 vs 2253 の既知基線）；他の同 file 2 checks は pass。notes copy-qa は **135 entries / 150 issues、exit1** (`app-notes-copy-qa-after-plan-use.log`) だが、新キーは component kind を登録しており issue 行なし。150 件を合格とは扱わない。
- 最新 App source で note draft / outbox / mirror / category / view-model と task mirror / outbox の軽量再実行は **39/39 pass、0 skip、exit0** (`_evidence-d/R20b/run-01/app-focused-post-overlay-final.log`)。これは App full / `tsc` / simulator ではない。

SC-06 の歴史 `voice` 読取を小さく再確認した。既存 App mirror の分類テストは旧 kind 不在行と `voice` を自由メモに入れて **1/1 pass**；Web notes service には本文だけ編集した歴史 `voice` の kind が保存後 GET と自由メモ検索でも変わらない回帰を追加し、同 file **16/16 pass**、fresh Web typecheck **exit 0**（`_evidence-d/R20b/run-01/d-app-voice-mirror-characterization.log`、`d-notes-service-voice-characterization.log`、`d-web-tsc-after-voice-characterization.log`）。これはサービス／mirror の局所証拠であり、旧四画面を置き換えた後の source chip、🎙 非表示、権限・依存の不増加、両端操作／画素は未確認。SC-06 は OPEN のまま。

## SC-11 データ鎖（部分実装）

- Task DTO / record decoder / service / HTTP POST・PATCH に任意の `{planId,typeItemId}` と PATCH `null` 解除を追加した。サーバー側は actor の生効 v2 plan に実在する type item を参照する場合のみ書き込みを受ける；偽 ID は 400。Task GET / list は後に計画が失効したリンクを隠し、task 自体は残す。`GET /api/tasks?planId=…&typeItemId=…` は同じ actor/type の task だけ返し、計画状態が task-record ETag に含まれないためこの絞込だけ条件付き 304 を使わない。
- TDD の service **0/2 → 2/2**、HTTP **1/2 → 2/2**、隣接 task service / route を含む **22/22** を確認。実 v2 memory repository の actor scope / archived / achieved / 偽 type item の検査は **1/1**。`mapTaskPayload` が registry の `planLink` を落としていた本機 PostgreSQL mirror test は **7/8 → 8/8**、actor B には A の task が来ない。App offline task overlay の局所 create は link を落としていたため **5/6 → 6/6** に修正し、PATCH null も確認した。
- 追加の loopback PostgreSQL テスト **1/1** は同じ隔離 schema の本物の v2 plan/type と task を作り、actor B の偽リンク拒否、archive 後の GET / 絞込から link を隠し task 本体を残すことを確認した。一般 task list の条件付き ETag と device 増分 mirror は plan の失効だけでは更新されない。type 絞込 HTTP は毎回再検証するが、端末側の失効リンク清掃と E 線 UI の連動は未完。ゆえに SC-11 は閉じない。
- 一般 `GET /api/tasks` の未解決回帰を再現した。plan link を持つ task の最初の一覧応答から ETag を取り、task 自体は変更せず plan だけ失効させて再読すると **304** になり、再検証済み本文を返すべき **200** にならない（`d-task-general-list-stale-plan-red.log`、追加テスト 3 pass / 1 fail、exit1）。task-only watermark が別表 `plans` の変更を含まないのが原因。単純に一覧の条件付き GET を外す案は既存の「不変なら一 SQL 行で 304」という性能・HTTP 契約を壊すため採用せず、製品 route は元に戻した。回帰テストは原因と未解決を明記して **SKIP** に置き、隣接 focused は **9 pass / 1 skip / 0 fail**；skip を合格扱いしない。主会話へ、plan v2 の版／失効を同じ条件付き読取の鍵に含める実装と PG 回帰の担当を要請する。これが済むまで SC-11／全量ゼロ新規 skip は未達。

2026-10-19 追跡：現行 D の同 HTTP file は **3 pass / 1 skip**。`conditionalJsonRead` の `tasks.list` は `orbit_records` の `tasks` と認可 collections だけを一行集計するが、plan v2 の有効性判定は別表 `plans` と `plan_items` の actor-scoped 読取に依存する。従って task watermark の値が不変でも表示すべき `planLink` は変わり得る。既存 `conditional-routes-postgres.test.ts` は未変更の `GET /api/tasks` に「304 時一 SQL／一行」を要求する一方、その隔離 schema は `orbit_records` だけを設置しており、単に plan 表を無条件参照する変更では既存 gate も壊れる。候補は D-owned task route に actor / workspace を限定した task＋plan＋type-item の一行 watermark を導入し、隔離 PG fixture に必要な plan migration を揃えて、現 SKIP を RED→GREEN にすること。共用 `conditional-read` を越線変更する案、全一覧を毎回読んで 304 を失う案、失効 `planLink` を残す案はいずれも採らず、変更の設計／帰属確認まで製品 source と SKIP はそのままにする。

2026-10-19 継続：既承認の SC-11「失効 link は一覧で隠す」「不変の条件付き GET は一 SQL 行で 304」の両条件に沿い、D-owned task list に plan-aware watermark を実装した。actor / workspace 内の task と認可 collection、**全 active v2 plan ID** と各 plan の network-need type ID 集合を一 SQL 行の ETag 入力に含める。plan 表がない／watermark が読めない場合は従来の fail-closed 本文読取へ戻し、誤った 304 を返さない。type 絞込読取は従来どおり条件付き GET を使わない。未変更 ETag の 304 は同じ一行であり、共有 conditional-read は変更していない。

上記の一般一覧 SKIP を解除し、失効後 304 となる RED → 200 と link 非表示の GREEN を確認。本機 PostgreSQL で `plans.status` を更新時刻不変のまま archived にした場合も 200 + link 非表示、別 actor の type 削除では 304 を維持し、本人の type 削除では 200 + link 非表示。既存の六 GET route 一行 watermark 回帰は plan migration を fixture に揃えて通過した。初回版の定向は **7/7 pass、skip 0**、Web `typecheck` と `typecheck:app` はともに **exit0**、`git diff --check` も **exit0**。同じ frozen source の Web full は **7,791 tests / 7,234 pass / 17 fail / 540 skip、exit1**。直前の可比 run は **7,790 / 7,232 pass / 17 fail / 541 skip** で、失敗名 17 件は同じ（manifest 1、contact merge 1、fixture import 1、R16 PG 3、R12 card 2、Web network-screen 8、button ratchet 1）。新規 failure name は 0、新規 skip は 0。ただし全量は赤のまま、SC-11 の device mirror・E 線 UI／結合は依然 OPEN。隔離 D test DB の残留 test schema は 0。

独立 review で初回版 `8dedf1fab` の `limit 1` が二つの active goal を見落とすと判明。二つ目の plan に結んだ task を保ったまま、その plan だけ失効させる実 PostgreSQL 回帰は **304 対期待 200** で RED。全 active plan と plan/type の組を順序固定で集計する一行 SQL に直して **8/8 pass、skip 0**。新テストは両 task ID が残り、失効した一方の link のみ隠れることも検査する。修正後の Web `typecheck` / `typecheck:app` と `git diff --check` は exit0。上記 7,791 件の full は初回版 source の結果であり、review 修正版の独立 full は **7,792 tests / 7,235 pass / 17 fail / 540 skip、exit1**。17 件の失敗名は初回版と同じで、新規 failure name は 0；全量 green ではない。D test DB の残留 test schema は 0。

次の SC-11 device mirror 閉項を実 PostgreSQL で追跡した。active v2 plan に task を結び、device `tasks` domain の初回 page に `planLink` があることを確認してから、task record を触らず plan を archived にする新しいテストは、次の manifest の task watermark / generation がどちらも変わらず **期待した失効通知に対して RED**。`features/sync/domain-read-service.ts` の task watermark / page は `orbit_records.tasks.sync_revision` だけを読み、`app/api/sync/domain-handlers.ts` の 304 鍵も actor の `orbit_records` と別の event/message summary のみ；App coordinator は同じ watermark + generation の manifest を unchanged と扱う。仮に再 page しても `read-service.ts::mapTaskPayload` は raw task の `planLink` をそのまま送る。したがって Web `GET /api/tasks` の前段修正だけでは端末の失効 link は消えない。新テストは共有 sync protocol と plan state の連結が D §1 の許可領域外であるため理由付き **SKIP** に戻し、同 file **3 pass / 1 skip**；SKIP は合格ではない。

主会話への具体的な設計／帰属要求：plan status・network-need type membership の actor-scoped fingerprint を task-domain manifest の条件付き ETag と generation に入れて既存 cursor を reset/rebootstrap し、task page の `planLink` は同じ有効性で投影時に隠す、という read-side 方案を推奨する。代案の plan 書込み時に全 linked task を revision 更新する方式は plan mutation の全経路、sync commit-order lock、raw link 保持規則を同時に変えるので別審査が必要。いずれも `domain-read-service.ts`、`domain-handlers.ts`、`read-service.ts` または計画書込み側へ越線する；承認・owner 指定なしに本線で実装しない。要 actor B 隔離、二つの active goal、archive / achieved / type delete、manifest 304 / cursor reset、App mirror 再読までの RED→GREEN。

## SC-10 前提の読取検査

本機 `orbit_line_d` では `ai_usage_ledger` / `ai_usage_calls` の両表が存在する（読取専用 `to_regclass`）。現在の shell には provider key が存在するが、D worktree に `.env.local` はなく、shell の `ORBIT_DATABASE_TARGET` と全候補 DB URL (`ORBIT_LOCAL_DATABASE_URL` / `ORBIT_EVENT_DATABASE_URL` / `ORBIT_LIVE_DATABASE_URL` / `ORBIT_DATABASE_URL`) は未設定。従って現状の shell をそのまま使った `createConfiguredAiQuotaGate` は live 接続を確立しない；C11 の提議成功とは数えない。実 AI 呼出しは 0 件、秘密値は読出し／記録していない。後続の C11 検証は明示的な loopback local target と隔離 schema、利用記録を付けて行う。

新しい notes API の後処理は既存の memo-extraction job を呼ぶが、既存 W0048a 補掃 SQL は旧 `contact_detail_states` の memo のみを走査する。新 notes の enqueue 失敗／disabled 後の自動補掃は未配線であり、SC-10 の閉項条件に数えない。C11 の手動提議／確定／計分も未確認。

新 `onPersisted` の enqueue 例外ログはエラー名のみだが、委譲先の既存 `features/contacts/memo-extraction/{store,job}.ts` は `error.message` を最大 200 字出す経路がある。provider 等の任意エラー文に本文が含まれないことは証明できず、SC-10 の「ログに本文なし」全経路合格とも言わない。この両ファイルは R20b §1 の notes allowlist 外なので、所有者への修正依頼として残す。

2026-10-19 主会話 RD-33 代定：新 notes の補掃は D 線の筆記領域として担当し、旧 `contact_detail_states` 候補を残して追加する。本機の隔離 PostgreSQL で actor / contact scope、`usedForPlan`、本文変更、disabled／deferred 再試行、既存の一回限りの provider 呼出しを検査する。例外ログは本文・連絡先属性・任意 `error.message` など PII を記録しない。これは担当決定であって実装・検証済みという意味ではない。

既存 `tests/capabilities/memo-extraction-job.test.ts` の軽量単体回帰は **9/9 pass**（2026-10-18、mock provider / gate）。disabled 時の provider 0 回と同一 job の重複抑止は確認したが、R20b の保存後 handoff から実 C11 提議・確認・計分までの本機 end-to-end は含まない。

## 未完と次の検証

両端の typecheck と Web `typecheck:app` / lint は各記録時点では exit0、画板 preflight runner も両端 exit0 だが七板の五項目確認は未通過。上記の full はすべて記載した source 時点の赤い結果で、現 HEAD の green を意味しない。一般 task list の plan-aware ETag は actor scope と一行 304 を保って修正済みだが、端末側の計画失効 mirror と E 線 UI 連動は OPEN。2026-10-19 の RD-33 により、offline contact create / ID alias は B 線後続 DEFERRED、R20b はオンライン作成済み連絡先を参照する offline note に絞る。C11 補掃・PII 不記録は D 線の部分実装と上記の局所回帰まで完了したが、保存から計画提議・確認後の計分、端末読回までは未検証。R20a の残項、b5 の AI・録音改稿、Web #19 右欄の操作出典と七板 preflight はなお UI／pixel 門禁を閉じない。cross-client readback と E 線 UI 相互検証も未実施。変更したファイル以外の D 線 Task source / tests は他作業として保持し、この REPORT の成果に数えない。

## 2026-10-20 R20b run-02 收口核对（覆盖上文旧快照的“未实装／未读回”叙述）

范围是 `line-d`、本 worktree 与隔离本机 `orbit_line_d` 的合成账号／workspace。开工按要求 `git pull --rebase origin redesign`；本轮产品提交为 `2994e9038`（Web Memo）、`9b202c0d2`（App 四屏）、`9343807be`（手入力接线）、`16a57f868`（失效对象只读）、`847327ccf`（Web token／关联／旧 URL）、`0c093f4e7`（App 分类卡）、`df89e77f8`（Web 标题按钮／详情卡）、`bfa580172`（Web token／可访问名）；画板预检记录为 `9a032983c`。均按 D 线确切路径和 `Co-Authored-By: Codex <noreply@openai.com>` 提交，未 push。随后 clean worktree 上再次 `git pull --rebase origin redesign` 为 up to date。未跟踪的 `HANDOFF-CLAUDE-2026-10-19.md` 是预存文件，未修改、未纳入提交。

### SC-01～16 对照

| SC | 本轮已取得的证据 | 当前结论／具体缺项 |
| --- | --- | --- |
| 01 开工／预检 | R20a 已在基线；隔离 Web 3500、Metro 8085、模拟器与本机 actor；七板 token 和数据来源写入 `preflight-checklist.md`。 | **未通过**五项预检：b5 AI／录音板未改，Web #19 右栏动作无来源，App 数量与可见卡 fixture 不一致。 |
| 02 契约／离线 RED | 上文 BREAKING、共享／App schema 副本、旧 token 和 event 分支、strict outbox RED→GREEN。 | D 数据契约局部完成；跨端真实 `@イベント` 操作仍列 05／08。 |
| 03 持久化／镜像 | 上文 notes HTTP／PG、同步注册表、actor 隔离与 App 镜像回归；本轮 App→Web→App、Web→App→Web 对同 actor 真实笔记各完成一次创建、编辑和版本读回。 | 本轮双向主体读写通过；活动 token 的真实设备读回仍缺已报名活动 fixture。 |
| 04 App 列表／详情 | 新四屏接到 Task › メモ；三类、搜索／分页、详情和有效对象跳转的渲染回归；App 列表／交互定向 **41/41**，typecheck exit0；模拟器实际进入列表和详情。 | 功能局部通过；A01 像素失败，滚动保持／全部画板操作不能据此称全过。 |
| 05 @人／@イベント | App 本机候选、UTF-16 偏移、未知 token、软删对象不可点的定向回归；模拟器输入 `@` 后可见并可选联系人；Web token 保存／重开／跳转与旧 URL 定向 **11/11**，其中已删联系人不生成链接。 | `@人` 有实际候选和双端读写；设备真实 `@イベント` 候选／保存／跨端回读未闭项，A-R12-16 需画面归属方重比。 |
| 06 历史 voice | 旧 `voice` 保持 `free` 分类、来源 chip、编辑后 kind 不变；本期新 UI 隐藏录音入口，未增加原生录音依赖。 | 数据和新 UI 局部通过；b5 #47／#48 与 #51 回放／AI 元素需主会话改稿及 DEFERRED 登记。 |
| 07 Web Memo | `?tab=memo` 列表、三类、详情、搜索、编辑、新建、旧深链、标题「＋ メモを追加」；容器／Memo 定向 **15/15**，修正后浏览器 Memo **5/5**；R07 标题和左栏浅／深区域 raw 0。 | 功能局部通过；W01 整屏三轮仍失败，R07 整屏浅／深仍失败。 |
| 08 离线 | 本机 App 对已在线保存联系人的离线新建、离线编辑：停本端 loopback API 后显示未同期，恢复后同 ID、关联、正文和 v1→v2 两次读回；Web API 不可用时标题按钮禁用回归。 | **部分**：这是 API 中断演练，未执行设备飞行模式、event token 离线实操或 409 草稿演练。RD-33 已将临时联系人 ID 依赖出队转 B 线后续。 |
| 09 手入力 | 模拟器手输入并保存合成联系人，选择「メモ」进入带已保存 `contactId` 的新 Memo；保存后联系人范围与 Task 全局指向同一记录。 | 主路径通过；失败／undo 不产生孤儿的定向回归已覆盖，实设备逐分支未重演。 |
| 10 C11 | 上文本机隔离 PG 的保存→固定 provider／quota→一张确认卡→确认后一次计分、去重和 actor 隔离；补扫与无 PII 任意错误文局部回归。 | **未闭项**：没有配置真实本机 provider＋quota ledger 的成功调用，也无确认卡设备读回；未调用 E3。不得将固定 provider 计作真实 AI 账本验证。 |
| 11 planLink | 上文 POST/PATCH、actor/type 校验、失效隐藏、一般 list plan-aware ETag、隔离 PG 回归。 | **未闭项**：device task-domain manifest／page 对计划失效不增版，已证实 RED 并理由化 SKIP；E 线「プランに追加」和类型详情联验未到。 |
| 12 旧屏删除 | 四个旧实现已删，四 route 保留兼容着陆；`notes-source*` 保留，允许清单／路由和离线目录按新屏更新，旧 scoped URL 回归。 | D 实现及局部回归完成；主会话独立复核仍待。 |
| 13 App 像素 | A01 两轮 raw 0.1181／0.1241；A02 两轮 0.0838／0.0843，第三张取到候选出现前旧截图的“PASS”无效；A03 0.6684，A05 0.1351，A06 0.0792，A07 0.1105。实际 `@` 候选另有截图。 | **未过**：board 状态／真实数据不一致，AI／录音改稿未到；不扩大三轮上限。App 深色无板。 |
| 14 Web 像素 | W01 三轮 raw 0.0907→0.0805→0.0772，末轮仍缺 32 块；R07 Memo 标题／左栏浅深区域 raw 0 通过，整屏浅／深 0.0627／0.0587 失败；1024／390 无横向溢出截图。 | **未过**；Web #19 右栏按钮和状态来源待主会话定，1024／390／深色无板只作交接截图。 |
| 15 全量／跨端 | 两端真实同 actor 双向创建／编辑／重开，联系人的离线同步见下；Web normal tsc、app tsc、lint 与 App tsc 均 exit0。 | 全量 Web **33 fail**、App **14 fail**，copy QA 仍红；详见下。不能标零新增失败或 Sprint done。 |
| 16 REPORT／复核 | 本节逐项登记结果、原始证据、越线请求和决定；`c823cceaf` 的 sync read-service／App tasks-mirror 越出原 §1 清单，归属与批准见下方 RD-25 更正。 | 本 REPORT 可提交；主会话独立 REVIEW、已通过图至少 20% 重比、汇总文档和 DEFERRED 更新仍待。 |

### 收口测试、逐名基线与来源

- Web full 在 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 下通过 D 线 `heavy.sh` 仅运行一次：**7,862 total / 6,788 pass / 33 fail / 1,041 skip，exit1**。原始 `/Users/xzhao/orbit-sprint-evidence/redesign/R20b/run-02/web-full-final.log`；与本 Sprint 上游 39 fail 基线的逐名集合见同目录 `web-full-failure-comparison.json`：30 retained、9 gone、3 new。三个新名分别为 `visible controls have static accessible-name evidence`、`no product file declares or reads an old CSS variable name`、`orbit-2026 CSS Modules use only design tokens for colour, stacking, radius and type size`，均定位 D 的 Memo 新 UI；`bfa580172` 修复后对应定向 accessibility **97 pass / 4 既有 skip / 0 fail**、token **6/6**、Memo 浏览器 **5/5**，但遵守“收口全量一次”，**未以第二次 full 证明 33 个旧失败以外零新增**。
- App full 同样在 locale 与 D `heavy.sh` 下限并发 4 一次：**3,272 total / 3,256 pass / 14 fail / 2 skip，exit1**。原始同目录 `app-full-final.log`；与 13 fail 可比基线的逐名集合 `app-full-failure-comparison.json`：10 retained、3 gone、4 new。新名为 R13 discovery toggle、R13 typed inbox selected tab、旧 split 字典 snapshot 的新命名断言、Toast undo；前两项隔离复现，Toast 隔离通过，字典是同一旧 key-count 风险的换名断言。D 本轮未改这些模块，但不能从归属推断 full 通过，需各 owner 复核。
- Web `typecheck`、`typecheck:app`、`lint` 与 App `typecheck` 均在本轮最终产品改动后 **exit0**。Web `copy:qa --web` 为 **3,998 entries / 29 issues、exit1**，Memo issue **0**；全域 copy QA **7,507 entries / 245 issues、exit1**。App notes copy QA **146 entries / 162 issues、exit1**，新增的 11 个 kind 元数据项归 `src/i18n/copy-kinds.ts`，超 D allowlist；不能写成 copy gate 通过。
- Web 独立画面证据位于同目录 `pixel-web-w01-r1`／`r2`／`r3`、`pixel-web-r07-memo-3500`；App 位于 `pixel-app-a01-r1`／`r2`、`pixel-app-a02-*`、`pixel-app-a03-*`、`pixel-app-a05-*`／`a06-*`／`a07-*`。Web 1024／390／1440 dark 原图同目录 `web-memo-{1024-light,390-light,1440-dark}.png`。具体预检阻断与非有效第三张 A02 已写 `preflight-checklist.md`；无归因充分的超阈值图被伪作通过。

### 实际读回、活动 fixture 的边界

`/Users/xzhao/orbit-sprint-evidence/redesign/R20b/run-02/cross-end-local.json` 记录同一合成 actor 的 App 建 `note:2e6648b4b5446a0df43b5a74` v1→Web UI 编辑 v2→App 重开 v2，以及 Web UI 建 `note:620fcfe3e659a58b6d4f0184` v1→App 编辑 v2→Web UI 重开 v2。手入力后的新笔记在联系人独立列表 **1/1** 与 Task 全局列表 **9/9** 是同一 ID。App 对已存在线联系人离线建新 Memo 并在线重开 v1，再离线改正文且恢复后在线重开 v2，联系人关联保持；此处通过停／启**本端**本机 API 模拟中断，未接触生产或外部账号。

为核对 App 的 `@イベント` 本机条件，读取了新屏的数据源：它只从设备 `registered_event` 镜像形成候选，而非任意个人日程。隔离 actor 的活动创建 `POST /api/events` 为 **201**，同 ID 详情 GET 为 **200**，但 `GET /api/events/{id}/registration?questions=false` 与报名 POST 均为 **404 NOT_FOUND**（`registered-event-check.log`、`seed-registered-event.mjs`，同目录）。因此本机没有可按正常 API 报名并进入该镜像的活动，不把单元 fixture 或未报名的私人活动冒充设备真实候选；需 Event owner 提供可报名的隔离 fixture／建置步骤后再走 App 输入→Web 读回→编辑→App 重开。合成活动仅留在本机隔离 workspace。

### 交接、待主会话决定与停点

| 对象／归属 | 交接内容与验收范围 |
| --- | --- |
| 主会话／画板 owner | 按 RD-33 重绘 b5 #46/#49/#50/#51 的 AI／录音／回放片段，保留可验的手写内容；明确 Web #19 右栏 `お礼の下書きを作る`、To-do、下一步按钮的可达服务、状态与错误回执。七板五项预检未过，W01 已到三轮上限；新画板版本需重新定 fixture 与门禁。A-R20b-02 的录音文案也需改。 |
| B／Event owner | RD-33 的离线新建联系人 temporary ID alias／依赖 note 出队移入 DEFERRED；提供可报名且可进 `registered_event` 镜像的隔离活动 fixture，复走 SC-05／08 的 `@イベント` 实设备链。A-R12-16 的 token 状态交 R11a 画面归属方重比。 |
| C11／R24／E 线 | 为 SC-10 配置**隔离本机** provider＋quota ledger 并取得确认卡设备读回；D 已有固定 provider 单本机链和无 PII 补扫回归。RD-25 已批准 D 补 SC-11 的 task-domain 失效同步；E 线类型详情与「プランに追加」仍需用 D 的 `{planId,typeItemId}` 契约联验。 |
| A／R13 与 copy owner | 核对 App full 新的 discovery、typed inbox、Toast 时序和字典 snapshot；`src/i18n/copy-kinds.ts` 中 notes kind 元数据、全域 copy QA 的既有 issue 由归属方处理。Web full 保留的 30 名及 App 10 名也仍是红色基线，不得从 D 的定向绿推为全量绿。 |
| 主会话文档／独立复核 | 把 #47 录音、#48 E3、面談の記録合并判定与临时联系人 ID 写 DEFERRED-A；注明 W-R20b-02 废稿。更新 README/HANDOFF/决定表时记本端版本 `2994e9038`、`9b202c0d2`、`df89e77f8`、`bfa580172`、双向本机读回和未过门禁；独立重跑测试、SC-10/11 联验及至少 20% 已过图。D 不越权改根台账。 |

本轮没有新的产品代定；执行的是 PLANNER D-1～D-11、RD-33 和既有 R20a 基线，原 §1 外的 sync 触碰按下述 RD-25 批准单独记账。需主会话决定的是**新画板的数据／操作来源和对应版本的重新门禁**，以及跨线 C11／Event fixture 的归属排期。没有用户级发布授权需求；未 push、未部署、未连 Neon／生产。已停止自己启动的 Next 3500、设计服务 3320、Metro 8085，关闭自己的 `Orbit Line D` 模拟器；Next 自动生成的 `next-env.d.ts`／`tsconfig.json` 仅按自己产生的差异恢复。

### RD-25 M5 归属与批准更正

REVIEW 指出的 `c823cceaf` 确实改动了 PLANNER §1 原清单外的 `repos/orbits/features/sync/read-service.ts` 和 `repos/orbit-app/src/view-models/tasks-mirror.ts`。上表旧版“所有实现均在 §1 内”的说法错误，不能用路径提交或定向测试替代所有权批准。主会话在本轮 RD-25 指令中明确追认这两处是 `planLink` 同步所需，并批准 D 线为 M1 在 sync read-service 做加法修复。`504ad51e8` 因 task 域的实际读路径，同项还新增 actor-scoped 计划快照，并加法接入 `domain-read-service.ts` 的 generation／page 及 `domain-handlers.ts` 的条件 manifest 键；旧 v1 投影在未提供计划快照时维持原行为。此处记录批准依据和越出原 §1 的范围，不把旧记录改写成“原本就属于 D allowlist”。E 线 UI 联验及独立复核仍未完成。

## 2026-10-20 RD-25 复核修复与最终树全量

本轮开工先 `git pull --rebase origin redesign`，从 `ca990b5e6` 快进至 `2fc2e9dce`（REVIEW 文档）；本轮未改动预存未跟踪的 `HANDOFF-CLAUDE-2026-10-19.md`。RD-25 每项独立按路径提交，提交均带 `Co-Authored-By: Codex <noreply@openai.com>`，未 push。

| 项 | 提交、RED→GREEN 与实现边界 |
| --- | --- |
| M1 设备失效链接 | `504ad51e8`。隔离本机 PostgreSQL 原回归从 SKIP 放开后先因 plan-only 归档不改变 task watermark/generation **RED**；加 actor-scoped active v2 plan/type 快照，task generation 与 manifest ETag 随它变化，旧 cursor 返回 `SYNC_RESET_REQUIRED`，新 page 保留 task 并隐藏 raw 失效 `planLink`。旧 v1 read-service 的无快照调用仍原样投影。plan-link PostgreSQL **4/4**，相邻 sync route／拓扑共 **21/21**、skip0；归档不改 task 记录，actor B 的快照不变。App coordinator 的既有 409 reset 分支会重建该域；没有宣称真实设备归档后的 UI 已实测。 |
| M2 补扫日志 | `d30bc0957`。enqueue 失败由 actor/contact/note ID 与错误名改为固定 `stage=enqueue_failed`、`code=ENQUEUE_FAILED`；ID、正文、任意错误文不进入这条日志。notes service **17/17**。旧 `contacts/memo-extraction` 其它日志路径不由此证明。 |
| M3 Web 可达性 | `8514799f8`。Memo「＋」在 `navigator.onLine=true` 但 notes API 返回 503 时禁用，并在进入页、聚焦、恢复联网和间隔探测后更新；点击前再校验以防陈旧状态。浏览器容器回归 **10/10**。 |
| M4 宽进坏行 | `33e02650f`。Memo 每行验证 mention 对象、范围、所属 ID 与非重叠；混合页只跳坏 note 并保留服务端总数。定向 **7/7**。 |
| M5 归属 | `ca5c83684`，更正上文 SC-16 的越线自查和 C11／E 交接，记录主会话对 `c823cceaf` 及 M1 sync read-side 的追认和限定批准。 |
| m 旧链接 | `06a09fa09`。SSR 实际执行四个兼容 route 与新屏着陆，覆盖 `/notes`、带 `contactId` 的范围列表、新建、详情和编辑；**1/1**。 |

最终产品树上 Web `npm run typecheck`、`npm run typecheck:app`、App `npm run typecheck` 均 **exit0**。两端全量各仅执行一次，均设置 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`，通过 D 线 `heavy.sh`；全量不接生产或 Neon，也没有调用付费 AI。开工可比基线是本次 REVIEW 修复前的 `run-02/{web,app}-full-final.log`，而非更早 R20a／R20b 编制快照。

| 端 | 开工失败名 | 最终 total / pass / fail / skip | 同名保留 | 消失 | 新增 | 结果 |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Web | 33 | 7,864 / 6,793 / 30 / 1,041 | 30 | 3 | **0** | exit1，仍红 |
| App | 14 | 3,272 / 3,257 / 13 / 2 | 13 | 1 | **0** | exit1，仍红 |

原始日志：`/Users/xzhao/orbit-sprint-evidence/redesign/R20b/run-02/web-full-rd25.log`、`app-full-rd25.log`。逐名机器可读对照：同目录 `web-full-rd25-comparison.json`、`app-full-rd25-comparison.json`；每份列出 `retained`、`gone`、`new` 的完整名字，且 `currentCount` 分别与原始 fail 30／13 一致。Web 消失的三名是上轮 D Memo 的旧 CSS 变量、CSS token、静态可访问名；App 消失的是 Toast undo。所有其他失败名均逐名保留，没有本线新增失败名；下表保留完整名字以便主会话不依赖失败总数复核。

### RD-25 SC／跨端交接与剩余门禁

M1 使 SC-11 的**服务端设备同步协议**从 RED／SKIP 转为隔离 PG GREEN：manifest 的条件 304 失效、cursor 重建和 page 投影同用 actor-scoped 计划状态。E 线人物类型详情／「プランに追加」仍未与真实 App 设备读回联验，SC-11 **未闭项**。M2–M4 和 m 的指定复核点已修复并定向验证；SC-10 的真实 provider＋quota 账本、SC-05／08 的真实可报名活动 token、SC-13／14 的七板 preflight 与整屏 pixel 仍按上文记录为未通过。SC-15 两端全量 exit1；**零新增失败名不等于全量通过**。copy QA 本轮未重跑，沿用上文 245 个既有全域 issue 的红色记录，不声称本轮通过。

Bridge 交接：Web sync/API 版本 `504ad51e8`，App 旧 URL 测试版本 `06a09fa09`，Web Memo 可达性版本 `8514799f8`。App 的 task mirror 消费 task generation 改变后应按既有 `SYNC_RESET_REQUIRED` 路径清除旧域并拉取同 task ID 的无链接投影；本机 PostgreSQL 验证了协议响应，没有真实 App 设备完成计划归档后的 UI 截图。另一端需联验 E 线读写与 UI，不以类型检查替代业务对齐。主会话仍需提供活动 fixture、C11 本机 provider／ledger 前提和改稿后画板，并更新根 README／HANDOFF／DEFERRED 与决定表；D 本轮只写本 REPORT。没有新产品代定；未启动 dev server、Metro 或模拟器，不涉及停服，3000 端口未触碰。

### 最终全量失败逐名对照

| 端 | 与开工基线 | 测试名 |
| --- | --- | --- |
| Web | 保留 | /app/events/[id] does not render the retired deterministic registration guide |
| Web | 保留 | /app/register redirects a reviewed code without propagating fixture controls |
| Web | 保留 | /app/register resolves invite codes before redirecting to the canonical registration workspace |
| Web | 保留 | /app/register uses first-value decoders and explicitly clears an inherited fragment |
| Web | 保留 | Postgres dispatch scan recovers unpublished work with exact scope, due-time and approval fences |
| Web | 保留 | Postgres workers recover a killed claimant without replaying a persisted receipt |
| Web | 保留 | R12 review m9: when the duplicate lookup fails nothing is added automatically — every readable card waits in まとめて確認 |
| Web | 保留 | activation serialization and deadlock SQLSTATEs rebuild the whole reviewed plan on a fresh transaction |
| Web | 保留 | app register page fails closed for an unknown public code without retrying the same route |
| Web | 保留 | app register route loader resolves only a reviewed public event code |
| Web | 保留 | e2e: upload 4 cards (one front + back) → read → auto into 人脈 → まとめて確認 → 完成 numbers match the network |
| Web | 保留 | event access directory is event-scoped, shows only active assignments, and lets only the Event Core owner list current roles |
| Web | 保留 | event access readiness rejects migration evidence and role tables resolved from different schemas |
| Web | 保留 | event access repository enforces owner authority, workspace isolation, transitions, CAS, and atomic audit |
| Web | 保留 | global canonical apply atomically migrates a diverse workspace and replays the immutable ledger |
| Web | 保留 | global canonical apply rolls back ledger and every event when a later activation fails |
| Web | 保留 | heartbeat commits between a terminal transaction snapshot and complete/fail without serialization failures |
| Web | 保留 | isolated v11 canonical membership CLI is read-only and apply fails not-ready |
| Web | 保留 | legacy register route does not load an unused profile form before redirecting |
| Web | 保留 | main event access schema is cut over and missing-event reads stay non-mutating |
| Web | 保留 | manifest generation writes the required repository artifacts |
| Web | 保留 | merging fills empty fields, keeps existing values and appends the rest to notes |
| Web | 保留 | only the dev route imports the design fixtures |
| Web | 保留 | queued delivery survives future retries and a crashed lease, then stops at the durable attempt limit |
| Web | 保留 | readiness rejects migration and ledger relations resolved from different schemas |
| Web | 保留 | real canonical membership CLI reviews, rejects drift, applies, and replays a diverse PostgreSQL workspace |
| Web | 保留 | registered catalogue attendee access follows persisted registration lifecycle |
| Web | 保留 | replay rejects an internally inconsistent event ledger before reading manifest or source |
| Web | 保留 | the event access ledger is constrained, monotonic, immutable, and leaves the configured schema unchanged |
| Web | 保留 | the web runtime migration CLI initializes an empty database and preserves data on rerun |
| Web | 消失 | no product file declares or reads an old CSS variable name |
| Web | 消失 | orbit-2026 CSS Modules use only design tokens for colour, stacking, radius and type size |
| Web | 消失 | visible controls have static accessible-name evidence |
| App | 保留 | R12 review m7: leaving the camera page while photos go up does not drop the batch — it is uploaded and read |
| App | 保留 | R12 review m9: when the duplicate lookup fails nothing is added automatically |
| App | 保留 | S1 これまでのコード: 「同じ人かも」 under a joined person — 統合する merges (the name then opens the existing contact), 別の人 dismisses |
| App | 保留 | W0015: cards with an event candidate wait in そのまま追加; the batch's 会った場所 goes with their confirmation |
| App | 保留 | camera permission: explained before asking; turned off → three steps, 設定を開く, 写真から選ぶ, and back from Settings opens the camera |
| App | 保留 | camera: [表面][裏面], a back pairs with the last front, 裏なし, the counter and the tray; 完了 uploads and opens the batch |
| App | 保留 | discovery toggles are persisted independently and a late old-account receipt cannot overwrite the new account |
| App | 保留 | the original split key set retains its current approved copy snapshot |
| App | 保留 | typed inbox filter tabs expose which one is selected |
| App | 保留 | 付けない: no 会った場所 is written; 要確認 opens the fields; a pending batch says when plan candidates appear |
| App | 保留 | 衔接 確認せずに N人を追加: never merges a 重複 unseen; a card it could not add says why in まとめて確認 |
| App | 保留 | 読み取り中 → 自動で人脈へ → まとめて確認 → 完成: 4 cards (identical, similar, unreadable, clean front+back) |
| App | 保留 | 読み取れず: 手入力で補う pre-fills what was read and confirms through manual-entry; 撮り直す replaces the photo |
| App | 消失 | 元に戻す runs the undo once and closes the toast; a new toast replaces the old one |
