# Sprint R08 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `git diff 9e577124..17c449dc`（`17c449dc` 契约 + mock + REPORT），在 `redesign` HEAD `17c449dc` 上复核。
**依据：** PLANNER 修订 1（唯一契约，含 12 组契约表）、GOAL.md。REPORT 只作线索；下面每条结论都是复核人重跑、重读或用探针验证得出的。
**范围外：** R07（Web 外壳）由另一位复核人负责，本文不涉及。

## 结论：有条件通过

主体已经做到，复核人独立核实过：
- **正式环境不返回假数据（SC-02）成立**：
  - 24 个方法在 `ORBIT_MODULE_MODE=live` 下都返回 503 + `context.reason = "NOT_IMPLEMENTED"`；
  - 复核人另用探针设 `NODE_ENV=production` + `ORBIT_MODULE_MODE=mock`，`GET /api/home/layout` 仍返回 503，没有 fixture；
  - live 分支在读 body、调 mock 之前就返回。
- **响应都过校验**：每个 mock 响应出门前都用契约 zod `parse`。
- **App 同步副本逐字一致**：复核人 `diff -r` 了 `shared/{contract,api-schema,compute}` 与 App `src/api/{contract,schema,compute}`，只差 orbits 侧的 `.snapshot.json`、`BREAKING.md`、`README.md`（这三个不同步是预期的）。
- **`isNotImplemented` 判定正确**：
  - App `client.ts` 的失败结果保留了 `success:false` 和 `error.context`，所以能识别；
  - 真正的 503 故障（没有 `reason`）不会被误判。
- **路由参数处理正确**：`await context?.params` 符合 Next 16「params 是 Promise」。
- **公开白名单安全**：`proxy.ts` 的预览正则针对的是已规范化的 `pathname`（`..` 与 `%2e%2e` 在此之前已被解析掉）；末尾带 `/` 的写法不匹配，落到 401，属于安全方向。
- **演示世界人物与设计稿一致**：10 人的姓名、公司与 `app.html` / `web.html` 一一对得上，例外见 m8。
- **快照能拦住 SC-05 点名的四类破坏**，`@draft` 文件变回普通文件或反向变化都会被当作删类型拦下。

但有 **6 条中等问题**：
- **M1**：契约 2 / 5 / 10 的 fixture 不是契约的形状，也没过任何 schema；REPORT 说「都过 schema」与事实不符。
- **M2**：大部分 fixture 没有示例标记，而且多数契约根本没有地方放这个标记。
- **M3**：「新增可选字段 / 枚举值是安全的」这个前提，对已经装在用户手机上的 App 不成立。
- **M4**：快照检查有几处实质漏洞，又有一处误报。
- **M5**：契约 4 / 7 / 8 / 11 的写入侧没定稿。
- **M6**：首页布局 PUT 用同一个 `mutationId` 重试会得到 409，mock 的语义与契约相反。

没有严重问题。

**条件：**
- M1、M2、M5、M6 在 `redesign` 上修完（RD-25）；
- M3、M4 要先由产品负责人定口径（建议见各条），再改检查器，并写进 README 的通用规则。

满足后 R08 视为完成。依赖关系：
- R10（首页）开工前须修 M6；
- R11 / R20 开工前须修 M1；
- 任一功能 Sprint 给已有契约加字段之前，须先定 M3 的口径。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 12 组契约齐全 | ⚠️ 基本达成 | **类型与负责人注释**：12 组都有类型文件，文件头都写了负责人和使用方；新增 7 组都有 zod 和路由。<br>**2 / 5 / 6 / 7 / 10 只交付 fixture**：REPORT「自定决定 1」理由成立（旧接口没有 mock 分支）。但 2 / 5 / 10 的 fixture 不符合契约（M1）。<br>**写入侧不完整**：见 M5 |
| 02 正式环境不返回假数据 | ✅ | 重跑路由测试，live 分支 24/24 通过；`NODE_ENV=production` 探针见上 |
| 03 App 能直接用 | ⚠️ | App `contract-fixtures-parse`、`contract-sync`、`compute-sync`、`api-schema-sync` 全过，`tsc` 0。<br>但 App 解析的只是新增 7 组的 fixture，加上 summary、收件箱、偏好；`demoContactRows`、`demoNotes`、`demoTodos` 没被解析（M1） |
| 04 演示世界一致 | ⚠️ | 人物引用、姓名、公司一致，copy-qa 通过。<br>示例标记只覆盖部分 fixture（M2）；有一处与设计稿不一致（m8） |
| 05 只加不改 | ⚠️ | 四类破坏和 `BREAKING.md` 放行都能复现。<br>探针发现 5 类漏报、1 类误报（M4、m6、m7）；口径本身对已发布的 App 不成立（M3） |
| 06 「尚未实现」处理 | ✅ | 两端测试通过，逻辑经重读确认；App 客户端的结果形状能被识别 |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01 | 扩展现有契约只加可选字段 / 枚举值；`InboxNotificationDTO` 消费方检查 | ✅ 对照 diff 逐行看过，确实只加不改。App 里没有对 `InboxSourceKind` 的 `switch`（复核人 grep 结果为空）。orbits 侧 `tsc` 0，说明没有完整的 `Record<InboxSourceKind,…>` 穷举 |
| 04 | fixture 日文过 copy-qa | ✅ `demo-world-copy` 通过 |
| 全部 | 两端全量零新增、`tsc`、`detect-changes` | ⚠️ 按要求只重跑了 R08 相关测试和两端 `tsc`，没有跑全量；`detect-changes` 只核对了 REPORT |

## 运行时抽查

### 重跑

| 命令 | 结果 |
| --- | --- |
| orbits：`node scripts/run-node-tests.mjs tests/contracts/ tests/api/redesign-contract-routes.test.ts tests/copy-qa/ tests/contract-surface.test.ts tests/architecture/shared-compute.test.ts` | 33 / 33 通过 |
| orbits：`npx tsc --noEmit -p tsconfig.json` | exit 0 |
| App：`node --test … contract-fixtures-parse contract-sync compute-sync` | 9 / 9 通过 |
| App：`api-schema-sync` | 1 / 1 通过 |
| App：`npx tsc --noEmit` | exit 0 |

工作区里另有别的会话未提交的改动（`scripts/run-node-tests.mjs`、`AGENTS.md` 等），不是 R08 的提交内容。上面的测试是在当前工作区跑的。

### 路由探针（scratchpad 里的临时测试，直接调用路由函数，已删除）

| 探针 | 结果 |
| --- | --- |
| `NODE_ENV=production` + `ORBIT_MODULE_MODE=mock`，GET 首页布局 | 503 `NOT_IMPLEMENTED` ✅ |
| `ORBIT_MODULE_MODE=hybrid` | 200，返回 fixture（hybrid 回落到 mock，本地使用时见 m1） |
| 同一个 `mutationId`、同一个 `expectedRevision` 连续 PUT 两次 | 200，然后 **409** → M6 |
| revoke 邀请码之后，再 GET preview 和 current | preview 仍是 200；current 里没有 `revokedAt` → m4 |
| PATCH 评估的 `price`，再 GET | 仍是「無料」，PATCH 没有保存 → m4 |
| 同一个 `idempotencyKey` 创建两次评估 | 得到两个 id（`-2`、`-3`）→ m4 |
| 对不存在的活动 id 调 dismiss | 200 → m4 |
| 没有退会申请时调 DELETE | 200 `data:null` |
| 创建导出 | id 仍是 `demo-export-1`、`queued`；GET 同一 id 却是 `ready` → m4 |

### 快照检查探针（调用 `extractContractShape` / `compareContractShapes`，已删除）

| 改动 | 应当 | 结果 |
| --- | --- | --- |
| 删内嵌对象的字段 `n: { a; b }` → `{ a }` | 拦 | ✅ 拦住 |
| 内嵌对象**加可选字段** `{ a }` → `{ a; b? }` | 放行 | ❌ 报 `changed-type`（误报，M4） |
| 交叉类型别名加可选字段 | 放行 | ❌ 报 `changed-type`（误报，M4） |
| `interface A` → `interface A extends B`（B 有必填字段） | 拦 | ❌ 未拦（M4） |
| `k: string` → `k: string \| null` | 对读取方是破坏 | ❌ 视为放宽（M3 / M4） |
| `k: string` → `k: string \| unknown` | 拦 | ❌ 视为放宽（M4） |
| 泛型参数默认值 `P<T = string>` → `P<T = number>` | 拦 | ❌ 未拦（m7；目前契约里有 6 个泛型类型） |
| 方法签名、索引签名、未导出的辅助类型 | 拦 | ❌ 不记录。复核人扫了现有 54 个契约文件，目前三者都是 0 个，风险是将来（m7） |
| `index.ts` 删一个 re-export | 拦 | ❌ 不记录。目前 App 不从 index 导入（m7） |
| 文件头注释里出现「not @draft」之类的文字 | 不应跳过 | ❌ 整个文件被当成 draft 跳过（m7） |
| zod 里把 `.max(10)` 改成 `.max(5)`，或可选改必填，或新加 `.strict()` | 拦 | ❌ zod 完全不在检查范围内（M4） |
| 枚举少值、可选变必填、删字段、改名、数字字面量枚举少值、对象联合删一支 | 拦 | ✅ 全部拦住 |

## 问题清单

### 严重

无。

### 中等

**M1 契约 2 / 5 / 10 的 fixture 不是契约形状，也没过 schema；REPORT 说「都过 schema」**
- **现象**：
  - `shared/mock/demo-world/fixtures.ts:27-35` 的 `demoContactRows` 只有 7 个字段。`ContactListItemContract`（`contacts.ts:60-95`）有十几个必填字段都缺，例如 `location`、`profileSnippet`、`source`、`evidence`、`tags`、`value`、`status`、`databaseQueryExecuted`；
  - `:173` 的 `demoTodos` 是 `{ id, title, personId, dueDate, deferralCount, sample, personName }`。`TaskItemContract` 的必填字段 `status`、`category`、`priority`、`source`、`createdAt`、`updatedAt` 都没有，`personId` / `dueDate` 也不是契约里的字段；
  - `:82-98` 的 `demoNotes` 多了契约里没有的 `sample`。

  三者都没有类型标注。两端测试都没有解析它们：`demo-world-consistency.test.ts:19-34` 没有，App 的 `contract-fixtures-parse.test.ts` 也没有。
- **证据**：REPORT「自定决定 1」原文：「功能 Sprint 接入时直接用……`filterDemoContacts`、`demoNotes`……`demoTodos`（都过 schema）」，这与代码不符。`fixtures.ts:3` 引用的 `tests/contracts/redesign-contract-fixtures.test.ts` 也不存在。
- **影响**：R11 / R20 拿这些 fixture 开发人脈列表和 To-do，接上真实接口时字段对不上。「同一个人在各处一致」只在演示世界内部成立，与契约之间不成立。SC-01 / SC-03 要求「fixture 通过自己的 schema」，这三组没有做到。
- **建议修法**：
  - 三组都用 `satisfies readonly ContactListItemContract[]`（以及 `TaskItemContract[]`、`NoteContract[]`）补齐字段；
  - 有 zod 的就在两端测试里 parse，例如 `mobile-contacts-dashboard.ts` 的 `contactListItemSchema`；
  - 没有 zod 的（笔记、待办），至少靠 `satisfies` 让 `tsc` 把关；
  - 修正 `fixtures.ts:3` 的注释和 REPORT 的说法。

**M2 示例标记不完整，大多数契约没有地方放这个标记**
- **现象**：
  - 带 `sample: true` 的：人物、活动、笔记、待办、联系人行、补全问题、评估、计划 summary；
  - 没有标记的：`demoHomeLayout`、`demoInviteCode` / `Preview` / `Redeem`、`demoSecretaryNotifications`、`demoDeliveryPreferences`、`demoDismissResult`、`demoAccountExport`、`demoDeletionRequest`、`demoAppVersion`、`demoPlanSummary.score`；
  - 这些对应的契约（`InboxNotificationDTO`、`InviteCodeContract`、`HomeLayoutContract`、`AccountExportContract` 等）没有 `sample` 字段，而 zod 都是 `.strict()`，所以加上标记反而会校验失败。

  `demo-world-consistency.test.ts:59-61` 只检查了已经带标记的那几组，标题却写「every sample record is marked」。
- **影响**：PLANNER 要求「每条示例数据带 `sample: true`，界面据此显示示例角标」。首页秘书组件显示的四条收件箱通知恰好没有标记，界面无法区分示例。
- **建议修法**：二选一，写进 REPORT 交接。
  - 每个新契约和被扩展的 DTO 都加 `sample?: true`（加可选字段，符合「只加不改」），并让测试遍历 `fixtures` 的全部导出；
  - 或者规定以响应头 `X-Orbit-Feature-Mode: mock`（`runtimeBoundaryHeaders` 已经在发）作为界面的示例依据，并删掉「每条带 `sample`」的说法。不能两种口径并存。

**M3 「只加不改」的前提对已发布的 App 不成立：App 用 strict zod 和封闭枚举解析响应**
- **现象**：
  - App 解析响应时用的就是同步来的 schema：`src/screens/settings/NotificationDeliverySettings.tsx:16` 用 `inboxDeliveryPreferencesSchema.safeParse`，`src/view-models/inbox-local.ts:28` 用 `inboxNotificationSchema.safeParse`；
  - 这两个 schema 都是 `.strict()`，`sourceKind` 是封闭的 `z.enum`；
  - R08 新加的 7 个响应 schema 也全部是 `.strict()`。
- **后果**：
  - 已经装在手机上的旧版 App（同步 R08 之前）收到 R14 返回的 `quietStart`，整份偏好会解析失败，设置页读不到数据；
  - 收到 R13 写入的 `event_deadline` 通知，这一条会被丢弃；
  - 同理，检查器把 `string → string | null` 当作「放宽」放行，但对读取方这是破坏：旧版 App 的 `z.string()` 会拒绝 `null`。
- **影响**：快照检查保证了「Web 与当前 App 能编译」，但保证不了「线上旧版本不坏」。R08 的目的是让契约可以安全演进，而 App 有商店审核和用户不升级的滞后，这正是最容易出事的地方。
- **建议修法**（需要产品负责人定口径，对标做法：Stripe / GitHub API 都要求客户端忽略未知字段、容忍未知枚举值）：
  - App 用来解析**响应**的 schema 去掉 `.strict()`（zod 默认会丢弃多余字段）。只有**请求体**保持 strict；
  - 响应里的枚举字段允许未知值，例如 `z.string()` 加已知集合判断，或 `.catch()` 落到兜底分支；
  - 检查器区分请求类型和响应类型的放宽方向：响应字段放宽成 `| null` 算破坏，请求字段收窄算破坏；
  - 或者与 `minSupportedAppVersion`（契约 11）挂钩：凡是旧版本解析不了的变更，必须同时抬高最低版本。

**M4 快照检查的实质漏洞和一处误报**
- **漏报**（见「快照检查探针」表）：
  - 已有接口新加 `extends B`，带进来 B 的必填字段，不报。`contract-snapshot.mjs:85` 只检查基类有没有被删，`:95-97` 只看本体成员；
  - `isWidening`（`:68-72`）把任何「加了联合成员」都当放宽，包括 `| unknown` 和 `| any` 这种实际上抹掉类型的改法；
  - **zod 完全不在检查范围内**：`shared/api-schema` 才是两端运行时真正执行的契约。把 zod 字段改成必填、收紧 `max`、加 `.strict()`，快照都发现不了。而 schema 用的是 `as z.ZodType<X>` / `as unknown as z.ZodType<X>` 强转（例如 `invite-codes.ts:16`、`event-assessment.ts:28`、`account.ts:16`），TS 与 zod 不一致时编译器也不报（m3）。
- **误报**：内嵌的对象字面量（`densityCounts: { 1; 2; 3 }`、`PlanScoreView.byType`、交叉类型别名）只要加一个可选字段，就按整段文本不同报 `changed-type`。这与「新增可选字段通过」的约定相反，会逼着人去 `BREAKING.md` 登记一个其实安全的改动，久而久之大家会把登记当成例行手续。
- **影响**：SC-05 点名的四类破坏都能拦住，但「只加不改」门禁的价值在于覆盖整个契约面。上面这些洞，正是功能 Sprint 最常见的改法。
- **建议修法**：
  - `extends` 新增基类时，把基类的必填字段并入检查；或者干脆改用 `ts.TypeChecker` 展开解析后的属性集（`checker.getPropertiesOfType`），这样同时解决 `extends`、内嵌对象、别名替换的问题；
  - 联合成员里出现 `unknown` / `any` 按破坏处理；
  - zod 侧增加一条「TS ⇔ zod」类型等价测试，例如 `expectTypeOf<z.input<typeof raw>>().toEqualTypeOf<Contract>()`。要做到这一点，需要先导出未强转的原始 schema；
  - 为内嵌对象加可选字段、交叉类型加可选字段补「应当通过」的测试用例。

**M5 契约 4 / 7 / 8 / 11 的写入侧没有定稿**
- **现象**（PLANNER 说本 Sprint 契约「定稿」）：
  - **契约 4**：`POST /api/invite-codes` 没有输入类型。PLANNER 写的「共享字段」「`maxUses ≤10`」都是邀请人要选的，handler（`handlers.ts:45`）不读 body；
  - **契约 11**：`POST /api/account/exports` 没有输入类型，`scope[]` 无从指定（`handlers.ts:87`）；
  - **契约 8**：`add-to-plan` 的响应 schema 写在 `handlers.ts:75` 里，没有进 `shared/contract` / `api-schema`，App 拿不到类型和 zod；
  - **契约 8**：`EventAssessmentCreateInput` 在 `sourceKind: "poster"` 时没有任何字段能传海报（图片或上传 id）。`url` 来源不要求 `url`，`orbit_event` 来源不要求 `eventId`（`api-schema/event-assessment.ts:30-35`）；
  - **契约 7**：`InboxDeliveryPreferencesInput` 没有扩展，它的 zod 是 strict。设置页要写 `quietStart` / `dailyCap` 等新字段，会被 400 拒绝；
  - **契约 5**：`NoteMentionContract`（`notes.ts:1-8`）加了 `entityType: "event"` / `eventId`，但 `contactId` 仍是必填，「提及一个活动」时只能填一个假的联系人 id。离线写入的 mention schema（`api-schema/offline-mutations.ts:9-14`）是 strict，不认这两个新字段。R20 要么破坏性修改，要么带着假 id 上线；
  - **契约 3**：`handlers.ts:17` 自己写了一个 `answerInput`（带 `.trim()`），没有用已导出的 `contactCompletionAnswerInputSchema`，两份规则已经不一样了。
- **影响**：甲乙两条线从第一天起各自开发，前提是契约定稿。写入侧缺的部分，会在功能 Sprint 里被各自补上，到时就是「改契约」，而不是「加契约」。
- **建议修法**：
  - 补 `InviteCodeCreateInput { share: …; maxUses }`、`AccountExportCreateInput { scope }`、`EventAssessmentAddToPlanResult`；
  - 评估输入改成按 `sourceKind` 区分的 discriminated union，`poster` 带上 `assetId`；
  - `InboxDeliveryPreferencesInput` 加上同名可选字段；
  - `NoteMentionContract` 的问题，按 PLANNER「失败与交接」的规则登记给 R20，并在 REPORT 写明；
  - handler 改用导出的 schema。

**M6 首页布局 PUT 用同一个 `mutationId` 重试得到 409**
- **现象**：`mock-service.ts:18-22` 只比较 `expectedRevision`，没有记录 `mutationId`。复核人探针：同一个请求连发两次，第一次 200，第二次 409。
- **影响**：契约 1 要求 PUT 带 `mutationId`，作用就是让网络超时后的重试幂等：第二次应当返回第一次的结果。R10 按 mock 开发，会把「重试得到 409」当成正常流程，写出「409 就重新拉取并覆盖」之类的逻辑。上线后这既掩盖了真冲突，也和后端的幂等实现对不上。
- **建议修法**：mock 记住最近一次成功的 `mutationId → layout`，同一个 id 重放时返回原结果。路由测试补「同一 `mutationId` 重放 = 200 + 同一 revision」。

### 轻微

- **m1 本地开发默认看不到 mock**：`repos/orbits/.env.local` 设的是 `ORBIT_MODULE_MODE=live`，R08 的新接口在本地就是 503，界面按约定隐藏入口。要看假数据只能把整个应用切到 mock，旧屏也跟着变。另外 `hybrid` 会回落到 mock，会给本地真实登录的用户返回示例数据（只有本地会这样，生产强制 live）。GOAL 说「从功能 Sprint 第一天起就能用假数据开发」，建议加一个只在非生产生效的按 capability 覆盖开关，例如 `ORBIT_REDESIGN_MOCK=home-layout,invite-codes`，并写进 REPORT 交接。
- **m2 响应校验失败时返回 500，而且不在信封里**：`redesign-contract-route.ts:30` 的 `schema.parse` 抛出 ZodError 后没人接住，Next 返回裸 500。建议改成 `safeParse`，失败时返回 `failure(INTERNAL_ERROR)`，并记录日志。
- **m3 schema 一律强转成契约类型**：`as z.ZodType<X>` / `as unknown as …` 让 TS 与 zod 的偏差在编译期完全不可见（并入 M4 的修法）。`exactOptionalPropertyTypes` 下只有 `densityCounts` / `addedThisMonth` 写了 `| undefined`，其余新可选字段没写，写法不统一。App 侧以后构造输入对象（例如带可选 `hintDismissedAt`）时会碰到同样的错误，建议定一条统一写法。
- **m4 mock 状态有几处与契约语义不符**（探针见上）：
  - revoke 不保存，revoke 后 preview 和 redeem 仍然成功；
  - PATCH 评估不保存；
  - 创建评估忽略 `idempotencyKey`；
  - 对不存在的活动 dismiss 返回 200；
  - 创建导出返回固定 id，状态和 GET 对不上。

  另外 `layout`、`deletion`、`assessments` 是模块级全局变量，共用一台开发服务器的所有用户互相影响，handler 也完全不读当前用户。这在 mock 下可以接受，但应在 REPORT 写明「mock 状态全局共享、重启复原」。
- **m5 公开预览接口的交接**：`/api/invite-codes/[code]/preview` 不登录就能访问，返回邀请人的姓名和公司。正则本身是安全的，但 R15 做 live 实现时需要限流，并防止按码枚举。建议写进 REPORT 交接给 R15。
- **m6 `BREAKING.md` 放行规则太宽**：`allowedBreaks`（`contract-snapshot.mjs:104-106`）把全文任意位置反引号里带 `::` 的文字都当放行 id，且永久有效：同一个字段以后再被破坏一次也会放行。日期、甲乙同意等列也不检查。建议只解析表格行，要求各列非空，并要求该行日期晚于快照记录的时间（或者放行后由 `--write` 把这条标记为「已消费」）。
- **m7 快照检查的覆盖面**：
  - 泛型参数、方法签名、索引签名、未导出的辅助类型、`index.ts` 的 re-export 都不记录；
  - `isDraftContract` 只要文件头注释里出现 `@draft` 这几个字就整文件跳过（例如「not @draft」）。

  目前契约里只有 6 个泛型类型，其余几类都还是 0 个，所以风险在将来。建议至少给 `index.ts` 的导出名单做快照，`@draft` 只认 JSDoc tag 的形式。
- **m8 演示世界与设计稿有一处不一致**：「湾岸グロース・パートナーズ」在 11 个画板里都出现，演示世界改成了「臨海…」，只是为了绕开 copy-qa 把「湾」误判为简体字。RD-22 要求与设计稿一致，应当修 R03 检查器的误报（「湾」是日文常用字），而不是改演示数据。另外小林 誠的职务在 `b10-plan-example.html` 里是「主宰」，演示世界写的是「ディレクター」。
- **m9 分层与注释**：
  - `features/redesign-contracts/handlers.ts:13` 反向 import 了 `app/api/_shared/redesign-contract-route`，`features` 依赖了 `app` 层（仓库里此前只有一处类似的 type import）。建议把包装函数放到 `shared/api` 或 `features/redesign-contracts` 内部；
  - `fixtures.ts:3` 引用了不存在的测试文件。
- **m10 Next 16 路由类型生成未验证**：路由的签名 `(request, context?: { params?: Promise<Record<string,string>> })` 按逆变规则应当能通过 `next typegen` / `next build` 的路由类型校验。复核人为避免影响并行会话的 `.next` 目录，没有运行，建议执行人在收口时补一次 `next build`（或 `next typegen` + `tsc`）。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 五组扩展只交付 fixture | 合理（不改旧接口的运行方式）。但前提是 fixture 本身符合契约，现在不符合（M1） |
| 2 503 + `reason: NOT_IMPLEMENTED` | 合理，与现有计划路由同一口径，不改共享错误码枚举 |
| 3 mock 状态放内存 | 合理；但幂等和保存语义要对（M6、m4），全局共享要写明 |
| 4 capability-registry 不登记 | 可以接受 |
| 5 公开白名单只放两条 | 合理，正则安全；限流交接给 R15（m5） |
| 6 快照在 R08 结束时首次记录，并对 R07 跑同一检查 | 合理 |
| 7 「湾岸」改名「臨海」 | 不同意，应当修 R03 的误报（m8） |
| 8 `DEFAULT_HOME_LAYOUT` 放在 api-schema | 合理（契约目录不允许放运行时值）；两端都能通过同步副本拿到 |

## 处理记录（执行人，2026-10-10）

全部 M、m 都已处理；M3 的口径和 m1 的开关按「自定决定」原则选了对标成熟产品的做法，列在最后请产品负责人确认。修复后：orbits R08 相关测试 39 + 2 条全过，App 相关 10 条全过，两端 `tsc` 0，`next typegen` + `tsc` 0（m10）。

| # | 处理 |
| --- | --- |
| M1 | `demoContactRows` 补成完整的 `ContactListItemContract`（`satisfies`，来源 / 证据 / 价值 / 状态都按演示人物生成），两端测试用 `contactListItemSchema` 解析（该 schema 改为导出，原本就是 `.passthrough()`）；`demoTodos` 改成 `TaskItemContract`、`demoNotes` 改成 `NoteContract`（`satisfies`，`tsc` 把关）；修正 `fixtures.ts` 头注释和 REPORT 的说法 |
| M2 | 选第一种：内容记录加可选 `sample?: true`（`ContactListItemContract`、`TaskItemContract`、`NoteContract`、`InboxNotificationDTO`、`InviteCodeContract`、`InviteCodePreview`；补全问题 / 评估 / 计划 summary 从 `boolean` 收紧为 `true`），zod 同步；设置类、回执类不带标记，由响应头标明（清单写在测试里）。`demo-world-consistency` 改为遍历 `demo-world` 和 `fixtures` 的全部导出，未登记为「不带标记」的导出必须每条都带 `sample: true` |
| M3 | 口径（建议，待确认）：宽进严出——R08 新增 7 组的**响应** schema 去掉 `.strict()`（多余字段丢弃），**请求** schema 保持 strict；已发布 App 读不了的变更要么先发宽进版本、要么抬 `minSupportedAppVersion`。写进 README 通用规则 10 和 `BREAKING.md`。检查器把 `| null`、`| unknown`、`| any` 和必填字段加 `| undefined` 判为破坏。现存的两个 strict 读取点（`inboxNotificationSchema` 同时用于服务端写入校验，不在骨架里放宽）交给 R13 / R14：启用新来源 / 新字段之前，把 App 的读取改成宽进 |
| M4 | 检查器改用 `ts.TypeChecker` 展开属性（`extends`、交叉类型、内嵌对象与内嵌对象数组都按成员比较；内嵌加可选字段不再误报），记录类型参数、索引签名、调用签名和 `index.ts` 的导出名单；`unknown` / `any` / `null` 不算放宽。新增 `redesign-schema-parity`：在 strict tsconfig 下双向比较 7 组契约与未强转的 zod（`*Object` 导出），并有一条反例证明它能发现偏差。快照按新格式重新记录（345 个类型），对 R07 提交的契约目录用新检查器复查：0 破坏（`contract-diff-vs-R07-reviewfix.txt`） |
| M5 | 补 `InviteCodeCreateInput`（共享字段 + `maxUses` + 幂等键）、`AccountExportCreateInput`（`scope`）、`EventAssessmentAddToPlanResult`（契约 + schema）；评估输入改成按 `sourceKind` 区分的联合（`url` 必带 `url`，`poster` 带 `posterAssetId`，`orbit_event` 带 `eventId`）；`InboxDeliveryPreferencesInput` 加上同名可选字段（zod 同步）；handler 改用导出的 `contactCompletionAnswerInputSchema`。`NoteMentionContract` 提及活动时仍必须带 `contactId`：改成可选会破坏读取方，按「失败与交接」交给 R20（REPORT 交接已写） |
| M6 | mock 记住 `mutationId → 结果`，同一个 id 重放返回第一次的结果（200 + 同一 revision）；路由测试补「重放 200、新 id 才 409」 |
| m1 | 新增非生产开关 `ORBIT_REDESIGN_MOCK`（逗号分隔的 capability，或 `all`）：本地整体是 live 时，只把列出的契约切到演示世界；生产永远 live（测试覆盖）。hybrid 回落 mock 只在非生产出现，已写进 REPORT 交接 |
| m2 | 响应 `safeParse`，不通过时记日志并返回信封里的 500 `INTERNAL_ERROR`，不把数据发出去（测试覆盖） |
| m3 | 并入 M4：parity 检查让 TS 与 zod 的偏差在测试里可见。`| undefined` 写法：只在 App 侧 `exactOptionalPropertyTypes` 报错时加（目前只有 summary 两个字段），已写进交接 |
| m4 | mock 语义按契约：revoke 保存，之后 preview / redeem 404、current 为 null；PATCH 保存；创建评估 / 邀请 / 导出按幂等键重放；不认识的活动 dismiss 404；导出新建返回新 id 且 GET 一致。全局共享、重启复原写在 `mock-service.ts` 头注释和 REPORT |
| m5 | 交接给 R15：公开预览接口上线前加限流和防枚举（REPORT 交接） |
| m6 | `BREAKING.md` 只认完整表格行（日期 `YYYY-MM-DD`、id、改动、原因、甲乙同意、App 跟进都非空），正文里的反引号不算；测试覆盖。放行后 `--write` 让快照不再含旧字段，同一个 id 不会被再次用到 |
| m7 | `@draft` 只认文件头里的 JSDoc 标签（行首）；类型参数、索引签名、调用签名、`index.ts` 导出都进快照（测试覆盖）。未导出的辅助类型通过展开后的属性间接覆盖 |
| m8 | 改回「湾岸グロース・パートナーズ」，修 copy-qa：「湾」不是简体专用字形；小林 誠的职务改为「主宰」 |
| m9 | 包装函数移到 `features/redesign-contracts/route.ts`（删除 `app/api/_shared/redesign-contract-route.ts`），`features` 不再依赖 `app`；修正注释里的测试文件名 |
| m10 | 跑了 `next typegen`（不碰 dev server 的 `.next/dev`）+ `tsc`：0 |

**请产品负责人确认**：M3 的「宽进严出 + 抬最低版本」口径（README 通用规则 10）。

### 产品决定后的处理（2026-10-10）

产品负责人确认 M3 口径（原话：「不用管旧版，软件还没真正发布，可以重新发布的，你就按照正常成熟产品的要求设计方案」）。已落实：
- 响应宽进：新增 `shared/api-schema/tolerant.ts`（`tolerantEnum` / `knownValues`）；R08 的响应 schema 里枚举改为宽进（每个字段写明兜底值），通知偏好 DTO 也改为宽进；
- `inboxNotificationSchema` 拆成读取用（宽进，Web 收件箱 / 首页、App 收件箱读）和 `inboxNotificationWriteSchema`（严格，服务端写入校验 `inbox-record-service.ts`）；App 的两个 strict 读取点现在就是宽进读取，不再留给 R13 / R14；
- 请求体和服务端写入保持严格；检查器继续把 `| null` 等判为破坏；
- `minSupportedAppVersion` 写成首次正式发布后才启用的机制（契约 11 注释、README 通用规则 10、`BREAKING.md`），标注产品负责人已确认；
- 通知的 `kind` 与来源 `sourceKind` 出现未知值时整条跳过（保留 Sprint 0104 / 0122 已定的做法：这类条目无法有意义地显示），列表逐条读（`readableItems`），Web 收件箱也不再因一条读不了而整页失败；缺字段仍然是错误（`tolerantEnum` 只映射未知值）；
- 测试：orbits `tests/contracts/tolerant-reading.test.ts`、App `tests/contract-tolerant-reading.test.ts`；原有的收件箱容错测试（`inbox-notification-tolerance`、`typed-notification-inbox` 等）不变且通过。
