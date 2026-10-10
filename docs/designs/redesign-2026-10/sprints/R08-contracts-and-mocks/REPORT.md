# Sprint R08 — REPORT

**执行人：** 小雨的执行会话，2026-10-10。**依据：** PLANNER、README 通用规则、RD-22（统一演示世界）、RD-24、RD-25。
**基线：** `redesign` `9e577124`（R07 提交）。
**证据：** `~/orbit-sprint-evidence/redesign/R08/run-01/`（`orbits-test.log`、`typecheck*.log`、`lint.log`、`app-test.log`、`app-typecheck.log`、`impact-summary.txt`、`detect-changes.txt`、`contract-diff-vs-R07.txt`）。

## 做了什么

1. **12 组契约**（`repos/orbits/shared/contract/` + `shared/api-schema/`，文件头写明负责人和使用方）：

   | # | 契约 | 接口（mock 返回演示世界；live = 503 `NOT_IMPLEMENTED`） | 负责人 → 使用方 |
   | --- | --- | --- | --- |
   | 1 | `home-layout.ts`（新）+ 默认布局 `DEFAULT_HOME_LAYOUT`（在 `api-schema/home-layout.ts`，契约文件不放运行时值） | `GET / PUT /api/home/layout`（PUT 带 `expectedRevision` + `mutationId`，旧 revision → 409，context 带 `currentRevision`） | 乙 R10 → 两端首页 |
   | 2 | `contacts.ts` 扩展 `density?`、`sourceChip?`；`contact-card-page.ts` summary 扩展 `densityCounts?`、`addedThisMonth?` | `/api/contacts/page` 没有 mock 模式（直接读库），参数过滤以 `filterDemoContacts(params)` 交付，R11 接入 | 乙 R11 → 人脈、首页 |
   | 3 | `contact-completion.ts`（新） | `GET /api/contacts/completion-question`、`POST …/[id]/answer`、`POST …/[id]/skip` | 甲 R16 → To-do、人脈 |
   | 4 | `invite-codes.ts`（新） | `POST /api/invite-codes`、`GET …/current`、`POST …/[code]/revoke`、`GET …/[code]/preview`（公开）、`POST …/[code]/redeem` | 甲 R15 → 人脈「＋」、首页 |
   | 5 | `notes.ts` 扩展 `noteKind?`、`usedForPlan?`；mention 扩展 `entityType?`、`eventId?` | 现有笔记接口没有 mock 模式；fixture `demoNotes` 带新字段 | 乙 R20 → Task 笔记、计划 |
   | 6 | `inbox-notifications.ts`：`InboxSourceKind` 加 `event_deadline` / `event_prep` / `event_pick` / `mail_summary`（zod 同步） | 现有收件箱接口；fixture `demoSecretaryNotifications`（四种来源，通过完整 `inboxNotificationSchema`） | 乙 R13 → 收件箱、首页秘书 |
   | 7 | `notification-delivery-policy.ts` 扩展 `quietStart?` `quietEnd?` `dailyCap? (1..3)` `secretaryMail?` `secretaryDeadline?` `secretaryPick?` `meetingException?`（zod 同步） | 现有偏好接口；fixture `demoDeliveryPreferences` | 乙 R14 → 设置 |
   | 8 | `event-assessment.ts`（新，5 项固定标准 rubric v1） | `POST / GET /api/events/assessments`、`GET / PATCH …/[id]`、`POST …/[id]/add-to-plan` | 甲 R26 → 活动、首页 |
   | 9 | `event-recommendation-feedback.ts`（新） | `POST /api/recommendations/events/[id]/dismiss` | 甲 R27 → 活动、秘书 |
   | 10 | `tasks.ts` 扩展 `deferralCount?` | 现有待办接口没有 mock 模式；fixture `demoTodos` | 乙 R20 → To-do |
   | 11 | `account.ts`（新） | `GET / POST /api/account/exports`、`GET …/[id]`、`GET / POST / DELETE /api/account/deletion-request`、`GET /api/app/version`（公开） | 乙 R18 → 设置、App 启动 |
   | 12 | `plan-v2.ts`（新，**`@draft until R22`**） | `GET /api/agent/plans/v2/summary` | 甲 R22 → 首页、Task、活动评分 |

2. **mock 路由的统一做法**：`features/redesign-contracts/service-factory.ts` 用现有 `createModuleServiceFactory`（只有 `mock` 实现）；`app/api/_shared/redesign-contract-route.ts` 解析模式 → mock / hybrid 走 `features/redesign-contracts/mock-service.ts`（演示世界，内存状态，不写库），live（生产环境永远是 live）返回 `503 SERVICE_UNAVAILABLE` + `context { capabilityId, reason: "NOT_IMPLEMENTED", requestedMode }`，与现有计划路由同一口径；每个响应出门前用契约的 zod 校验；坏 body 400、未知 id 404，都在统一信封里。路由文件只 re-export `features/redesign-contracts/handlers.ts` 的处理函数。
3. **统一演示世界**（`shared/mock/demo-world/index.ts`）：10 个虚构人物（设计稿里的 渡辺 翔 / Nexa Robotics、高橋 美咲 / 青葉ベンチャーズ 等）、3 个活动、1 个计划、2 条笔记、3 条待办，日文；每条都带 `sample: true`。`fixtures.ts` 只从这里组装 12 组 fixture。
4. **「只加不改」**：`scripts/contract-snapshot.mjs`（TypeScript 编译器读 `shared/contract/*.ts` → `.snapshot.json`：字段名、可选、类型文本、枚举值），检查删类型 / 删字段（改名 = 删 + 加）、可选变必填、给已有类型加必填字段、枚举少值、类型不是放宽；`@draft` 文件不记录不检查；`BREAKING.md` 里用反引号写了 id 的破坏放行（表格：日期、id、改动、原因、甲乙同意、App 跟进）。`node scripts/contract-snapshot.mjs [--write]`。
5. **「尚未实现」工具**：`shared/compute/not-implemented.ts`（两端共用目录，`sync:contract` 逐字拷到 App `src/api/compute/`，过共用目录审计）：`isNotImplemented(payload)` 认信封和已拆开的错误对象，真正的 503 故障不算；`whenNotImplemented(payload, { use: "default", value } | { use: "hide" })`。
6. **登录代理**：`proxy.ts` 的公开 API 白名单加了 `/api/invite-codes/[code]/preview`（受邀人登录前看邀请）和 `/api/app/version`（App 启动时、登录前检查最低版本）；其余新接口默认受保护。
7. **App 同步**：`npm run sync:contract`（7 个新契约 + 7 个新 schema + 1 个共用工具 + 6 个契约 / 3 个 schema 的扩展）。App `tsc` 0：`exactOptionalPropertyTypes` 下 `densityCounts` / `addedThisMonth` 需要写成 `?: … | undefined`（契约放宽，快照检查通过）。App 里没有对 `InboxSourceKind` 的穷举 switch（`grep` 全部消费点，见「GitNexus」）。
8. **测试**：
   - orbits：`tests/api/redesign-contract-routes.test.ts`（24 个方法 × mock 成功并过 schema、× live 503 `NOT_IMPLEMENTED` 且响应里没有任何 fixture 字样；409；400 / 404；公开白名单只放两条）、`tests/contracts/demo-world-consistency.test.ts`（每份 fixture 过 schema；人物引用都存在、文本里「○○さん」都是演示人物、联系人行与人物同名同公司、活动标题一致；示例标记；计数一致；R11 过滤）、`tests/contracts/contract-append-only.test.ts`（当前契约 = 快照；四类破坏都失败；新增可选 / 枚举加值 / 放宽 / 新类型都通过；`BREAKING.md` 放行；`@draft` 跳过）、`tests/contracts/not-implemented.test.ts`、`tests/copy-qa/demo-world-copy.test.ts`（演示世界所有日文过 R03 copy-qa 的日文规则）。
   - App：`tests/contract-fixtures-parse.test.ts`（App 自己的同步 schema 解析每份 fixture；「尚未实现」工具）。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 12 组齐全 | ✅（2 / 5 / 6 / 7 / 10 见自定决定 1） | 契约文件头注释；`redesign-contract-routes`；`demo-world-consistency` 第 1 条 |
| 02 正式环境不返回假数据 | ✅ | `redesign-contract-routes` live 分支（503 + `NOT_IMPLEMENTED` + 无 fixture 字样）；`resolveFeatureMode` 在 `NODE_ENV=production` 强制 live（现有 `capability-registry` 测试覆盖） |
| 03 App 能直接用 | ✅ | App `contract-fixtures-parse`、`tsc` 0、`contract-sync` / `compute-sync` |
| 04 演示世界一致 | ✅ | `demo-world-consistency`、`demo-world-copy` |
| 05 只加不改 | ✅ | `contract-append-only`；R08 自己的契约改动对 R07 提交跑同一检查：0 破坏（`contract-diff-vs-R07.txt`） |
| 06 「尚未实现」 | ✅ | `not-implemented`（orbits）、`contract-fixtures-parse`（App） |

### 必需证据子表

| SC | 子断言 | 结论 |
| --- | --- | --- |
| 01 | 扩展现有契约只加可选字段或枚举值；`InboxNotificationDTO`（CRITICAL）所有消费方的检查结果 | ✅ 快照对比 R07 0 破坏；消费方见「GitNexus」 |
| 04 | fixture 日文符合 R03 术语表并通过 copy-qa | ✅ `demo-world-copy`（第一次跑抓到 2 处：笔记里「2 年」的空格，已改；见已知例外 2） |
| 全部 | 两端全量零新增；`tsc` / `typecheck:app` / `lint`；`detect-changes` | 见「基线 → 收口」 |

## 自定决定（用户指示：疑问一律选推荐方案，写明理由）

1. **2 / 5 / 6 / 7 / 10 这五组扩展只交付 fixture，不改现有接口**：这些现有接口（`/api/contacts/page`、笔记、收件箱、偏好、待办）都没有 mock 模式，直接读本地 / 正式库；给它们加 mock 分支等于改旧接口的运行方式（RD-24 骨架不改旧屏、PLANNER「不做真实实现」）。功能 Sprint 接入时直接用 `demo-world/fixtures.ts` 里的 `filterDemoContacts`、`demoNotes`、`demoSecretaryNotifications`、`demoDeliveryPreferences`、`demoTodos`（都过 schema）。
2. **「尚未实现」= `503 SERVICE_UNAVAILABLE` + `context.reason = "NOT_IMPLEMENTED"`**，不新增错误码：`ApiErrorCodeContract` 没有 `NOT_IMPLEMENTED`，加错误码会改共享枚举；现有计划路由已经用这个口径。对标 HTTP 语义（501 是「服务器不支持这个方法」，功能开关未开更常用 503 + 原因）。
3. **mock 状态放内存**（进程重启复原），不写库：PLANNER「示例数据不写库」。
4. **`capability-registry` 不登记**这 7 个 capability：它是开发面板用的粗粒度目录（11 个领域），每个功能 Sprint 做 live 实现时登记更合适；PLANNER 写的是「如需要」。
5. **公开白名单只放邀请预览和 App 版本**：预览只返回邀请人选择共享的字段（契约 4「公开」）；最低版本必须在登录前可读，否则强制升级拦不住旧版本无法登录的情况。对标 App Store 类应用的强更检查。
6. **快照第一次记录在 R08 结束时**（340 个类型，`plan-v2` 除外），同时对 R07 提交的契约目录跑了同一检查，证明 R08 本身只加不改。
7. **虚构公司「湾岸グロース・パートナーズ」改名「臨海グロース・パートナーズ」**：copy-qa 把「湾」当简体字形（日文正字也是「湾」），改检查器属于 R03，演示数据换个名字成本最低。见已知例外 2。
8. **`DEFAULT_HOME_LAYOUT` 放在 `api-schema/home-layout.ts`**：契约文件按约定只放类型（`contract-surface` 要求自包含、无运行时值）。

## 基线 → 收口

| | 基线（R07 收口） | 收口 |
| --- | --- | --- |
| orbits `npm test`（en-US） | 6 条既有失败 | 全量与 R07 收口同一次运行（工作区同时含 R07 与 R08，`orbits-test.log`）：6928 条，R08 的新测试全部通过；失败只有基线 6 条 + R07 那 2 条（已在 R07 修好）。R08 之后改过的文件（`demo-world/index.ts` 改名、两个测试的 `@ts-expect-error`、契约 `| undefined` 放宽）单独重跑：`tests/contracts/`、`tests/api/redesign-contract-routes`、`tests/copy-qa/`、`contract-surface`、`shared-compute` 全过 |
| `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 |
| App `npm test` | 4170 条 / 3 条既有失败 | 4172 条（+2：`contract-fixtures-parse`）/ 同样 3 条（`route-parity` 的 `/start`、`offline-pages-profile-events` 两条） |
| App `tsc` | 0 | 0 |

- **`detect-changes`**（`detect-changes.txt`，工作区同时含用户自己的 `bridge/handoffs.md`）：22 个文件、31 个符号、208 条流程，风险 critical——几乎全部来自 `InboxSourceKind` 扩值（它在收件箱投影、提醒、活动报名等流程的类型路径上）。处理见「GitNexus」：只加了枚举值，所有按来源分支的代码都有兜底，没有生产者写这四种来源。

## GitNexus

`impact-summary.txt`：
- `InboxNotificationDTO` **CRITICAL**（5498，partial）：只给 `InboxSourceKind` 加了 4 个值（`InboxSourceKind` 本身 LOW）。逐个检查按来源分支的消费方：`features/notifications/inbox-record-service-factory.ts` 与 `storage/inbox-source-state-batch.ts` 用 `Partial<Record<…>>` + if 链，未知来源落到 `'unavailable'`；`app/(app)/app/inbox/notification-source-view-model.ts` 只认 `note`；`shared/compute/inbox-local.ts` 不按来源分支；App 的 `inbox-feed.ts` / `relationship-inbox.ts` 读的是另一类 `sourceKind` 字符串（不是这个枚举）。目前没有任何生产者写这四种来源（R13 负责），所以对现有数据零影响。对策：zod 同步扩值 + 契约快照 + 全量回归。
- `InboxDeliveryPreferencesDTO`、`ContactCardSummaryDTO`、`ContactListItemContract`、`NoteContract`、`NoteMentionContract`、`TaskItemContract`：UNKNOWN（类型声明不在调用图里）。文本搜索确认只加了可选字段；App 的 `useContactCardPages.ts` 在 `exactOptionalPropertyTypes` 下报错，已用 `| undefined` 放宽解决（App `tsc` 0）。
- `isPublicApiPath` LOW（唯一调用方 `proxy`）。

## 交接

- **怎么接一个契约的 live 实现**：在 `features/redesign-contracts/service-factory.ts` 给该 capability 加 `live`（或移到自己领域的 `features/<领域>/service-factory.ts`），`handlers.ts` 里对应函数改成调真实服务；路由文件不用动。live 实现之前，生产环境自动是 503 `NOT_IMPLEMENTED`。
- **界面约定**：调用新接口遇到 `isNotImplemented(…)` 为真时**不显示错误**：有合理默认值的用默认（首页布局用 `DEFAULT_HOME_LAYOUT`），没有的隐藏入口（邀请码、活动评估、导出等）。两端都用 `whenNotImplemented(payload, { use: "default", value } | { use: "hide" })`。
- **演示世界人物表**（`shared/mock/demo-world/index.ts`）：渡辺 翔（Nexa Robotics 代表取締役，密度 3）、高橋 美咲（青葉ベンチャーズ パートナー，3）、山本 彩（東都キャピタル，2）、青木 里奈（Kanade AI CTO，2）、小林 誠（丸の内イノベーションラボ，2）、伊藤 直子（株式会社ハルモニア，1）、佐々木 遼（臨海グロース・パートナーズ，1）、鈴木 大輔（北辰製作所，1）、松井 遥（株式会社ソラノテ，2）、岡田 紗希（Sakura Growth Partners，1）。活动：CFO Night Tokyo vol.18、SaaS Summit 2026、ロボティクス起業家ミートアップ。计划「年内に初期顧客を 5 社つくる」。新 fixture 只从这里取人和事，`demo-world-consistency` 会拦住不一致。
- **改契约的流程**：只加可选字段 / 枚举值 / 新类型 → 跑 `node scripts/contract-snapshot.mjs --write`，提交信息以 `contract:` 开头并注明「App 需要同步」，App 侧 `npm run sync:contract`。破坏性改动 → 先在 `shared/contract/BREAKING.md` 登记（日期、id、改动、原因、甲乙同意、App 跟进），再 `--write`。`plan-v2.ts` 在 R22 定稿时去掉 `@draft` 并 `--write`。

## 已知例外

1. **2 / 5 / 6 / 7 / 10 的现有接口在 mock 模式下不会返回新字段**（自定决定 1）；功能 Sprint 用 fixture 开发。
2. **copy-qa 把「湾」列为简体字形**：日文常用字也是「湾」（旧字体「灣」），属于 R03 检查器的误报，登记给 R03 维护者；本 Sprint 用改名绕开，没有改检查器。
