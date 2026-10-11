# Sprint R12 — 加人：入口、名刺スキャン、手入力

**Plan revision:** 2（按 `add-and-invite/REVIEW.md` 修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** 「人脈を追加」入口（两端都是页面，另导出 `AddContactSheet` / `AddContactDoors` 组件给 R11）、名刺拍 / 传（含表 / 裏）→ 后台读取 → 按共享规则 `card-auto-import.ts` 自动进人脈 → まとめて確認 → 完成（两端同一状态与文案）、手入力（新接口 `/api/contacts/manual`：查重与名片同一规则 + 同名提示、逐字段统合（新写入函数 `applyContactFieldValues`）、5 秒撤销、入队计划候补）、待确认草稿页 `contacts/new/drafts`；`shared/compute` 的 `contact-density` / `card-auto-import` / `contact-name-match` / `signature-split`；删除 App 7 个旧加人屏与 Web 旧导入页的名片部分，旧链接翻译。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)（§2.1–2.3、§2.9、§3.1、§3.4、§4.1、§5、§7、§8、§9 #2–#14 #25 #29 #37、§10 #3 #5 #6、§13、§14）。
**基线:** 开工时 `redesign` HEAD。已记录：orbits 7041 条 / 0 失败（连本机库 `orbit_test`，跳过 517）；App 4257 条 / 1 失败（`route-parity`：`/agent/plan`、`/agent/strategy` 两条例外已无对应 Web 页，R25 留下）。
**进入条件:** DESIGN 已复核（`add-and-invite/REVIEW.md` 处理记录完成）。不依赖其他功能 Sprint。
**分支:** 一人做，直接在 `redesign` 上提交（RD-25）。

## 已查清的事实（按 `5e1c385f`）

1. **App 旧屏**：8 个路由都是 `withOrbitPrivateRoute(withOnlineOnlyRoute(屏))`。`contacts/new` → `ContactAcquisitionScreen.tsx`（2446 行：三条入口 + QR / 外部 / 引荐 / 草稿队列 / 重复合并）；`scan` → `BusinessCardScanScreen`（单张，调 `/api/contact-drafts/business-card/scan` → `/api/contacts/business-card/confirm`）；`batch/[id]` → `BusinessCardBatchScreen`（v1）；`batch2/index`、`batch2/[id]` → `BusinessCardIngestStartScreen` / `BusinessCardIngestScreen`（v2）；`import/[id]` → `BusinessCardImportScreen`（v1 名片文件导入）；`manual` → `ManualContactAddScreen`（草稿 → 确认）。
2. **入口**：人脈 `ContactsScreen.tsx:1322,1573,1576,2075,2085,2091`（R11）、首页 `HomeDashboardScreen.tsx:52`（R10）、`AiScreen.tsx:867`（R21）指向 `/contacts/new` 与 `/contacts/new/scan`；引导 `ProfileOnboardingScreen.tsx:335`（R28）指向 `/contacts/new/batch2`；`events.ts:253,1473` `reviewQueueHref: "/contacts/new"`；`app-navigation.ts:65` 父级「导入中心」；`initial-route.ts:75,140,194-208` 深链。
3. **v2 管线**：`/api/contact-drafts/business-card/batches/v2/**`（建批次、上传、finalize、duplicates、items confirm / manual-entry / skip / retry / replace / exclude / image）；`INGEST_V2_MAX_ITEMS = 100`；`repository.confirmCard`（`ingest-v2/repository.ts:1298`，单事务：有 `mergeIntoContactId` 合并，否则 `findContactCandidate`，完全相同自动统合、相似抛 `DuplicateReviewSignal`）；`confirmCard` 自己开事务并锁批次行，不接受外部事务；确认后的副作用 `markAttended`、`markInsightsDirty`、`scheduleCardInsights`（`insight` 用途）在处理函数 `createConfirmLikeHandler`（`batches/v2/handlers.ts:917-935`）里，不在 `confirmCard` 里；契约 `IngestCardSide = front | back` 与 `card_id` 支持表 / 裏（App 旧 `BusinessCardIngestStartScreen.tsx:166-193` 能补拍反面）；`plan_match_jobs` 在批次转 completed 时入队（`repository.ts:446`）。契约有 `merged / metEventId / candidate`（2026-10-11 `0ef1c273` 修过 schema 漂移）。worker 本地要 `npm run ingest-v2:worker`。
4. **Web**：`/app/contacts/new/page.tsx` 渲染 `NetworkImport`（名片走 `card-batch-0918` 的 `useCardBatch`，CSV / vCard / 活动走 `/api/contacts/import`）；`CardBatchHost` 挂在 `app/(app)/app/layout.tsx:16,50`，在 `/app/contacts/new` 等前缀让路（`CARD_BATCH_HOST_YIELD_PREFIXES`）。`useCardBatch` 调用方：network-import、card-batch-host、`start/start-guide.tsx`、`onboarding-0918/onboarding-flow.tsx`、`iorbit-0918/use-pending-cards.ts`。
5. **手动**：`/api/contact-drafts/manual` → `createLiveManualContactCreationService`（HIGH 14），查重 `duplicateManualContact` 只比姓名 + 公司；R24 的「线下聊过」在用，**不动**。
6. **联系人存储**：`orbit_records` 集合 `contacts`，底层 `BusinessCardContactWriteProvider.saveContact`（`contact-write-contract.ts:140`）；查重 / 统合 `business-card-contact-match.ts`（`findContactCandidate` :96 HIGH、`mergeCardIntoContact` :199 HIGH）。
7. **允许清单**：App 三份清单里 9 个相关文件（`ContactAcquisitionScreen`、`BusinessCardScanScreen`、`ManualContactAddScreen`、`BusinessCardIngestStartScreen`、`BusinessCardIngestScreen`、`BusinessCardBatchScreen`、`BusinessCardImportScreen`、`BusinessCardBatchReviewForm`、`business-card-import.ts` 与三个 view-model），Web `hardcoded-copy-legacy-allowlist.json` 的 `card-batch-0918/*`、`ingest-v2-route-view-model.ts`、`network-0918/network-import*.tsx`。
8. **收件箱**：`inbox-business-projections.ts:19-23` 名片批次通知 href 写死 `/contacts/new/{batch2|batch}/<id>`（乙的文件）。
9. **Web 已有自动导入**：`use-card-batch.ts:389-421` 在客户端对 `isAutoImportEligible` / `isAutoMergeEligible`（`card-batch-model.ts:97-120`）成立的卡逐张调确认，完全一致的并入；按 W0015 有活动归属候选的卡留给用户（`:397`）。App 没有自动导入。
10. **草稿队列在用**：活动会后「去复核联系人」→ `reviewQueueHref: "/contacts/new"`（`events.ts:253,1473`、`EventDetailScreen.tsx:1320`）；`ContactAcquisitionScreen.tsx:141,631` 接 `?eventId=` 做参加者取り込み；草稿接口 `/api/contact-drafts`、`/[id]/confirm`、`/event-attendees/import` 都是现有的。
11. **存储删除**：`deleteRecord` 是墓碑（`lifecycleState = deleted`），App 同步靠它；`updateRecordIfCurrent` 提供乐观并发（`shared/storage/live-record-store.ts:134-160`）。

## 上下文包

### 必读
- DESIGN §2.1–2.3、§3.1、§3.4、§4.1、§5、§7、§9、§13、§14；共享笔记 `add-invite-code-map.md`（A、B、C.1–C.3、C.6）。
- 设计稿：`b11-nav-v3.html` A1（①–⑤ + Web）、A3（①–④ + Web）；`b9-import-plan-v2.html` A1 衔接、A2 ④（まとめて確認组件）；`b1-onboarding-cards.html` B1（权限）、B4（读取进度）、B5（确认）、B6（重复合并）；`app.html` / `web.html` 人脈三态与「＋」sheet。
- 代码：`features/acquisition/business-card-ingest-v2/{repository,configured,contract}.ts`、`app/api/contact-drafts/business-card/batches/v2/handlers.ts`、`features/contacts/{business-card-contact-match,contact-write-contract,live-contact-write-service}.ts`、`features/plans/matching-repository.ts`（`enqueuePlanMatchJob`）、Web `contacts/card-batch-0918/*`、`contacts/ingest-v2/*`；App `src/view-models/business-card-ingest.ts`、`src/api/batch-images.ts`、`src/api/schema/business-card-batch.ts`。

### 关键符号与 impact（开工时全量重建索引后重跑）
- `getConfiguredIngestV2` **CRITICAL** 27：**不改**。
- `useCardBatch` **CRITICAL** 8：只把自动导入判定改为调用 `shared/compute/card-auto-import.ts`（`isAutoImportEligible` / `isAutoMergeEligible` 签名不变、行为不变，现有 `app-card-batch-*` 测试守住）。
- `CARD_BATCH_HOST_YIELD_PREFIXES`（常量，UNKNOWN）：`/app/contacts/new` → `/app/contacts/new/scan`；文本确认调用方，测试 `app-card-batch-host-yield` 更新期望。
- `createIngestV2DuplicateCandidatesHandler`：只读接口追加同名候选（`matchedOn: 'name'`、`identical: false`）；`confirmCard`、worker 不改。
- `findContactCandidate` HIGH：只调用；同名规则在新纯函数里。`mergeCardIntoContact` HIGH：本 Sprint 不新增调用方。
- `createLiveManualContactCreationService` HIGH：不改。
- 联系人记录读取方：开工时文本确认 `contacts` 集合的读取有没有键白名单（`exactKeys` 一类），决定 `fieldHistory` 放 payload 还是 `evidence` 集合（REPORT 写结论）。
- 计划候补的取消入口（撤销用）：`features/plans/matching-repository.ts` 里找按联系人取消待处理任务的方法，没有就只追加一个，impact 写 REPORT。
- App 8 个旧屏 UNKNOWN：文本确认（事实 1、2、7），删除时同步 `route-domain-inventory.ts`、允许清单、测试、审计脚本。
- `parentForPath`（`app-navigation.ts`，乙的热点）：不改；新路由都在 `contacts/new/**` 下，现有规则把它们带回入口页。
- `inbox-business-projections.ts`：改批次通知 href（v2 → `scan/<id>`、v1 → `scan`，按 `pipeline` 区分；乙的文件），改前跑 impact，REPORT 写明并通知。
- `events.ts` 的 `reviewQueueHref`（R26 的文件，甲）：改指 `/contacts/new/drafts`。

### 易错边界（全部写进 SC）
自动导入把相似重复 / 同名的卡也加进去了；同一张卡被自动导入两次；自动导入跳过了即时洞察 / 活动归属（必须走现有确认接口）；有活动归属候选的卡被自动导入（W0015）；两端判定规则不一致；读不出的卡被当成「已加」计进完成页；完成页数字和人脈里实际多出的人数不一致；裏面没有配到上一张表面；关掉 App 后回来批次卡在「读取中」或不再自动导入；旧链接（推送、收件箱里的 `batch2/<id>`、`batch/<id>`、Web `?job=`、`?method=scan`）打开 404；入口页挡住了 `CardBatchHost` 的续传；手入力查重规则和名片不一致；只填名字的人以后拍名片查不到；手入力统合把已有联系人的值整体覆盖（应逐字段选）或只塞进备注；撤销删掉了 10 分钟前的或被改过的联系人；撤销做成物理删除（App 同步不知道）；撤销后计划候补里还留着这个人；粘贴签名把电话识别成邮编；名字为空能保存；相机权限被拒后卡死；第一次指导在第 4 次还出现；活动的「去复核联系人」落到没有草稿的页面；招待 / その他 的入口在未上线前可见；示例模式下写操作没拦截。

## 契约（第一天提交，`contract:` 开头，App 副本同提交）

- `shared/contract/business-card-batch.ts`：`IngestContactCandidateContract.matchedOn` 加值 `'name'`。**同一个提交里先把读取端改宽**：App `src/api/schema/business-card-batch.ts` 与 Web 候选读取改用 `tolerantEnum`（未知值落到 `'name_organization'`），再加值；加回归测试「含未知 `matchedOn` 的候选不影响整条响应」。
- 新契约 `shared/contract/manual-contact.ts` + `shared/api-schema/manual-contact.ts`：`ManualContactCreateInput`（strict）、`ManualContactCreateResult`（`outcome` 宽进兜底 `'duplicate_review'`）、`ManualContactDuplicateCheckInput`（strict）/ `ManualContactDuplicateCheckResult`（候选复用 `IngestContactCandidateContract`）、`ManualContactOrganizationSuggestion`（DESIGN §4.1）。`shared/contract/index.ts` 导出；`redesign-schema-parity.check.mts` 加一组；`contract-snapshot.mjs --write`；App `sync:contract` 同提交。
- `shared/compute/contact-density.ts`、`card-auto-import.ts`、`contact-name-match.ts`、`signature-split.ts`——都过 `shared-compute-audit`。

| 接口 | 说明 |
| --- | --- |
| `POST /api/contact-drafts/business-card/batches/v2/[id]/duplicates`（扩展，只读） | 现有候选之外追加同名候选 |
| `POST /api/contacts/manual` | 手入力保存：查重（`findContactCandidate` + 同名）→ `duplicate_review`（带候选，手入力不自动统合）或 `created` / `merged`（`mergeIntoContactId` + `fieldChoices`，经 `applyContactFieldValues`）；`idempotencyKey` 重放返回第一次结果；建完入队计划候补；返回 `undoUntil`；示例模式拦截 |
| `POST /api/contacts/manual/duplicates` | 即时查重（只读，≤3 条） |
| `GET /api/contacts/manual/organizations?q=` | 公司联想（本人联系人里按前缀，≤5，带人数） |
| `POST /api/contacts/manual/[contactId]/undo` | 10 分钟内、本接口新建、未被改过 → 墓碑删除并取消计划候补；否则 409 `UNDO_EXPIRED` |
| 现有 `/api/contact-drafts`、`/api/contact-drafts/[id]/confirm`、`/api/contact-drafts/event-attendees/import` | 待确认草稿页直接用，行为不变 |

## 范围与文件

- **新建（服务端）**：`features/contacts/contact-field-write.ts`（`applyContactFieldValues`：按字段覆盖或清空、`updateRecordIfCurrent` 乐观并发、旧值进 `fieldHistory`（≤50 条）或 `evidence`）；`features/contacts/manual-contact-v2/{service,configured}.ts`（组合 `saveContact` / `findContactCandidate` / 同名规则 / `applyContactFieldValues` / `enqueuePlanMatchJob`；新建的记录带 `createdVia: 'manual_v2'`）；路由文件 4 个；`duplicates` 处理函数追加同名候选。
- **新建（Web）**：`app/(app)/app/contacts/new/page.tsx` 重写（ShellPage「人脈を追加」，`AddContactDoors`，`?add=manual` 抽屉；`?job=` / `?method=scan` redirect 到新页；`?method=csv|contacts|event` 与 `?import=` 暂时仍渲染旧 `NetworkImport`）；`app/(app)/app/contacts/new/scan/page.tsx`（拖放 + はじめての方へ，用 `useCardBatch`）；`app/(app)/app/contacts/new/scan/[batchId]/page.tsx`（读取进度 → まとめて確認 → 完成）；`orbit-2026/add/`（门卡、拖放区、读取列表、三格计数、重复对照卡、要確認分组、读不出卡、完成页、手入力抽屉、签名高亮）；`orbit-2026/copy/add.ts`。
- **新建（App）**：`app/contacts/new.tsx` 重写为页面 + `AddContactSheet` 组件（BottomSheet 包同一内容，放组件展示页）；`app/contacts/new/scan.tsx`（重写：指导 → 权限 → 相机（表 / 裏）/ 相册 → 建 v2 批次并上传，沿用 `src/api/batch-images.ts`）；`app/contacts/new/scan/[batchId].tsx`（读取 → 自动进人脈（共享规则 + 现有确认接口）→ まとめて確認 → 完成）；`app/contacts/new/manual.tsx`（重写）；`app/contacts/new/drafts.tsx`（待确认草稿，`?eventId=`）；`src/screens/add/**`；`src/i18n/{ja,zh,en}/add.ts`（新字典域，HOW-TO §6 登记）。第一次指导的计数存本机。
- **修改**：`card-batch-model.ts` 两个判定函数改调共享规则；`card-batch-host.tsx` 让位前缀；`inbox-business-projections.ts:19-23`（通知乙）；`events.ts` `reviewQueueHref`；App `initial-route.ts` 旧链接翻译（DESIGN §7）；路由登记（App 4 处、Web 审计计数与 `verify-web-route-transport.mjs` 动态路由样例）；`tests/route-parity-exceptions.ts` 删掉两条已无 Web 页的过期例外（基线那条失败；只删不加）。
- **删除（App）**：`ContactAcquisitionScreen`、`BusinessCardScanScreen`、`BusinessCardBatchScreen`、`BusinessCardIngestStartScreen`、`BusinessCardIngestScreen`、`BusinessCardImportScreen`、`ManualContactAddScreen` 及路由 `batch/[id]`、`batch2/*`、`import/[id]`；`BusinessCardBatchReviewForm`；只被它们用的 view-model / api 客户端（`contact-acquisition.ts`、`business-card-batch.ts`、`business-card-ingest.ts`、`business-card-import.ts`、`contact-add.ts` 逐个文本确认，被别处用的保留）；对应测试改写或删除（删除的测试在 REPORT 列出理由，仍在用的纯函数断言保留，R25 复核 m5 的教训）；三份允许清单删行；`route-domain-inventory.ts`、`page-offline-inventory.ts`、`scripts/audit-offline-read-surfaces.ts`、`tests/app-wide-contacts`、`app-screen-touch-targets`、`app-locale-relationships-events`、两份 `*-opening.json` 的对应行同步（DESIGN §13）。
- **删除（Web）**：`card-batch-ui.tsx`、`card-batch-uploader.tsx` 中只被 `/app/contacts/new` 用的部分（逐个文本确认；被引导 / 开始指南用的留在允许清单，等 R28）；`contacts/business-card-import-client.ts`（死代码）与它的测试；`ingest-v2-route-view-model.ts`（若只被旧页用）；`scripts/generate-full-product-functional-audit.mjs` 对被删屏 / 路由的引用。`network-import*.tsx` 保留为临时落点（R16 删）。
- **不做**：招待コード（R15）、連絡先 / LinkedIn / CSV 新界面（R16，入口隐藏）；相机实时提示、自动拍（DESIGN §9 #6）；服务端批次确认动作（§9 #5）；v1 名片接口下线（§9 #29）；名片 OCR 进 AI 账本；读不出原因的细分（需要改 OCR 输出）。

## 测试

- 服务端：`contact-field-write.test.ts`（覆盖、清空、乐观并发冲突、历史上限、他人隔离）；`manual-contact-v2.test.ts`（名字必填、查重与名片同一规则、同名规则（只填名字 ↔ 名片、名字 + 公司 ↔ 只填名字）、手入力不自动统合、统合逐字段、`allowDuplicate` 新建、幂等重放、入队计划候补、撤销 10 分钟 / 被改过 409、撤销是墓碑且取消计划候补、他人隔离、示例模式拦截）；`ingest-v2-duplicates-name.test.ts`（同名候选追加、`identical` 为 false、原有候选不变）；Postgres 往返各一条（`*-postgres.test.ts`，`before` 里 `migrateConfiguredTestDatabase()`）；`card-auto-import.test.ts`（表驱动：与 Web 现有用例一一对应，W0015 的卡不自动）、`signature-split.test.ts`、`contact-name-match.test.ts`、`contact-density.test.ts`（表驱动，签名含日英中各 3 例）；路由测试（mock / live）。
- 两端渲染：入口页两项（招待 / その他 隐藏）、`AddContactSheet`、第一次指导前 3 次与「次回から表示しない」、权限被拒态、相机表 / 裏切换与「裏なし」、读取列表三种标记、まとめて確認三格与三区、整批选「会った場所」、重复对照两按钮、读不出卡三按钮、完成页三格（读不出不计入「追加」、计划候补未出时的文案）、手入力即时查重（只填名字也能查到）/ 统合字段选择 / Toast 撤销、草稿页确认与参加者取り込み、「减少动效」只留淡入。
- 端到端：Web Playwright 与 App 渲染测试各一条「上传 4 张（1 张完全相同、1 张相似、1 张读不出、1 张正常；含一组表 / 裏）→ 自动进人脈 → まとめて確認 → 完成：人脈 +2（正常 + 相似选了别人）、统合 1、读不出 1」；手入力「只填名字保存 → 拍一张同名名片 → 查到候选 → 统合」与「名字 + 公司 → 查到相似 → 别人保存 → 撤销」。
- 门禁：`no-hardcoded-copy`、`ionicons-ratchet`、`legacy-ui-ratchet`、`orbit-2026-css-tokens`、`orbit-2026-scope`、`copy:qa`、`web-route-transport`、`app-wide-route-coverage`、`mobile-route-access`、`route-parity`（修完基线那条后为 0 失败）、`contract-append-only`、`demo-world-consistency`。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R12-01 入口 | App 入口页（名刺 / 手入力；招待、その他 不显示；有草稿时「確認待ちの下書き」）与 `AddContactSheet` 组件；Web `/app/contacts/new` 门卡页（1440 / 1024 / 390）；返回回到人脈 | 渲染测试 + 截图（app.html / web.html 对照） |
| SC-R12-02 名刺拍 / 传 | 第一次指导（前 3 次、可关闭）→ 权限（含被拒）→ 相机连拍（表 / 裏配对、「裏なし」）/ 相册多选（≤100）→ 建批次上传；Web 拖放（JPG/PNG/HEIC/PDF） | 渲染测试 + 模拟器走查截图 |
| SC-R12-03 读完自动进人脈 | 两端同一份 `card-auto-import` 规则：无疑点的进人脈、与已有完全一致的并入、相似 / 同名 / 要確認 / 读不出 / 有活动归属候选的留下；不重复导入；洞察与活动归属副作用与手动确认相同（走同一接口） | 共享规则表驱动 + 两端渲染 / 端到端 |
| SC-R12-04 まとめて確認与完成 | 三格计数与三区；整批选「会った場所」；重复统合 / 别人；读不出 撮り直す（替换）/ 手入力で補う（预填）/ スキップ；完成页三格与实际变化一致；「人脈で見る」「続けて撮る」 | 两端渲染 + 端到端 |
| SC-R12-05 手入力 | 名字即可保存；即时 / 保存前查重（与名片同规则 + 同名）；统合逐字段选（旧值进历史）；保存后进详情 + 5 秒撤销（10 分钟 / 未改过 / 墓碑）；公司联想；Web 抽屉签名拆分高亮 | 服务 + 渲染 + 端到端 |
| SC-R12-06 一条管道 | 名片、手入力的新联系人都进计划候补（名片在批次完成时、手入力即时）；只填名字后拍同名名片 → 查到候选 | 服务测试 + 端到端 |
| SC-R12-07 旧屏与旧链接 | 旧屏文件全删、三份允许清单只减不增、`screen-ownership.md` App 加人 3 行（`contacts/new`、名片 5 屏、`manual`）改「已处理」、Web `/app/contacts/new` 行写「名片与手入力已处理，其他门待 R16」；旧链接（App `batch2/<id>`、`batch/<id>`、`import/<id>`，Web `?job=`、`?method=scan`）落到新页或提示；收件箱批次通知 href 新路径；活动「去复核联系人」落到草稿页 | 测试 + 点击验证日志 |
| SC-R12-08 真实识别 | 本机真实 DeepSeek OCR ≤5 次：单卡清晰照 3 张（含 1 组表 / 裏）+ 读不出 1 张，结果、耗时写 REPORT | REPORT 表 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01–05 | 截图对照页：b11 A1 ①–⑤ / Web、A3 ①–④ / Web、b9 A1 衔接 / A2 ④、b1 B1 / B2（表裏）/ B6 ↔ 实现，浅色 / 深色；App 用内置模拟器 | `~/orbit-sprint-evidence/redesign/R12/run-01/compare.html` |
| 04 | 完成页数字 = 测试前后人脈条数之差 | 端到端断言 |
| 全部 | 三语、`copy:qa` 0、门禁零新增；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 全量重建索引、impact（写 `impact-start.md`）；契约提交（第一天）。
2. 共享纯函数（`card-auto-import` 搬家并让 Web 改调、`contact-name-match`、`signature-split`、`contact-density`，表驱动 RED）→ 服务端：`contact-field-write` → `manual-contact-v2` → `duplicates` 同名 → 路由。
3. Web：门卡页 → 名刺两页 → 手入力抽屉 → 让位前缀。
4. App：入口页与 `AddContactSheet` → 名刺（相机表 / 裏）→ 读取 / 自动进人脈 / まとめて確認 / 完成 → 手入力 → 草稿页。
5. 删旧屏、旧链接翻译、登记与审计、允许清单。
6. 本机真实识别 ≤5 次；全量、REPORT、`detect-changes`、提交推送。
7. 独立复核 → 修复 → 模拟器走查。

## 失败与交接

- v2 的 `reviewIssues` 粒度不够区分「要確認」的类型（会社名 / 氏名の区切り / 役職推測）：照实按现有 issue 码分组，REPORT 列出缺的分类，不改 OCR。
- 引导（R28）、iOrbit（R21）里用旧 `card-batch-ui` 的地方：保留旧文件在允许清单里，REPORT 交接。
- 交接给 R11：`AddContactSheet` / `AddContactDoors` 组件、`contact-density.ts`、新联系人来源与浓度；给 R13：批次通知 href 已改；给 R14：推送白名单需要 `/contacts/new/scan/*`；给 R15 / R16：入口位置与隐藏开关、まとめて確認组件的接口。
