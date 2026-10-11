# Sprint R12 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话，2026-10-11。全新上下文，没参与实现，也没看执行会话的推理。
**对象：** `33b231ac`（契约与 shared/compute）、`45cd4f76`（服务端）、`06ae52a9`（Web）、`4ea0b583`（App + 删旧屏）、`012a7181`（REPORT）。基线 `82d9a2db`。文中行号都按 `012a7181`（= 复核时的 HEAD，工作区里只有用户自己的 3 个无关文件）。
**依据：** PLANNER（revision 2：SC-R12-01～08、易错边界、必需证据子表）、GOAL、REPORT；`add-and-invite/DESIGN.md`（版本 2）§2.1–2.3、§2.9、§3.1、§3.4、§4.1、§7、§8、§9、§13、§14；`add-and-invite/REVIEW.md`；`sprints/README.md` 通用规则；格式按 `R25-plan-review-goals-cleanup/REVIEW.md`。

REPORT 只当线索。下面的结论来自复核人重读代码、重跑测试，以及在 scratchpad `r12-review/` 里写的两个临时探针（`service-probe.ts`、`perf-probe.ts`）。

## 结论：有条件通过

没有 S 级问题。修完 M1–M3，并补齐 M4 的证据（或经用户同意改为「模拟器走查时一起补」），就可以登记为「已复核，问题已修」。

R12 的主体做得扎实：自动进人脈的规则两端真是同一份文件（逐字节相同），W0015、同名候选、读不出的卡都不会被自动导入，同一张卡不会被导入两次；手入力的查重、逐字段统合、撤销、幂等、他人隔离都在服务端成立，Postgres 上也有往返测试；旧屏删得干净，旧链接都有落点，允许清单只减不增。

为什么不是「通过」：Web 手入力抽屉的保存栏在**所有宽度**下都有内容从它下面透出来，390 也不是设计要求的全屏（M1）；两端まとめて確認的重复对照卡上「統合する」出现两次、而且语义不同（M2）；手入力接口有两个字段没有长度上限，活动 id 也不核对（M3）；PLANNER 必需证据里的对照页和 App 截图都还没有（M4）。

### 已经做到、复核人独立核实过的部分

**测试真实通过。** 都在 `012a7181` 上跑，Postgres 只用本机 `orbit_test`：

| 范围 | 结果 |
| --- | --- |
| orbits R12 相关 46 个文件：契约（`business-card-*-schema`、`business-card-candidate-tolerant`、`manual-contact-schema`、`contract-surface`、`contract-append-only`、`redesign-schema-parity`、`tolerant-reading`、`demo-world-consistency`）、`shared-compute` 审计、`sync-contract`、`web-route-transport`、`full-product-functional-audit`、`business-card-ingest-v2-*`（路由 / 仓储 / worker / 规范化 / 方向）、`ingest-v2-duplicates-name`、`manual-contact-v2-routes`、`manual-contact-v2`、`manual-contact-v2-postgres`、`contact-field-write`（含 Postgres）、`inbox-business-projections`、`domain/{card-auto-import,contact-density,contact-name-match,signature-split}`、`app-card-batch-*`、`ingest-v2-*` 页面、`app-contacts-new-live-route-services`、`ui/add-*`（含浏览器端到端 `add-scan-flow`）、`no-hardcoded-copy`、`orbit-2026-{css-tokens,scope,toast,shell}`、`copy-qa-check` | 522 条：518 通过、0 失败、4 跳过（全产品审计的 4 条「需要人工浏览器取证」用例，按环境跳过，与本 Sprint 无关） |
| App 23 个文件：`add-contact-model`、`add-contact-screens`、`initial-route`、`mobile-route-access`、`route-parity`、`app-wide-route-coverage`、`app-wide-contacts`、`business-card-*-view-model`、`contract-{sync,fixtures-parse,tolerant-reading}`、`copy-sync`、`copy-showcase`、`i18n-domain-split`、`no-hardcoded-copy`、`ionicons-ratchet`、`legacy-ui-ratchet`、`app-locale-relationships-events`、`event-preparation-view-model`、`ink-signal-*` | 348 / 348 |
| orbits `typecheck`、`typecheck:app`、`lint`；App `tsc --noEmit` | 都是 0 错误 |
| `copy:qa` | 2153 条 0 问题（与 REPORT 一致） |

**自动进人脈：两端同一份规则（SC-R12-03）。**
- `shared/compute/{card-auto-import,contact-density,contact-name-match,signature-split}.ts` 与 App `src/api/compute/` 的副本逐字节相同（`diff -q` 无输出）；`manual-contact` 契约与 schema 副本、`business-card-candidate.ts` 副本也相同。`shared-compute` 审计通过（无 IO、无时钟）。
- Web `card-batch-model.ts` 的 `isAutoImportEligible / isAutoMergeEligible` 改成只取字段再调共享函数，判定条件与原代码逐条一致；`use-card-batch.ts:396-406` 的筛选与 `decideCardAutoAction` 等价（见 m10）。App `scan-batch-model.ts:225-243` 直接调 `decideCardAutoAction`。
- W0015：两端都在「活动归属还没拿到」时不动手，有归属候选的卡返回 `review`；浏览器端到端用例「a card with an attribution candidate is never auto-imported」通过。
- 同名候选 `identical` 恒为 `false`，`decideCardAutoAction` 遇到不完全一致的候选一律 `review`，所以同名的卡不会被自动导入或自动统合。
- 同一张不重复：Web `autoAttempted` + `allConfirmed`、App `autoAttempted`（每张只判一次）+ `isCardConfirmed`；重开批次时已确认的卡被排除。服务端 `confirmCard` 本身也按条目幂等。
- 读不出不计入：两端 `unreadable` 只数「没被手入力补成联系人、且有 errorCode 的终态 / 跳过」的卡，`created` 不含它；端到端用例断言「新加 2、统合 1、读不出 1、人脈实际 +2」。
- 自动导入走的就是手动确认的同一个接口（Web `confirmCard` → `/items/<id>/confirm`；App `api.confirmCard`），洞察与活动归属副作用位置不变；`confirmCard`、worker 没改。

**手入力（SC-R12-05、06）。** 复核人的探针 `service-probe.ts`（内存存储）逐条确认：
- 只填名字的两个方向都查得到：已有「佐藤 花子 · A社 · 邮箱」，输入只有「佐藤花子」→ 同名候选；已有只有「田中 次郎」，输入「田中　次郎 + Z社 + 邮箱」→ 同名候选。两边都有公司 / 邮箱、公司不同 → 不提示（避免常见姓名误报）。别人的联系人永远不出现在候选里。
- 统合进**别人**的联系人（`mergeIntoContactId` + `fieldChoices`）→ `NOT_FOUND`；撤销别人的联系人 → `NOT_FOUND`。`applyContactFieldValues` 自己也检查归属、未删除。
- 撤销：10 分钟 + 1 毫秒 → `UNDO_EXPIRED`；建好后被 `applyContactFieldValues` 改过 → `UNDO_EXPIRED`；对统合进去的联系人撤销 → `UNDO_EXPIRED`（只撤本接口新建的）。撤销是 `deleteRecord` 墓碑，并以 `updatedAt` 为前提；同一事务里调 `cancelPendingPlanMatchForContact`（只删 pending 的任务行 / 候补，`running` 的任务读联系人时排除已删除的，`matching-repository.ts:416-436`）。
- 幂等：同一个键并发两次 → 同一个联系人、都是 `created`；不同键同名并发 → 第二个是 `duplicate_review`（advisory 锁串行，`configured.ts:48`）。
- 逐字段统合是真覆盖：选「incoming」的字段照写，旧值进 `fieldHistory`（`{field, previous, next, source, at}`，≤50）；没选的字段只补空；姓名不能清空。两端界面只把「两边都有值且不同」的字段列出来让人选（App `manual-model.ts:73-80`、Web 同名函数）。
- 计划候补：新建 / 统合后入队（并进当天任务）；Postgres 往返用例「create → plan-match job → replay → merge with history → undo tombstones and cancels pending work」通过。

**`fieldHistory` 放 payload 是安全的。** 设备同步的详情走 `contactDetailPayloadFromGraph` → `detailFor`，按字段构造、没有展开 payload（`live-detail-service.ts:776-800`），所以 `fieldHistory` 不会进 App 本地库，也不会撞任何 strict schema；列表 / 计划 / 查重的 SQL 都按键取值（`MATCH_PAYLOAD_FIELDS` 是白名单读取，不含它）。代价是它目前任何界面都读不到（REPORT 已交接 R11）。

**示例模式拦截不会误伤真实用户。** `isSampleRequest` 只认 `actorId === "demo-actor"`（`shared/mock/demo-world/fixtures.ts:25`，只存在于 mock 夹具）或请求头 `x-orbit-sample: 1`；真实账号的 id 不可能等于它。另一面见 m3。

**契约「宽进严出」。** `matchedOn` 先改 `tolerantEnum` 再加 `'name'`，同一提交；`readIngestContactCandidate / readIngestDuplicateMatches` 逐条宽进；BREAKING.md 登记了一行，快照已写。旧版已安装 App 不调 `duplicates` 接口、确认接口也不会产出 `'name'`，所以旧客户端不受影响。手入力请求体 `.strict()`，`outcome` 不认识的读成 `duplicate_review`。

**旧屏、旧链接、登记。**
- App 7 个旧屏、`BusinessCardBatchReviewForm`、`business-card-pending-files`、两个 view-model、`api/business-card-import` 与 4 个旧路由文件都已不存在；`ContactsScreen`、首页、`AiScreen` 的现有入口路径保留，落到新屏。
- 旧链接：App `batch2/<id>` → `scan/<id>`，`batch/<id>`、`import/<uuid>` → `scan?from=legacy`，`.`、`..`、空 id 返回 null（`initial-route.ts:204-219`）；Web `?job=` 用 `encodeURIComponent` 拼路径、`?lang=` 用 `URLSearchParams`，不会开放重定向（`_add/add-route.ts:24-34`）。
- 收件箱 href 按 `pipeline` 区分 v1 / v2（`inbox-business-projections.ts:23`），投影测试有断言。活动 `reviewQueueHref` 改指 `contacts/new/drafts?eventId=`。
- `CardBatchHost` 让位前缀收窄为 `/app/contacts/new/scan`：入口页、手入力抽屉、旧导入页都不再挡住续传；引导 `/app/profile/onboarding`、`/app/start` 仍让位、iOrbit 仍不让位，与原来一致；「去确认」改开新批次页。
- 允许清单只减不增：App 三份清单在这四个提交里只有删行；Web 的 `hardcoded-copy-legacy-allowlist.json` 没动（引导 / 开始指南仍用旧 `card-batch-ui`，等 R28）。新目录 `src/screens/add/`、`app/contacts/new*` 被加进 `no-hardcoded-copy` 与 `legacy-ui-ratchet` 的「必须为零」名单。
- Web 新页都在 `<Orbit2026Scope>` 里；`add.module.css` 只用 token（门禁通过）；App 新屏没有 Ionicons、没有写死文字（门禁通过）。
- 删掉的测试：除了只测旧屏 / 旧模块的 12 个 App 文件与 Web 死代码的 1 个测试，`business-card-ingest-view-model.test.ts` 只删了已删模块 `business-card-pending-files` 的 3 条；仍在用的 `batchRoutePath`、旧链接翻译在 `add-contact-model.test.ts`、`initial-route.test.ts` 里有新断言。没有发现 R25 m5 那种「删多了」。
- App `start.tsx` 只是一个 `<Redirect>` 到 `/profile/onboarding`（后者自带私有路由守卫），合理；两条过期 `route-parity` 例外删除后 App 全部路由对齐。

## 问题清单

### S（必须修）

无。

### M（应该修）

**M1 Web 手入力抽屉：保存栏下面有内容透出来（所有宽度），390 不是全屏。**
- 现象：`ManualContactDrawer.tsx:359-365` 把保存栏放在表单最后，用 `add.module.css:153` 的 `.drawerFoot { position: sticky; bottom: 0 }` 贴底；但它的滚动容器 `.drawerBody`（`ui/Overlay.module.css:92`）有 22px 的底部内边距，sticky 只贴到内边距以内，于是滚动内容会从保存栏下方那 22px 透出来。截图 `manual-1440-light.png` 与 `manual-390-light.png` 都能看到签名区的 chip 行（名前 / 会社 / 役職 …）和「項目に分ける」按钮出现在保存栏下面——REPORT 写的是「390 有版式问题」，实际 1440 / 1024 也有。另外 1440 的 `<Kbd>⌘↵</Kbd>` 被挤到第二行，390 手机上还显示快捷键。390 时抽屉是 `min(520px, 100vw - 28px)`（`Overlay.module.css:85`），四周留边，不是 DESIGN §2.3「390 全屏」。
- 为什么是问题：保存是这个抽屉唯一的主动作，栏下面露出半截控件，看起来像布局坏了，也容易误点；与设计（b8：390 全屏）不一致。
- 建议修法：用 `Drawer` 现成的 `footer` 插槽（`Overlay.tsx:118-136`，它在滚动区外面、带上分隔线）放「浓度预告 / キャンセル / 保存」，删掉 `.drawerFoot`；`Kbd` 加 `white-space: nowrap` 并在 `< 768` 隐藏（与 `.keysCard` 同一做法）。390 全屏：在 `Overlay.module.css` 给 `.drawer` 加 `@media (max-width: 767px) { inset: 0; width: 100vw; height: 100dvh; border-radius: 0 }`——这是共享组件，改前跑 impact、跑 `orbit-2026-*` 门禁，或只给 `Drawer` 加一个 `fullOnPhone` 选项由本抽屉打开。

**M2 まとめて確認的重复对照卡：「統合する」出现两次，两端都是。**
- 现象：Web `ScanBatchScreen.tsx:431-440`、App `ScanBatchScreen.tsx:631-637`：先是一排选择 chip「統合する / 別人として追加」，下面又是一排动作按钮「統合する（或 別人として追加）/ スキップ」。截图 `review-1440-light.png` 上两排都写「統合する」，一个是选项、一个是立即执行。REPORT「已知问题」只提了 Web，App 是同一个结构。
- 为什么是问题：同一个词两种行为，用户分不清点哪个才算数；底部「N人を人脈に追加」又会按 chip 的默认值（统合）把这张卡一起处理掉。设计 b1 B6 / DESIGN §2.2 第 6 步只有一组「統合する / 別人として追加」。
- 建议修法（两端同改）：只留一组。推荐保留 chip 作为「这张卡的选择」（底部批量按钮照它执行），把下面一排改成只剩一个文字按钮「スキップ」；如果想保留单张立即执行，就反过来去掉 chip、两个按钮直接执行，并让批量按钮不处理还没选过的重复卡。改完补一条渲染断言（重复卡里「統合する」只出现一次）。顺带见 m5（批量按钮的人数）。

**M3 手入力接口：两个字段没有长度上限；活动 id 不核对。**
- 现象：`shared/api-schema/manual-contact.ts:26` `metContext.eventId` 与 `:38` `mergeIntoContactId` 是 `nonEmpty`，没有 `.max()`。探针确认 20 万字符的 `eventId`、`mergeIntoContactId` 都通过 schema；`eventId` 原样写进联系人 `metEventId`（`service.ts:142-146`、`196`）。路由处理函数也没有限制请求体大小。另外服务端不核对这个活动是否存在、是不是本人参加 / 报名的（REPORT「已知问题」写了），而 `metEventId` 会被计划的活动对账读走（`event-attendance-reconcile.ts`、`matching-repository.ts:795-805`：把计划里这场活动标成已参加、v2 计划イベント枠计分）。两端的活动 chip 又包含未来 30 天的活动（`manual-model.ts eventChips`），选一场还没开的活动作为「出会った場所」会让计划提前把它记成已参加。
- 为什么是问题：PLANNER 要求复核手入力接口的输入长度；无上限的字符串会进联系人记录和同步页（超过单条上限时详情被丢成 `null`），也会进计划查询。活动 id 只影响本人数据，不是越权，但会让计划分数失真。
- 建议修法：`eventId`、`mergeIntoContactId` 加 `.max(200)`（与 `idempotencyKey` 一致），处理函数里加一句 `contactId.length` 同样的上限；`create` 里对 `metContext.kind === 'event'` 查一次活动存在且对本人可见（读不到就当没选，不报错）；chip 只列「已开始」的活动，或把未来活动的选择只写备注不写 `metEventId`。补一条 schema 用例（超长拒绝）。

**M4 PLANNER 必需证据缺两项，归属表 Web 行没改。**
- 现象：证据目录 `~/orbit-sprint-evidence/redesign/R12/run-01/` 没有 `compare.html`（必需证据子表：b11 A1 ①–⑤ / A3 ①–④、b9、b1 B1 / B2 / B6 ↔ 实现，浅 / 深色）；App 没有任何截图（SC-01 / 02 / 04 的 App 部分只有渲染测试）；Web 截图是测试渲染器在无头 Chromium 里截的，不是 dev server。`screen-ownership.md:67` 的 Web `/app/contacts/new` 行还是「重写」，SC-R12-07 要求写「名片与手入力已处理，其他门待 R16」。
- 为什么是问题：SC 表里 01 / 02 / 04 都标了 ✅，但验收契约里的主证据（截图对照页）不存在；没有对照页，就没人系统地比过设计稿——M1、M2 这种问题本该在那一步发现。
- 建议修法：模拟器走查时把 App 截图补上，与现有 Web 截图一起生成 `compare.html`（逐屏左设计稿右实现）；归属表第 67 行改为「已处理（R12：名片与手入力；その他四门暂进旧导入页，R16 重写）」。

### m（建议修）

- **m1 统合时「没选的字段只补空」在并发下可能变成覆盖。** `service.ts:213-229` 先读一次联系人算出 `mergeFieldValues`（哪些字段为空就补），再交给 `applyContactFieldValues`；后者冲突重试时（`contact-field-write.ts:147-163`）用的还是第一次算出的 `values`。如果名片确认或联系人编辑（不拿手入力的 advisory 锁）恰好在两次读之间补了这个字段，重试会把它覆盖掉。建议给 `applyContactFieldValues` 加一种「只在当前为空时写」的字段模式（或接受一个 `(payload) => values` 的函数，每次重试重新算）。
- **m2 撤销后用同一个键重放，返回已删除联系人的 `created`。** 回执不随撤销作废（`service.ts:285-291`），探针确认：撤销后同键再发 → `outcome: 'created'`、带原来的 `undoUntil`，但联系人已是墓碑。两端界面撤销后都会换新键，实际难触发；建议撤销时把回执的 `result` 改成 `{ outcome: 'undone' }` 或删除回执，重放时返回 `UNDO_EXPIRED`。
- **m3 服务端的「示例模式拦截」实际只是摆设，注释说法不对。** `handler.ts:7-8, 52-54` 说「示例画面发出的请求」带 `x-orbit-sample: 1`，但两端没有任何代码发这个头；`demo-actor` 也只存在于 mock 夹具。Web 的引导期示例模式（`_demo/DemoModeProvider`）只挂在人脈 / iOrbit 页，入口页和抽屉不在里面，所以新用户在引导期能正常加人——这是对的，但等于这层拦截不会触发。建议把注释改成实话（「只拦 mock 演示账号；界面的示例模式不经过这些页面」），不用为它加更多逻辑。
- **m4 完成页的「既存と統合」靠本机账本，换设备打开会算错。** Web `use-card-batch.ts:443-445`、App `scan-batch-model.ts:290-307` 都用本机 `ledger.merged` 区分「统合」和「新加」；在另一台设备（例如 Web 拍的批次从 App 收件箱打开）或清过存储后，统合的卡会被算成「新しく追加」，标题人数仍对、但三格分布不对。建议条目 DTO 带上确认结果（`merged: boolean`，服务端 `confirmCard` 本来就知道），没有时再退回本机账本。
- **m5 批量按钮「N人を人脈に追加」把要统合的也算成「追加」。** Web `ScanBatchScreen.tsx:236, 355`、App `:467, 557` 的 `n = addable.length` 含重复区默认「统合」的卡。建议拆成「N人を追加 · M人を統合」或只数新加的人。
- **m6 旧导入页里仍能走到旧的名片上传。** `/app/contacts/new?method=csv|contacts|event` 渲染的 `NetworkImport` 还有「扫描名片夹」方法卡（`network-import.tsx:36, 202`），点开就是旧的 `CardBatchImport`（旧样式、中英文案）。上传后会经 `?job=` 跳到新批次页，功能不坏，但 GOAL 说的是「Web 旧导入页里拍名片的部分删掉」。建议 `LegacyNetworkImport` 传一个开关隐藏 `scan` 方法卡（或方法卡上的 scan 改成跳 `/app/contacts/new/scan`）。
- **m7 App 上传途中离开拍照页，这一批就丢了。** 照片只在 `ScanCaptureScreen` 的 `useRef` 里（`ScanCaptureScreen.tsx:50, 99-131`），离开页面 `mounted.current = false` 后上传停止；批次页对「collecting」只显示「アップロードが途中で止まりました。もう一度撮影してください」（`ScanBatchScreen.tsx:334-339`）。旧 App 有 `business-card-pending-files` 把照片交给批次页继续传，这次随旧屏一起删了，REPORT 没提。100 张时上传要一段时间，返回键很容易按到。建议上传中拦返回（确认对话框），或把待传照片放进按「账号 + 批次」隔离的模块级暂存，让批次页接着传。
- **m8 同名候选让 `duplicates` 接口更慢（每张卡全量扫一遍联系人）。** `contact-duplicate-candidates.ts:30-42` 对每张卡把全部联系人再规范化、比较一次。探针 `perf-probe.ts`（100 张卡、都不命中）：2,000 人 152ms → 216ms，20,000 人 1,551ms → 2,179ms（原有 `findContactCandidate` 本来就是每卡全量）。建议请求内先按规范化姓名建一次 `Map<姓名, 记录[]>`，同名只查表；手入力的即时查重（每次停顿都读全部联系人）可以一起受益。
- **m9 同名规则只在客户端查询里生效，查询失败时会被自动导入绕过。** `use-card-batch.ts:383-390` 在 `duplicates` 请求失败时把所有卡当「没有候选」，随后自动导入；服务端 `confirmCard` 只按邮箱 / 电话 / 姓名 + 公司判重，不看同名，所以「只填名字的人 + 同名名片」在这种情况下会多出一个人。建议查询失败时这一轮不自动导入（标成需要看），或在确认接口里也加同名判断（返回 `duplicate_review`）。
- **m10 Web 的自动导入筛选是 `decideCardAutoAction` 的手写等价物。** `use-card-batch.ts:396-406` 没调共享的 `decideCardAutoAction`，只调了里面的两个子函数；现在逐条等价，但以后改共享规则（例如加一种「留给用户」的情况）时 Web 不会自动跟上。建议这段改成 `decideCardAutoAction({...cardAutoImportFacts(card, draft), candidate, hasEventCandidate, skipped}) !== 'review'`。
- **m11 完成页没有浓度分布条。** DESIGN §2.2 第 7 步「浓度分布条按 `contact-density` 计算」，两端完成页都没有（`contactDensity` 只在手入力的保存预告里用），REPORT 的 SC 表和自定决定都没提。建议补上，或写进 REPORT「自定决定」交给 R11。
- **m12 Web 批次 id 没编码就拼进接口路径。** 新路由让 `/app/contacts/new/scan/[batchId]` 的路径参数直接成为 `useCardBatch` 的 `batchId`，`ingest-v2-client.ts:62`、`use-card-batch.ts:253, 363` 用 `` `${INGEST_V2_API_BASE}/${batchId}` `` 拼地址。页面加载时只发 GET、写操作要先拿到合法批次，所以没有实际危害；但含 `/`、`..` 的 id 会请求到别的同源接口。建议页面上校验 id 格式，或在客户端统一 `encodeURIComponent`（App 侧 `ingestBatchPath` 已经这么做）。
- **m13 App 两处小遗留。** 引导 `ProfileOnboardingScreen.tsx:335` 仍 `router.push("/contacts/new/batch2")`，要经全局兜底路由 `[...legacy]` 再跳一次才到 `/contacts/new/scan`，建议直接写新地址（R28 的文件，通知或顺手改）；`app-navigation.ts:65` 给 `contacts/new/*` 的返回标签还是「取り込み / 导入」，页面标题已是「人脈を追加」（乙的文件，提给 R11）。

## 复核人做了什么

- 读了 GOAL、PLANNER（revision 2）、REPORT，DESIGN §1、§2.1–2.9（重点 §2.1–2.3、§2.9），R25 REVIEW 的格式；看了证据目录（impact、detect-changes、基线 / 收口日志、`ocr/`、30 张 Web 截图中的 doors / upload / review / done / manual 各若干张）。
- 逐段读了服务端 `contact-field-write.ts`、`manual-contact-v2/{service,configured}.ts`、`contact-duplicate-candidates.ts`、`app/api/contacts/manual/handler.ts` 与 4 个路由、`duplicates` 处理函数的改动、`cancelPendingPlanMatchForContact`、`inbox-business-projections.ts` 的改动、`shared/api-schema/manual-contact.ts`、`shared/compute` 四个文件、`ownedByActor` / `listActorContactRecords`、同步详情 `contactDetailPayloadFromGraph` 与 `deviceContactDetail`。
- Web：`contacts/new/page.tsx`、`_add/*`、`scan/**`、`orbit-2026/add/{AddContactDoors,AddContactScreen,ManualContactDrawer,ScanBatchScreen,upload-model}.tsx/ts`、`add.module.css`、`ui/Overlay` 的 Drawer、`use-card-batch.ts` / `card-batch-model.ts` / `card-batch-host.tsx` / `card-batch-ui.tsx` 的 diff、`network-import.tsx`、`shell-toast-bridge.tsx`、`_demo/demo-mode-core.tsx`。
- App：`app/contacts/new*`、`app/start.tsx`、`app/[...legacy].tsx`、`src/screens/add/{AddContactDoors,ManualContactScreen,ScanCaptureScreen,ScanBatchScreen,add-storage,manual-model,scan-batch-model,add-api}`、`initial-route.ts` / `mobile-route-access.ts` / `events.ts` 的 diff、`notification-model.ts`、`inbox-notification-actions.ts`。
- 看了允许清单、ratchet、`route-parity-exceptions`、`screen-ownership.md`、`BREAKING.md` 的 diff；`diff -q` 比了 shared/compute 与契约的 App 副本；比对了被删测试与仍在用的函数。
- 跑了上表的测试与两端类型检查、`lint`、`copy:qa`。
- 写了 2 个探针（scratchpad `r12-review/`，没有进仓库）：
  - `service-probe.ts`（内存存储）：统合 / 撤销他人联系人、只填名字两个方向、两边都有信息不提示、他人不可见、`fieldChoices: incoming` 清空并记历史、撤销后同键重放（m2）、10 分钟边界、被改过 / 统合的不能撤、超长 `eventId` / `mergeIntoContactId` 过 schema（M3）、活动 id 不核对、同键 / 异键并发。
  - `perf-probe.ts`：100 张卡 × 2,000 / 20,000 人的 `duplicates` 计算耗时，与只跑 `findContactCandidate` 的对照（m8）。

## 没做的事

- 没跑两端全量测试（按要求）；REPORT 的全量数字（orbits 7184 / App 3929）没有重算，也没复查它说的那条 `notification-discovery-worker-postgres` 偶发失败。
- 没起 dev server、没做浏览器或模拟器走查；App 的相机、权限、表 / 裏拍摄只看了代码和渲染测试。界面问题来自代码与现有 Web 截图。
- 没重跑真实名片识别（SC-R12-08），只看了 REPORT 的表与 `ocr/` 目录在不在。
- 没连 Neon、没读 `.env*` 的值、没调付费 AI、没部署；Postgres 只用 `postgres://localhost/orbit_test`。
- 没跑 GitNexus `impact` / `detect-changes`（复核只读，没有改代码）。
- 没改任何产品代码，没有 commit / stash / checkout / reset；唯一写进仓库的是本文件，探针只在 scratchpad。

## 处理记录（执行人，2026-10-11）

修复提交：`bc97aa8d`（契约：手入力请求体加长度上限，App 副本同提交；快照未判为破坏）、`61ee53e3`（修复）、`3f92ad62`（模拟器走查修复）。

| # | 处理 |
| --- | --- |
| M1 | 已修：Web 手入力抽屉的保存栏放进 Drawer 自带的 footer 插槽，内容不再透出；<768 时抽屉全屏直角（`Drawer` 只加可选参数 `fullOnPhone`，其余调用方不变） |
| M2 | 已修：两端重复卡只保留一组选项「統合する / 別人として追加」，卡上只剩「スキップ」，底部主按钮（或 ↵）按选项执行 |
| M3 | 已修：`eventId`、`mergeIntoContactId`、撤销的 `contactId` 限 200 字；选活动时服务端核对活动存在、本人看得到、已经开始，不通过就不写 `metEventId`，改写成备注「出会い：…」（不报错，不挡保存）；两端活动选项只列过去 30 天内已开始的 |
| M4 | 已修：归属表 Web `/app/contacts/new` 行改「部分处理（R12：名片与手入力；その他门待 R16）」；`compare.html` 已做（`~/orbit-sprint-evidence/redesign/R12/run-01/compare.html`，设计稿 22 张 ↔ 实现；相机、权限、读取中等 12 个画板写明「（无）」及原因）；App 截图来自内置模拟器 |
| m1 | 已修：统合「只补空」在每次重试时按最新记录判断 |
| m2 | 已修：撤销后同键重放返回 409 `UNDONE` |
| m3 | 查清后只改注释：服务端只认得出 mock 演示账号；Web 示例模式不包住加人页面、App 没有示例模式，真实账号不会被误拦 |
| m4 | 已修：批次详情给已确认条目加 `confirmedMerged`（服务端按新建联系人 id 的生成规则推算，不改表），两端完成页用它计数；旧服务端没有这个字段时退回本机记录 |
| m5 | 已修：主按钮「N人を追加 · M人を統合」 |
| m6 | 已修：旧导入页的「名片」卡改为链接到 `/app/contacts/new/scan` |
| m7 | 已修：App 上传改走模块级队列（按账号 + 批次），离开拍照页也会传完并开始识别 |
| m8 | 不修：同名查重让 2 万联系人 × 100 张从 1.55 秒到 2.18 秒，可接受；以后联系人规模上来再加索引 |
| m9 | 已修：两端查重失败的卡一律留给用户 |
| m10 | 已修：Web 自动导入直接调用共享 `decideCardAutoAction` |
| m11 | 已修：两端完成页加浓度分布条（数据不足时不显示） |
| m12 | 已修：Web 批次 id、条目 id 拼进路径前编码 |
| m13 | 已修：App 引导页改用 `/contacts/new/scan`；返回标签的文案键只在 `app-navigation.ts` 一处使用，只改了三语的值，乙的文件没动 |

**模拟器走查另外发现并修了 1 条**：App 手入力保存后点 Toast「撤销」看起来没反应——撤销请求要 3–4 秒，Toast 点完就关、期间没有提示，结果提示又被 `mounted` 判断挡掉（Fast Refresh 后 `mounted` 会一直是 false）。修法：点了立刻显示「元に戻しています…」，结果一律提示，成功用 `router.dismissTo` 回到表单（`3f92ad62`，渲染测试 2 条）。组件库 `Toast.tsx` 点按时先执行回调再关闭，回调里同步弹出的 Toast 会被立即关掉——调用方已绕开，**建议乙（组件库负责人）在 `Toast` 里改成先关再回调**。

修复后全量：App 3934 条 0 失败；orbits 相关 70 个文件 621 条 0 失败；两端类型检查、lint、`copy:qa`（2160 条）0 问题。
