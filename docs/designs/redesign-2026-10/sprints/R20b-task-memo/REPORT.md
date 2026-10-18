# R20b — 実装記録（進行中）

2026-10-18、D 線 `line-d`、run-01。主会話指定の R20a「除像素外」失敗帰属チェックポイントを受け、同じ隔離 worktree で R20b の独立した契約・画板調査から着手した。R20a 自体は未完了であり、Task 容器／旧画面削除／native／pixel はこの時点で R20b の合格根拠にしない。`origin/redesign` への push や rebase は行わない（統合後に rebase する主会話指定）。

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

## SC-11 データ鎖（部分実装）

- Task DTO / record decoder / service / HTTP POST・PATCH に任意の `{planId,typeItemId}` と PATCH `null` 解除を追加した。サーバー側は actor の生効 v2 plan に実在する type item を参照する場合のみ書き込みを受ける；偽 ID は 400。Task GET / list は後に計画が失効したリンクを隠し、task 自体は残す。`GET /api/tasks?planId=…&typeItemId=…` は同じ actor/type の task だけ返し、計画状態が task-record ETag に含まれないためこの絞込だけ条件付き 304 を使わない。
- TDD の service **0/2 → 2/2**、HTTP **1/2 → 2/2**、隣接 task service / route を含む **22/22** を確認。実 v2 memory repository の actor scope / archived / achieved / 偽 type item の検査は **1/1**。`mapTaskPayload` が registry の `planLink` を落としていた本機 PostgreSQL mirror test は **7/8 → 8/8**、actor B には A の task が来ない。App offline task overlay の局所 create は link を落としていたため **5/6 → 6/6** に修正し、PATCH null も確認した。
- 追加の loopback PostgreSQL テスト **1/1** は同じ隔離 schema の本物の v2 plan/type と task を作り、actor B の偽リンク拒否、archive 後の GET / 絞込から link を隠し task 本体を残すことを確認した。一般 task list の条件付き ETag と device 増分 mirror は plan の失効だけでは更新されない。type 絞込 HTTP は毎回再検証するが、端末側の失効リンク清掃と E 線 UI の連動は未完。ゆえに SC-11 は閉じない。

## SC-10 前提の読取検査

本機 `orbit_line_d` では `ai_usage_ledger` / `ai_usage_calls` の両表が存在する（読取専用 `to_regclass`）。現在の shell には provider key が存在するが、D worktree に `.env.local` はなく、shell の `ORBIT_DATABASE_TARGET` と全候補 DB URL (`ORBIT_LOCAL_DATABASE_URL` / `ORBIT_EVENT_DATABASE_URL` / `ORBIT_LIVE_DATABASE_URL` / `ORBIT_DATABASE_URL`) は未設定。従って現状の shell をそのまま使った `createConfiguredAiQuotaGate` は live 接続を確立しない；C11 の提議成功とは数えない。実 AI 呼出しは 0 件、秘密値は読出し／記録していない。後続の C11 検証は明示的な loopback local target と隔離 schema、利用記録を付けて行う。

新しい notes API の後処理は既存の memo-extraction job を呼ぶが、既存 W0048a 補掃 SQL は旧 `contact_detail_states` の memo のみを走査する。新 notes の enqueue 失敗／disabled 後の自動補掃は未配線であり、SC-10 の閉項条件に数えない。C11 の手動提議／確定／計分も未確認。

## 未完と次の検証

両端の fresh typecheck と画板 preflight を待ち、型エラーがあれば R20b 自身のものを修正する。R20a の未完 container / native / pixel に依存しない notes service・outbox の RED→GREEN を先行する。変更したファイル以外の D 線進行中の Task source／tests は他作業として保持し、この REPORT の成果に数えない。全量 suite・旧四画面・Web 新頁・cross-client readback・C11・SC-11 の失効 mirror と E 線相互検証は未検証／未実装。
