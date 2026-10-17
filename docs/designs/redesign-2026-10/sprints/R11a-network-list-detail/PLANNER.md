# Sprint R11a — 人脈：列表 + 联系人详情 + 数据层

**Plan revision:** 2（2026-10-18 按独立复核 S1–S5、M1–M8、m1–m5 与主会话代定（RD-33，见文末）修订；rev 1 按用户 R11 拍板编制：拆 R11a / R11b，「情報が少ない人」页签取消，新增「イベント」来源，要フォロー = 有未完成 To-do）。**模式:** existing-codebase / single-generator（负责：乙；执行：Claude 子会话，B 线）。
**单一目标:** 两端人脈一覧 + 連絡先詳細 + 编辑删除按设计稿重写，浓度 / 来源 / 汇总 / 筛选数据层接真实数据（契约只加不改、App 本机优先），删除两端 pipeline，重比所有「待 R11」画面。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `line-b` 从 `origin/redesign` 拉出的 HEAD（编制时 `768941864`），行号按符号重新定位；已知失败以 README「骨架登记表」最后一行与各 Sprint 收口记录为准。
**进入条件:** RD-31 / RD-32 / RD-33 已定；**主会话已提交改稿与补画（b12「补画 · 2026-10-18 · R11a 人脈（Web）」、删页签、イベント chip）后开工**；决定表 §B-1 已写入（§B-2 由本 Sprint 按代定 12 补记）。**像素收口在 R31a / R31b 合入之后**（RD-31）。
**提交方式:** 在 B 线 worktree `/Volumes/ORICO/Dev/worktrees/orbit/redesign-b`（分支 `line-b`）按路径提交（`git commit -m … -- <自己的文件…>`，提交后 `git show --stat HEAD` 核对）；提交前 `git pull --rebase origin redesign`；**不推送**，由主会话复核后推到 `redesign`（RD-32）。不跑 GitNexus（RD-32）。

## 本线归属的文件 / 不许碰的文件（RD-31，复核逐条查越线）

**本线归属（可改 / 可删）**
- App：`app/(app)/contacts.tsx`、`app/contacts/{[id],list,pipeline}.tsx`；`src/screens/contacts/` 下除 `ContactsDashboardScreen` / `ContactStructureDetailScreen` 外的全部文件；新建 `src/screens/network/**`；`src/view-models/{contacts-local,contact-pipeline-local,contact-pipeline-pages}.ts`、`src/hooks/{useContactCardPages,useContactPipelinePages,local-contacts-source}.ts`（`contacts-local` / `useContactCardPages` 另有 schedule、notes、ai、profile 调用，只能向后兼容地改）；`src/i18n/{ja,zh,en}/contacts.ts`（或新域 `network.ts`）；`src/api/endpoints.ts` 只删 `contactPipeline`（:36）一行、只加本线接口行。
- Web：`app/(app)/app/contacts/{page.tsx,[id]/**,pipeline/**}`、`network-0918/` 里列表 / 详情 / 跟进 / pipeline 相关文件（`network-all`、`network-cards`、`network-detail-modal`、`network-follow-modal`、`network-model`、`network-pipeline`、`network-shell`、`contact-value*`、`contact-enrichment-inline`、`detail-return*`）、`compose-app-contacts-*`；`contacts/` 根下的 `contact-card-route-service.ts` 及邻接文件（`contact-card-view-model.ts`、`contact-interaction-editor.tsx`、`contact-notes-editor.tsx`、`contact-tag-editor.tsx`、`contact-relationship-initialization*`、`orbit-contact-avatar.tsx`）；`app/(app)/app/orbit-contacts-route-view-model.ts`、`orbit-contacts-presentation.ts`；新建 `orbit-2026/network/**`、`orbit-2026/copy/network.ts`；`app/api/contacts/{page,summary,pipeline,[id]}/**`。
- 服务端与共享：`features/contacts/**`（含 `completion/service.ts` 来源推断、`import/service.ts` 写 `source`）、`features/sync/contact-domain-reader.ts`；`shared/compute/{contact-density,contact-pipeline}.ts` 与新建 `contact-source-chip.ts`；`shared/contract/{contacts,contact-card-page,contact-local-directory,contact-pipeline-page}.ts` 与对应 `shared/api-schema/*`；新建 `shared/mock/demo-world/network.ts`。
- 门禁：新建 `scripts/visual/views/{web,app}-R11a.json`、`attribution-redesign-R11a.json`、本目录 `preflight-checklist.md` / `REPORT.md`。

**不许碰**（要改就在 REPORT「请求」写清楚，SendMessage 主会话转交）
- 组件库与 token（A 线）：App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`。
- 导航壳（D 线）：App `src/components/ShellTopBar.tsx`、`OrbitTabBar` / `TabPageBar`、`src/view-models/app-navigation.ts`；Web `orbit-2026/shell/**`（含 `shell-routes.ts`、`CommandPalette`）。`ShellTopBar` 已有 `title / subtitle / left / right` 插槽（`ShellTopBar.tsx:30`），预计不用改壳。
- 甲名下加人组件（只引用）：App `src/screens/add/**`（`AddContactSheet`、`AddContactDoors`、`DensityDots`（`add-ui.tsx:29`）、`CompletionQuestionCard`、`invite/InviteConnectionSheets.tsx`）；Web `orbit-2026/add/**`（`TodayQuestionCard`、`add-parts.tsx:18 DensityDots`）。
- 其他功能：`features/plans/**`、`features/tasks/**`、`features/invite-codes/**`（只调用已导出的函数和接口）、events、inbox、`profile/suggestions`（R18）；人脈分析文件（R11b：`network-analysis*`、`network-overview*`、`network-insight*`、`network-opportunities`、`analysis/**`、`dashboard/**`、App `ContactsDashboardScreen` / `ContactStructureDetailScreen`）**只允许删掉指向 pipeline 的链接**，REPORT 列出每处。
- 其他线的契约（`tasks.ts`、`plan-v2.ts`、`invite-codes.ts`、`relationship-lifecycle.ts`、`home-layout.ts` …）。README 登记表由主会话改；HANDOFF / DEFERRED-A / screen-ownership / IMPLEMENTATION-PLAN D-10 / 决定表只在收口时改本 Sprint 相关的行（代定 7、12），按路径提交。
- **汇总文件只追加**：`shared/contract/index.ts`、`shared/mock/demo-world/{index,fixtures}.ts`、App `src/i18n/*/index.ts`、`copy-kinds.ts`、`tests/i18n-domain-split.test.ts`、`scripts/copy-qa/cli.mjs`、路由登记与审计计数、`capability-registry`；允许清单只删自己的行；`.snapshot.json` 冲突时重新生成（`node scripts/contract-snapshot.mjs --write`），不手工合并。
- **本线环境**：Web dev 端口 **3300**、`ORBIT_NEXT_DIST_DIR=.next-line-b`；Metro **8083**；测试库 **`orbit_line_b`**（本机 Postgres，`createdb -T orbit_redesign_shots_20261018 orbit_line_b`）；iOS 模拟器新建 **`Orbit Line B`**，一律按 UDID 操作；App `.env.development.local` 指向 `http://localhost:3300`。不连 Neon、不部署；付费 AI 只在验证需要时本机真调并在 REPORT 记次数（RD-33）。

## 交接条目（逐条写进 SC，REPORT 逐条写处理结果）

| 交接表 # | 去向 |
| --- | --- |
| R11-01 App「＋」弹 `AddContactSheet` | SC-06 |
| R11-02 App 顶栏 A-R05-02、Web 整屏重写、A-R05-10 返回恢复 | SC-06 / SC-07 / SC-12 |
| R11-03 空态小卡「氏名だけで登録可」 | SC-06 / SC-07 |
| R11-04 加人弹窗 / 手入力抽屉压在人脈列表上 | SC-06 / SC-07 / SC-13 |
| R11-05 `density` / `sourceChip` / `densityCounts` / `addedThisMonth`、`goalRelated` live | SC-04 / SC-05 |
| R11-06 浓度补「计划已关联」 | SC-03 |
| R11-07 来源标签统一 | SC-02 |
| R11-08 「以前の値」 | SC-09；**转职冲突提示 → 下一期（D34），不做** |
| R11-09 招待连接的展示（share / unlink、offering / seeking、`pausedFields`） | SC-09 |
| R11-10 人物类型确认卡 | SC-09 |
| R11-11 每天一问挂人脈右栏 | SC-07 |
| R11-12 删除两端 pipeline | SC-11 |
| R11-13 390 深色水合警告 | SC-07 |
| R11-14 R25 动过的乙的文件 | SC-01（开工读 `R25-plan-review-goals-cleanup/REPORT.md`:132–136） |
| R11-15 人脈 🔍 进全局搜索、读 `?industry=` | SC-06 / SC-07 / SC-13 |
| DEFERRED-A §2「R15 / R16 待 R11」「R30 / R11-15」 | SC-13 |
| 面談の日程提案弹层（复核 M3） | **R20a 交付组件**；R11a 在联系人详情留插槽（入口位与 props 约定写进 REPORT），R20a 交付后挂上并补渲染测试；R20a 未交付时入口不显示 → SC-08 |
| 给甲的请求（复核 m2） | App `src/screens/add/CompletionQuestionCard.tsx:35` 来源文字没有 `event`（イベント）一档，列入 REPORT「请求」，不自己改 |
| 通用口径 G01 G02 G03 G10 G11 G12 G13 G15–G22 G24 G26 | 写进各 SC 的做法（见「易错边界」）；G04 / G23 / G23b 属 A 线，用到的组件差异标「待组件库」；G05–G07 G25 → SC-12 |
| 人脈分析（R11b）、`profile/suggestions`（R18）、联系人侧更新提案与转职冲突（下一期） | 不做，REPORT 写一句 |

## 已查清的事实（按 `768941864`，开工按符号复核）

1. **App 列表本机优先**：`ContactsScreen.tsx`（2684 行；`:42` 引入、`:1722` 调用 `useContactCardPages`）经 `hooks/useContactCardPages.ts:33`（内部 `useLocalContacts()` + `localContactCardPage` / `localContactCardSummary`，`contacts-local.ts:45,53`）读同步镜像；镜像行解析在 `view-models/contacts-local.ts:21 contactSyncPayload`，`card` 用 `contactCardSchema.safeParse`，失败整行丢弃。详情 `ContactDetailScreen.tsx:45` 用 `localContactDetail`；**App 详情没有接 `/insight` 和 value-lines**。
2. **契约现状**：`ContactListItemContract.density` / `sourceChip` 在 `shared/contract/contacts.ts:80-83`（旧 `/api/contacts` 用，列表实际不走它）；`ContactCardSummaryDTO.densityCounts` / `addedThisMonth` 在 `contact-card-page.ts:37-40`（schema 已有可选字段，`api-schema/contact-card-page.ts:33-34`），**服务端从没填过**；`ContactCardDTO`（`contact-card-page.ts:2`）**没有** `density` / `sourceChip`；`ContactSyncPayload.card: ContactCardDTO | null`（`contact-local-directory.ts:19-23`）。⇒ D-10 的目标改为 `ContactCardDTO` + `ContactSyncPayload.card`（D-10 文案由主会话改）。
3. **`contactCardSchema` 不宽进**：`sourceType` / `status` / `valueTypes` 是 `z.enum`（`api-schema/contact-card-page.ts:10-14`）；新字段必须用 `tolerantEnum` / 可选，旧 App 读到多余字段会丢弃（非 strict），不会整行失败。
4. **浓度**：`shared/compute/contact-density.ts`（纯函数，R12 写，`tests/domain/contact-density.test.ts`），`hasGoalRelation` 一项命中即 3；现在调用方都传 `false`（R16 REPORT:31）。调用方：mock-service、Web `add/manual-model.ts`、`new/_add/scan-batch-view.ts`、`completion-question-rules.ts`、App `screens/add/*`。
5. **来源**：每天一问的临时推断 `features/contacts/completion/service.ts:101 completionSourceChip`（vCard 标签 → phone，LinkedIn 备注 → linkedin，其余 manual；`event_import` 落 manual）；导入写联系人时 `source.type` 只分 `event_import` / `external_contacts`、`label` 按 kind（`import/service.ts:174-178`），**`format`（`linkedin|generic|vcard|event`，`import/types.ts:5`）没写进去**；招待连接用 `inviteLinkedContactIds`（`invite-codes/configured.ts:218`）。
6. **计划关联**：`planGoalRelatedContactIds(actorId)`（`features/plans/v2/active-needs.ts:93`，读 v1 + v2）；`ContactsListSearchFilterInput.contactIds`（`features/contacts/contract.ts:124`，Sprint 0101）是「只读这些人」的另一用途，**不拿来做 `goalRelated`**（会和分析页的调用冲突、且不能与其他筛选组合计数）；SQL 参数 `$17` 已被档位筛选（cards / summary，reader :111-121）和同步 record ids（:154、:257）占用，`goalRelated` 用新的参数号。fit：`GET /api/agent/plans/v2/contacts/[contactId]/fit` → `PlanContactFit[] { planId, goal, typeItemId, shortLabel, recommendScore, reason, state }`；候补决定 `POST /api/agent/plans/v2/[planId]/types/[itemId]/candidates/[contactId]/decision`（plan-v2.2/DESIGN.md:398）。计划**不在同步域里**。
7. **要フォロー**：任务有 `relatedContactId`（`features/tasks/task-record.ts:112,205`）；`task` 在同步域里（`shared/contract/sync.ts:42`），App 可在本机按镜像算。关系跟进另有 lifecycle 任务：`RelationshipTaskStatus = "open"|"scheduled"|"completed"|"dismissed"`，带 `contactId` / `connectionId`（`features/connections/lifecycle/contract.ts:5,11-12`）。
7b. **往来口径**：`listInteractedContactIds`（`features/contacts/completion/repository.ts:443-462`）= `contact_detail_states` 里有笔记或 `lastInteraction`，跳过已删除；加入时间 `completionAddedAt`（同文件 :179，R16 #2：LinkedIn 连接日期与录入时间取早）。
7c. **阶段枚举**：`RelationshipLifecycleStage = "needs_follow_up"|"active"|"nurture"|"archived"`（`shared/contract/relationship-lifecycle.ts:1`），没有与 推進中 / 協業中 对应的值（开工再查 `features/connections/lifecycle/**` 确认）。
7d. **删除**：`app/api/contacts/[id]/route.ts` 只有 `GET` / `PATCH`，**没有 `DELETE`**，也没有恢复接口。
8. **列表读取**：`features/contacts/card-service.ts`（读预算闸门检查 contacts / connections / contact_detail_states / evidence 四个集合，:22-25）→ `storage/contact-list-postgres-reader.ts`（2053 行；`createContactListSql(..., output: "records"|"cards"|"summary"|"sync")` :158，summary 的 `count(*)` 聚合 :829-877）；`readContactCardQuery`（card-service.ts:33）现只认 `query/cursor/limit/source/status/tag/value/tier`，**没有 industry / region / met / goalRelated / needsFollowUp**。读取边界规则见 `features/contacts/READ_BUDGET.md`（SQL 侧限定，不得读全量再在应用里过滤）。
9. **招待**：`pausedFields`（`invite-codes/service.ts:307`）、offering / seeking 写进 `publicProfile` 且旧值进 `fieldHistory`（R15 REPORT:37）；`fieldHistory` 写入方：`contact-field-write.ts`、`invite-fields.ts`、`manual-contact-v2/service.ts`、`completion/service.ts`。App 有 `InviteShareSheet` / `InviteUnlinkSheet`（`InviteConnectionSheets.tsx:32,139`，只在展示页）；**Web 没有对应 sheet**（本线在 `orbit-2026/network/` 新写）。
10. **pipeline 牵连**：Web `contacts/pipeline/page.tsx`、`network-pipeline.tsx`、`app/api/contacts/pipeline/handler.ts`、`features/contacts/{pipeline-contract,pipeline-page-reader,PIPELINE-READ.md}`、`shared/compute/contact-pipeline.ts`、`shared/contract/contact-pipeline-page.ts`（删契约 → `BREAKING.md` 登记）、审计脚本、`attribution-0918-network.json`；App `app/contacts/pipeline.tsx`、`ContactPipelineScreen.tsx`、`contact-pipeline-{local,pages}.ts`、`useContactPipelinePages.ts`、`endpoints.ts`、`route-domain-inventory.ts`；**链接还在** `ContactsScreen`、`ContactsDashboardScreen`、`network-overview` / `network-analysis-structure` / `network-opportunities` / `analysis/contacts-analysis-view-model.ts`、`network-shell`。
11. **搜索**：App `app/search.tsx` 已有；Web `orbit:open-palette` 事件（`Orbit2026Shell.tsx:334`）。两端人脈页都还不读 `industry` 参数。Web 列表现在走旧 `loadAppContactsRouteViewModel` + `loadContactCardRoute`（`contacts/page.tsx`），来源分类是旧的 `NETWORK_SOURCES`（`network-model.ts:92`）。

## 上下文包

决定：`R11-decisions`（主会话 scratchpad，已写入决定表 §B-1）、README RD-16 / RD-24～RD-32、通用规则 10–13；交接表通用口径与 §R11；DEFERRED-A §2；IMPLEMENTATION-PLAN §1.3、D-10、D-11；`screen-ownership.md` 人脈行；plan-v2.2/DESIGN.md:398；R12 / R15 / R16 REPORT 交给 R11 的段落；R25 REPORT:132–136；HOW-TO §0–§9。

## 易错边界

- **「情報が少ない人」页签已取消**；三颗点和浓度卡保留。页签只有 すべて / 目標に関係 / 要フォロー。
- **浓度在服务端算**（代定 1）：生成卡片的同一处（cards / sync 两种输出共用映射）由已读的四个集合算出「不含计划」的浓度，往来按事实 7b 同口径；**计划关联不落库**：Web 服务端读时合并，App 本机缓存「计划相关联系人 id 集合」（代定 13 的只读接口）后在读时合并（有关联即 3）。interaction 由笔记 / 活动等别的线写入，不在它们的写入路径上挂钩子。
- **旧镜像兜底**（代定 10）：`contact-density.ts` 在 `shared/compute`、会同步到 App；镜像行缺 `density` 时 App 用同一函数按本机已有字段现算（不含计划，再合并计划 id 集合），缺 `sourceChip` 按 `sourceType` 推；不强制重建镜像。
- **来源**（代定 11）：新增 `event`（イベント导入）；汎用 CSV 记 `manual`（手入力）；LinkedIn / vCard 按导入 `format` 判断——开工先确认 `format` 能否放进 `source`（`ContactSourceReferenceContract`，`contacts.ts:36-41`），不能就写顶层 `importFormat`；**无 `format` 的旧导入记录保留现推断（vCard 标签 / LinkedIn 备注）兜底**。**`self` 不落库**：读时用已导出的 `inviteLinkedContactIds`（`configured.ts:218`）按页合并（一页一次查询，计入读预算）。`completion/service.ts` 改用共享函数，两处结果一致。
- **筛选与画板对照**（代定 12；规则 7：画板与数据冲突，取「只显示有数据支撑的选项」）：段階 facet 先查 `features/connections/lifecycle` 等处有没有 知り合い / 関係構築 / 推進中 / 協業中 的现成阶段；有就映射；没有（事实 7c）就只留 知り合い = `active`、関係構築 = `nurture`，推進中 / 協業中 不显示（决定表记 §B-2，门禁按缺项归因 `[data]` 并注明主会话代定）；**段階 facet 去掉「要フォロー」选项**（页签已覆盖，避免同屏两种意思）。出会った場所 = 4 类 イベント / 紹介 / 訪問・商談 / その他，由新增 `metKind` 派生：活动导入 / 有 `metEventId` → イベント；招待连接 / 来源 `referral` → 紹介；名片 / 手入力里「出会った場所」写商談 / 訪問类 → 訪問・商談；其余 → その他（规则写进 `shared/compute` 并单测）。
- **要フォロー**（代定 / 复核 M2）：同时认 tasks（`relatedContactId`，未完成、未删除）与 lifecycle 任务（`contactId` / `connectionId`，`open` / `scheduled`）；与 R20a To-do 口径一致——开工前读 `sprints/R20a-task-todo-calendar/PLANNER.md`（正在写），R20a 改任务形状则 SendMessage 主会话。
- **删除只做软删 + 恢复**（代定 9）：联系人的メモ不移动、不改 notes 文件；联系人软删后读取侧隐藏其关联，恢复后自然回来（REPORT 写明）。
- **契约只加不改**（规则 10、G19）：`ContactCardDTO.density?` / `sourceChip?`（`tolerantEnum`，兜底 `manual`），`ContactListItemContract.sourceChip` / `ContactCompletionQuestion.sourceChip` 加 `event` 前先确认 App 读取已宽进；`contract:` 提交 + App `npm run sync:contract` 同一提交。
- **汇总不得读全量**：`densityCounts` / `addedThisMonth` / `tabCounts` 用 SQL 聚合（同 summary 查询，`count(*) filter (...)`），读预算闸门照旧；`goalRelated` 是新增 SQL 参数（id 数组，有上限）、`needsFollowUp` 用 SQL 半连接 tasks 与 lifecycle 任务集合（闸门加这两个集合与 plans）；`total` / `addedThisMonth` 不受页签与筛选影响，本月按 Asia/Tokyo；本机 PG 下记录行数 / 字节，写进 REPORT。
- **列表搜索框 ≠ 🔍**：搜索框只过滤人脈（App 过滤本机镜像，Web 传 `query`）；🔍 → App `/search?q=<已输入词>`、Web 派发 `orbit:open-palette`；Web 390 不画 🔍（G12）。
- **App 本机优先**：列表、筛选、页签、汇总、搜索全部离线可用；`/insight`、value-lines、fit 是联网增强，失败或「尚未实现」时整块隐藏（G18），不阻塞详情。门禁用演示 fixture；`insight/regenerate` 是付费 AI，只在验证需要时本机真调并记次数（RD-33）。
- **壳与组件**：Web 用 `ShellPage`（标题区 + `rightRail`，G10 / G11 390 保留标题行），外层 `Orbit2026Scope`（G21）；App 用 `ShellTopBar` / `AppScreen`（G15–G17）、`UiText`（G24）；危险色 `--coral-text`（G03）；次要说明 `--ink-3`（G02）；只用 token（G26）。组件不对齐时标「待组件库」，不在页面打补丁。
- **Web 联系人抽屉**导出为可复用组件（`orbit-2026/network/ContactDrawer` 之类，props 只收 `contactId` / `onClose` / 可选初始数据），给 R10 首页（D 线）引用；导出接口写进 REPORT 交接。
- **删 pipeline** 涉及 R11b 文件时只删链接；删契约走 `BREAKING.md`；旧路由在 App 路由表与 Web 审计里同步去掉（HOW-TO §7）。
- 重写旧屏后从三份允许清单删掉对应行（G20）；旧组件使用点归零就删文件。

## 契约（本 Sprint 定）

1. `shared/compute/contact-source-chip.ts`：`contactSourceChip({ sourceType, format?, sourceLabel?, hasLinkedinNote?, inviteLinked }) → "meishi"|"linkedin"|"phone"|"manual"|"self"|"event"`（无 `format` 走旧推断兜底）；`shared/compute` 另加 `metKind` 派生规则。
2. `ContactCardDTO` 加可选宽进字段：`density?: 1|2|3`（不含计划）、`sourceChip?`（`tolerantEnum`，兜底 `manual`；`self` 读时合并）、`primaryIndustryId?`、`secondaryIndustryId?`、`region?`、`metKind?`（`tolerantEnum`，兜底 `other`）、`addedAt?`（R16 #2 口径）；`ContactSyncPayload.card` 随之带上；本机目录查询（`LocalContactDirectoryQuery`）同步支持这些筛选。
3. `ContactCardSummaryDTO`：`densityCounts` / `addedThisMonth` 开始填（本月按 Asia/Tokyo；`total` / `addedThisMonth` 不受页签与筛选影响），新增 `tabCounts?: { goalRelated: number; needsFollowUp: number }`。
4. `GET /api/contacts/page` 与 `summary` 加参数 `goalRelated=1`、`needsFollowUp=1`、`industry`（主 / 副业界 id，可多值）、`region`、`met`（`metKind` 4 值）、段階用映射后的现有 `status`（只接受 `active` / `nurture`，代定 12）；**不加 `stage` 参数**；未知参数忽略、非法值按原契约报错。
5. 新只读接口 `GET /api/contacts/goal-related-ids` → `{ ids: string[]; truncated: boolean; asOf }`（上限写成常量，读预算加 plans 集合；内部调 `planGoalRelatedContactIds`），契约 + schema + 快照；App 缓存它（键、过期、离线用上次值），「要フォロー」本机计算规则写进 `contacts-local`，测试覆盖。
6. 删除：`DELETE /api/contacts/[id]`（软删，写 `deletedAt`）与恢复接口（如 `POST /api/contacts/[id]/restore`，30 天内有效，过期返回原契约错误）；App 离线删除走写入队列。
7. Web `ContactDrawer` 组件导出（给 R10）。

## 像素 SC 与预检（HOW-TO §8、规则 11 / 13、RD-26 / RD-29）

- **顺序**：先结构 / 数据 / 逻辑；R31a / R31b 合入后再做像素收口。每个画面开工前跑 `node scripts/visual/board-preflight.mjs --suite scripts/visual/views/<端>-R11a.json --md docs/designs/redesign-2026-10/sprints/R11a-network-list-detail/preflight-checklist.md`，五项结论贴进本目录 `preflight-checklist.md`；画板序号开工时用 `--list` 确认（画板正在改：删页签、加イベント chip、b12 尾部补画）。
- **判定**：两端按决定表 §20 / RD-29，超阈值带全部归因 `[data]` / `[raster]` / `[contrast]` 即通过；提交 `attribution-redesign-R11a.json`；每画面最多 3 轮，被组件卡住的标「待组件库」登记交接表与 DEFERRED-A。设计稿示例 fixture 放 `shared/mock/demo-world/network.ts`，只补数据。

| 画面 id | 画板（文件 · 标题） | 宽度 / 主题 |
| --- | --- | --- |
| W-R11-01 / 02 / 03 人脈 空 / 少量 / 大量 | web.html「人脈新用户空状态」「人脈少量数据」「人脈大量数据」；b6「人脈 · 1024」「人脈 · 390 手机浏览器」；深色见 b12 补画 R11a（Web） | 1440 浅（03 另 1024 / 390 浅、深） |
| W-R11-04 / 05 目標に関係 / 要フォロー | b12 补画 R11a（Web）（无则设计稿无，先拍板） | 1440 浅 / 深 |
| W-R11-06 連絡先詳細 | web.html「連絡先詳細（抽屉）」；b6「人脈 + 連絡先抽屉」深；b8「連絡先詳細 · 1024 抽屉弹层」「· 390 全屏」 | 1440 浅深 / 1024 / 390 |
| W-R11-07 / 08 / 09 招待连接 / 人物类型确认卡 / 以前の値 | b12 补画 R11a（Web） | 1440 浅 / 深 |
| W-R11-10 絞り込み、W-R11-11 編集抽屉（+ 删除确认） | b5「絞り込み · Web」「連絡先の編集 · Web（抽屉）」 | 1440 浅（深色见补画） |
| W-R11-12 加载中、W-R11-13 右栏每天一问 | b1「人脈 · 加载中（Web）」；web.html 人脈右栏 / 补画 | 1440 浅 |
| A-R11-01 / 02 / 03 人脈 空 / 少量 / 大量（含顶栏 A-R05-02） | app.html「人脈新用户空状态」「人脈少量数据」「人脈大量数据」（深色 `dark` 同名） | 浅（03 浅深） |
| A-R11-04「＋」人脈を追加 | app.html「人脈 ·「＋」人脈を追加」 | 浅 |
| A-R11-05 連絡先詳細 | app.html「連絡先詳細」 | 浅 |
| A-R11-06 / 07 / 08 本人入力カード + 确认卡 / 資料の同期 / つながりを解除 | b9「招待 ③ 発起方：本人入力カード」（深色同名）「招待 ④ 資料の同期」「招待 ⑤ つながりを解除」 | 浅（06 浅深） |
| A-R11-09 絞り込み、A-R11-10 / 11 / 12 編集 / 業界・役職層 / 削除の確認 | b5「絞り込み · App」「① 編集」「② 業界・役職層」「③ 削除の確認」 | 浅 |
| A-R11-13 加载中 | b1「人脈 · 加载中（App）」 | 浅 |

App 画板没有深色、Web 没有 1024 / 390 的画面：先 SendMessage 主会话请用户拍板（补画或按「设计稿无」处理），不自己推断。作废画板（b7 D29、b9 D28、b9「字段冲突 · 転職」D34）不进门禁。

## 范围与文件

- 改 / 新建：见「本线归属」；测试：`tests/domain/contact-density.test.ts`、新 `contact-source-chip.test.ts`（含 `metKind`、旧导入兜底）、`completion` 服务测试、导入服务测试、`goal-related-ids` / `DELETE` / 恢复接口的路由测试（`redesign-contract-routes` 同类）、App 离线删除写入队列测试、`contact-list-pagination-route` / `contact-scoped-read-postgres` 同类本机 PG 测试、`redesign-schema-parity`、App `contract-fixtures-parse`、`contacts-local` 与新屏渲染测试、路由登记（HOW-TO §7）。
- 删除：两端 pipeline（事实 10）、旧 `ContactsScreen` / `ContactDetailScreen` 被新屏取代后的死代码与允许清单行。
- **不做**：人脈分析（R11b）；`profile/suggestions`（R18）；联系人侧更新提案与转职冲突（下一期）；组件库、导航壳、加人组件的改动（提请求）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R11a-01 开工与边界 | 建 worktree / 端口 / `orbit_line_b` / 模拟器；两端基线全量记录；读 R25 REPORT:132–136 并在 REPORT 补通知（R11-14）；`board-preflight` 跑完 | 基线摘要、`preflight-checklist.md` |
| SC-R11a-02 来源统一 | `contactSourceChip` 单测覆盖 6 值（含 event、汎用 CSV → manual、vCard、LinkedIn、名片 / QR、招待 = self 读时合并）；导入写入 `format`（或 `importFormat`）；**无 `format` 的旧导入记录仍按旧推断得到 phone / linkedin**；`metKind` 4 类单测；每天一问与列表对同一人给同一标签 | 单测 + 服务测试 |
| SC-R11a-03 浓度含计划 | 卡片 `density` 不含计划；Web 读时合并、App 读时合并后计划相关的人为 3；计划无 / 「尚未实现」时退回不含计划的值 | 单测 + 服务测试 + App 渲染测试 |
| SC-R11a-04 契约与同步兼容 | 只加不改通过 `contract-snapshot`；用旧版 `contactCardSchema` 解析新卡片成功（多余字段丢弃）；新 App 解析未知 `sourceChip` / `metKind` 落兜底值；同步镜像行带新字段不被丢弃；**旧镜像行（无新字段）升级后浓度 / 来源显示正确**（App 现算兜底）；`sync:contract` 同提交 | 契约检查 + 兼容测试 |
| SC-R11a-05 列表接口 | 本机 PG：`goalRelated`（新 SQL 参数，不占 `$17`）/ `needsFollowUp`（tasks + lifecycle 两种来源、已完成 / 已删除不算）/ `industry` / `region` / `met` / `status`（active、nurture）各自与组合筛选正确、分页 cursor 稳定；`densityCounts` 之和 = total、`addedThisMonth` 按 Asia/Tokyo 月界、`total` / `addedThisMonth` 不随页签与筛选变、`tabCounts` 正确；`goal-related-ids` 上限与 `truncated`；summary 是 SQL 聚合，读预算闸门生效，行数 / 字节写进 REPORT | 路由测试 + PG 测试输出 |
| SC-R11a-06 App 人脈一覧 | 模拟器：顶栏「🔍 · 人脈 / N人 · 今月 +M · ＋」；三页签切换；筛选弹层四组；搜索框本地过滤；🔍 进 `/search?q=`；`/contacts?industry=<id>` 预选业界；「＋」弹 `AddContactSheet`，背景是列表；飞行模式下列表 / 页签 / 搜索仍可用；进详情返回恢复页签与滚动（A-R05-10） | 渲染测试 + 模拟器操作记录 |
| SC-R11a-07 Web 人脈一覧 | `ShellPage` + 右栏每天一问；三页签、筛选、搜索、翻页；🔍 派发 `orbit:open-palette`，390 无 🔍；`?industry=` 预选；「＋」打开 W-R12-01 弹窗压在列表上；390 深色开发模式无水合警告（控制台记录） | 渲染测试 + 浏览器记录 |
| SC-R11a-08 連絡先詳細 两端 | 头卡、なぜこの人か、次の一手、offering / seeking、往来；App 新接 `/insight` 与 value-lines，失败整块隐藏（必要时本机真调付费 AI 验证并在 REPORT 记次数）；面談の日程提案插槽已留（R20a 交付后挂上）；Web 抽屉组件导出并有独立渲染测试 | 渲染测试 + 两端操作记录 |
| SC-R11a-09 三类特别情况 | 招待连接的人：本人入力、共享项目改动（share sheet，含「統合する / 別の人」）、`pausedFields` 显示、解除；fit `state=candidate` 显示虚线确认卡，✓ / ✕ 调候补决定接口后卡片消失；`fieldHistory` 有旧值的字段显示「以前の値」（含 offering / seeking） | 服务 + 渲染测试 + 操作记录 |
| SC-R11a-10 编辑与删除 | 两端编辑（含业界 / 职位层级）保存后列表与详情一致；删除确认 → `DELETE` 软删（写 `deletedAt`）→ 从列表消失、Toast「元に戻す」→ 恢复后回到列表；恢复接口 30 天内有效、过期报错；关联メモ在删除期间不显示、恢复后回来（notes 文件未改）；App 离线删除进写入队列、联网后落库（补写入路径与测试）；「最近削除した項目」页与到期清除 → 设计稿无 / 下一期，登记 DEFERRED | 服务 + 路由 + App 队列测试 + 操作记录 |
| SC-R11a-11 删除 pipeline | 两端路由、屏幕、接口、读模型、契约（`BREAKING.md`）、链接全部删除；旧地址按 HOW-TO §7 处理；审计计数更新；收口时把 `screen-ownership` 人脈 pipeline 两行标已处理（代定 7） | 文本搜索为零 + 路由测试 |
| SC-R11a-12 像素 | 上表每个画面 × 宽度 × 主题过门禁（R31a / R31b 合入后），被组件卡住的标「待组件库」；`app-R05.json` 中 A-R05-02 / A-R05-10 重跑通过 | 门禁总表（raw、带数、归因路径） |
| SC-R11a-13 「待 R11」重比 | 重跑 W-R12-01～04、W-R15-14、R16 REPORT 标「待 R11」的画面、W-R30-P03 / A-R30-P08（点「近い条件なら」落到预选业界）；通过的在交接表 / DEFERRED-A 改 done（收口时自己改，代定 7） | 门禁输出 + 清单 |
| SC-R11a-14 全量与复核 | 两端全量对照基线零新增失败；orbits `typecheck` / `typecheck:app` / `lint` / `copy:qa`、App `tsc` 通过；越线检查（只改了本线文件）；独立复核**自己重跑**测试与门禁 | 全量摘要、REVIEW |

## 执行顺序

1. SC-01 开工（环境、基线、预检）。
2. 数据层测试先行：来源（SC-02）→ 浓度与计划合并（SC-03）→ 契约与同步兼容（SC-04）→ 列表参数与汇总（SC-05）；合一次 `contract:` 提交并同步 App。
3. App 列表（SC-06）→ Web 列表（SC-07）→ 两端详情（SC-08、SC-09）→ 编辑删除（SC-10）。
4. 删除 pipeline（SC-11）。
5. 等 R31a / R31b 合入：像素（SC-12）→ 重比（SC-13）。
6. 全量、REPORT（含请求清单、交接、门禁总表）→ 独立复核（SC-14）。

## 失败与交接

需要拍板的事 SendMessage 主会话，先做别的。rev 1 的三项「已知待定」已由下文「主会话代定」1、2 定掉。REPORT 交接：`ContactDrawer` 用法（给 R10）、`contactSourceChip` / 浓度口径（给 R10 首页人脈组件、R11b）、给 A 线 / D 线 / 加人组件的请求清单、D-10 文案更新请求、待组件库与未过清单。

## 主会话代定（2026-10-18，RD-33；取代上面「已知待定」）

1. **浓度口径**：同意「卡片生成处算（list 与 sync 共用映射）」，不在别的线的写入路径挂钩子；`sourceChip` 的 `meishi / linkedin / phone / event / manual` 在写入时按 `format` 落库（旧记录读时兜底），**`self` 不落库**（见 11）。
2. **缺画板**：Web 1024 / 390 只门禁已有画板（列表、详情）；其余 Web 1024 / 390 与 App 深色画面「设计稿无」——按同一画面浅色 / 1440 画板照搬结构、颜色只用 token，REPORT 附截图，不进像素门禁，登记 DEFERRED「设计稿无」。人脈右栏每天一问卡用 R16 已过门禁的 `TodayQuestionCard` 画板口径。页签「目標に関係」「要フォロー」的样子以本次改稿后的画板为准（b12「补画 · 2026-10-18 · R11a 人脈（Web）」与改过的 app / web 列表板）。
3. **pipeline 链接**：允许在 R11b 名下文件里只删 pipeline 入口与链接，每处写进 REPORT（R11b 同线随后接手）。
4. **删 `contact-pipeline-page` 契约**：登记 `BREAKING.md`，App 先停用读取再删。
5. **枚举**：新字段一律 `tolerantEnum`；给 `sourceChip` 加 `event` 前先把 App 读取改宽进（G19），并在 REPORT 写明最低 App 版本影响。
6. **Web 招待连接的共有 / 解除 sheet**：在 `orbit-2026/network/` 新写 Web 版（参照 App `InviteConnectionSheets.tsx` 的行为，不改甲的文件）。
7. **文档更新**（D-10 文案、HANDOFF / DEFERRED-A「待 R11」改 done、screen-ownership pipeline 行）：执行者在收口时一并改，按路径提交。
8. **模板库**：`orbit_redesign_shots_20261018` 已存在（本机 Postgres）；不存在时用仓库 seed 脚本从 `orbit_events` 克隆重建。
9. **删除（复核 S1，2026-10-18，RD-33）**：本期只做软删除 + 恢复：新增 `DELETE /api/contacts/[id]`（软删，写 `deletedAt`）与 30 天内的恢复接口；删后 Toast「元に戻す」；App 离线删除走写入队列（补写入路径与测试）。「最近削除した項目」页与到期清除 → 设计稿无 / 下一期，登记 DEFERRED。联系人的メモ不移动、不改 notes 文件：联系人软删时读取侧隐藏其关联，恢复后自然回来，REPORT 写明。→ SC-10。
10. **旧镜像（复核 S2，2026-10-18，RD-33）**：App 读时兜底——`contact-density.ts` 在 `shared/compute`（同步到 App），镜像行缺 `density` 时 App 用同一函数按本机已有字段现算（不含计划，再合并本机计划 id 集合）；缺 `sourceChip` 按 `sourceType` 推。不强制重建镜像。→ SC-04「旧镜像行升级显示正确」。
11. **`self` 来源（复核 S5，2026-10-18，RD-33）**：`self` 不落库；读时用已导出的 `inviteLinkedContactIds`（`configured.ts:218`）按页合并，计入读预算。取消 rev 1「招待连接 / 解除时落库」的表述。
12. **筛选字段与画板对照（复核 S3 / S4，2026-10-18，RD-33）**：契约补可选宽进字段 `primaryIndustryId?` / `secondaryIndustryId?` / `region?` / `metKind?` / `addedAt?`（R16 #2 口径），本月按 Asia/Tokyo，本机目录查询同步支持。段階：有现成阶段枚举就映射，没有就只留 知り合い = `active`、関係構築 = `nurture`，推進中 / 協業中 不显示（画板偏离，决定表记 §B-2，门禁缺项归因 `[data]` 并写明主会话代定）；段階 facet 去掉「要フォロー」。出会った場所 = イベント / 紹介 / 訪問・商談 / その他，由 `metKind` 派生。删掉 `stage` 参数，改用映射后的 `status`。
13. **复核 M1–M8、m1–m5（2026-10-18，RD-33）**：全部按复核建议改——`goalRelated` 为新 SQL 参数（`$17` 已占用）；要フォロー认 tasks + lifecycle 两种来源、与 R20a 同口径；面談の日程提案弹层由 R20a 交付、R11a 留插槽；新只读接口 `GET /api/contacts/goal-related-ids`（有上限、读预算加 plans）；summary 加 `tabCounts`；无 `format` 旧记录保留旧推断；往来 = `listInteractedContactIds` 同口径；进入条件改为主会话改稿与补画提交后开工；归属清单补全；`CompletionQuestionCard` 的 event 标签列为给甲的请求；事实 1 行号已改；`format` 进 `source` 先确认、否则顶层 `importFormat`；SC-08 允许本机真调付费 AI 并记次数。
