# Sprint R12 — REPORT（加人：入口、名刺スキャン、手入力）

**执行人：** 小雨（甲）的执行会话（主会话编排，四个子任务依次实现），2026-10-11。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)（revision 2）、[add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)（版本 2）。
**证据目录：** `~/orbit-sprint-evidence/redesign/R12/run-01/`（impact、detect-changes、基线与收口日志、真实识别、Web 截图）。
**没有做的事：** 没连 Neon、没部署、没做任何迁移（本 Sprint 不建表）；没有新增付费 AI；名片识别（已上线）本机真实调用 4 次。

## 做了什么

1. **契约（第一天，`33b231ac`，App 副本同提交）**
   - 名片候选 `matchedOn` 加 `'name'`（同名）。同一提交里先把读取端改宽：`tolerantEnum`（未知值读成 `name_organization`）+ 新读取函数 `shared/api-schema/business-card-candidate.ts`（一条候选读不出不影响其余）；Web `use-card-batch` 改用它。快照脚本把「加枚举值」判为破坏，按规矩在 `BREAKING.md` 登记一行后写快照。
   - 新契约 `manual-contact.ts`（手入力保存 / 查重 / 公司联想 / 撤销），请求严格、`outcome` 宽进兜底 `duplicate_review`。
   - `shared/compute`：`contact-density`（D-10）、`card-auto-import`（Web 现有自动导入规则搬出来 + `decideCardAutoAction`；Web `card-batch-model.ts` 两个函数改调它，行为不变）、`contact-name-match`（同名规则）、`signature-split`（签名拆字段）。
2. **服务端（`45cd4f76`）**
   - `applyContactFieldValues`（`features/contacts/contact-field-write.ts`）：按字段覆盖 / 清空，乐观并发（冲突重读，最多 3 次），旧值进联系人记录的 `fieldHistory`（≤50 条）。核对过 `contacts` 的读取方都按键取值、没有键白名单，所以历史放在 payload 里。
   - 手入力四个接口 `/api/contacts/manual`、`/duplicates`、`/organizations`、`/[contactId]/undo`：查重 = 名片规则 + 同名规则，手入力不自动统合；统合逐字段；幂等；建完进计划候补；撤销是墓碑删除并撤掉计划候补（`matching-repository.ts` 只追加 `cancelPendingPlanMatchForContact`）；示例账号写操作 403。
   - v2 名片 `duplicates` 接口追加同名候选（原候选不变）。
   - 收件箱名片批次通知的链接：v2 → `/contacts/new/scan/<id>`，v1 → `/contacts/new/scan`（乙的文件，见「交接」）。
3. **Web（`06ae52a9`）**
   - `/app/contacts/new` 重写为「人脈を追加」页（`AddContactDoors`）：名刺、手入力；招待コード隐藏（开关常量，R15 打开）；その他四张卡在 R16 前仍进旧导入（`?method=contacts|csv|event`，旧组件移到 `_add/legacy-network-import.tsx` 临时渲染）。旧链接：`?job=` → `/scan/<id>`，`?method=scan` → `/scan`。
   - 新页 `/app/contacts/new/scan`（拖放 + はじめての方へ，前 3 次展开）与 `/app/contacts/new/scan/[batchId]`（读取 → 自动进人脈 → まとめて確認 → 完成）。
   - 手入力右侧抽屉（签名粘贴拆分高亮、即时查重、逐字段统合、保存后进详情 + 撤销 Toast）。
   - `useCardBatch` 只追加 `settleCard` 和 `autoPending`；续传让位前缀收窄为 `/app/contacts/new/scan`；壳里加 `ShellToastBridge` 让 Toast 跨页面保留。删除死代码 `business-card-import-client.ts`。
4. **App（`4ea0b583`）**
   - `contacts/new` 重写为「人脈を追加」页 + 同内容的 `AddContactSheet`（放在组件展示页，交 R11）。
   - `contacts/new/scan`：はじめての方へ（前 3 次）、先解释再请求相机权限（被拒 → 设置 / 相册，回到前台自动重查）、表 / 裏连拍（上限 100）、相册多选。
   - `contacts/new/scan/[batchId]`：读取 → 按共享规则自动进人脈（每张只判一次）→ まとめて確認 → 完成。
   - `contacts/new/manual`：只填名字也查重、逐字段统合、撤销、示例账号提示。
   - 新页 `contacts/new/drafts`（待确认草稿，`?eventId=` 参加者取り込み）；活动的「去复核联系人」改指它。
   - 新文案域 `add`（三语 249 条）；路由 4 处登记；旧链接翻译（`batch2/<id>` → `scan/<id>`，v1 `batch/<id>`、`import/<uuid>` → `scan?from=legacy`）。
   - 删除 7 个旧屏、`BusinessCardBatchReviewForm`、`business-card-pending-files`、`contact-acquisition` / `contact-add` 两个 view-model、`api/business-card-import`、4 个旧路由文件和 11 个只测它们的测试文件；三份允许清单删行。

## SC 对照

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 入口 | ✅ | 两端渲染测试（招待 / その他隐藏、草稿计数、`AddContactSheet`）；Web 截图 `web/doors-*`（1440 / 1024 / 390 × 浅 / 深）；App 截图待模拟器走查 |
| 02 名刺拍 / 传 | ✅（App 相机待模拟器确认） | App 渲染测试（指导前 3 次、权限被拒、表裏与「裏なし」）；Web `web/upload-*` |
| 03 读完自动进人脈 | ✅ | 共享规则表驱动（与 Web 原用例一一对应，含 W0015）；两端端到端：4 张（完全相同 / 相似 / 读不出 / 正常含表裏）→ 自动 → まとめて確認 → 完成 = 新加 2、统合 1、读不出 1，人脈实际 +2 |
| 04 まとめて確認与完成 | ✅（有两处界面问题，见「已知问题」） | 两端渲染；Web `web/review-*`、`web/done-*` |
| 05 手入力 | ✅（Web 390 抽屉有版式问题，见「已知问题」） | `manual-contact-v2`、`contact-field-write` 服务测试（含 Postgres 往返）；两端渲染（只填名字查重、逐字段统合、撤销）；Web `web/manual-*` |
| 06 一条管道 | ✅ | 服务测试：手入力进计划候补（并进当天的单张补录任务）；只填名字后拍同名名片 → 查到候选 |
| 07 旧屏与旧链接 | ✅ | 文件已删；允许清单只减；`screen-ownership.md` App 加人 3 行改「已处理」；`initial-route` / `mobile-route-access` 测试覆盖旧链接；收件箱批次通知新地址有断言 |
| 08 真实识别 | ✅ | 见下表 |

## 真实名片识别（本机，已上线的 DeepSeek 两阶段，4 次操作）

用 sharp 画的单卡图（1820×1100），直接调现有 provider（不经过数据库）。结果与图片在 `ocr/`。

| 图 | 耗时 | 输入 / 输出 token | 结果 |
| --- | --- | --- | --- |
| 日文表面（株式会社ミライ精機 / 高山 亮） | 3.0 秒 | 2,531 / 394 | 姓名（日文 + 罗马字）、公司、部门、职位、邮箱、两个电话（TEL / Mobile）、地址、行业全部正确 |
| 英文裏面（同一人） | 3.0 秒 | 2,520 / 349 | 全部正确；职位读成整行「General Manager, Corporate Planning」 |
| 模糊处理过的表面 | 3.1 秒 | 2,531 / 380 | 仍全部读出（`fullName` 空、`nativeFullName` 有值，现有逻辑会取日文名为主名） |
| 非名片照片（色块） | 2.7 秒 | 2,440 / 132 | 全空 + 「There is no text visible」→ 现有逻辑判为读不出 |

按 DESIGN §5.4 的价格（未命中输入 $0.374 / 百万、输出 $1.122 / 百万）合计约 $0.005。

## 自定决定

| # | 事项 | 决定 | 理由 / 对标 |
| --- | --- | --- | --- |
| 1 | Web 不收 PDF | 界面只写 JPG / PNG / WebP / HEIC | v2 管线本来就不收 PDF（旧 v1 才拆 PDF）；不为它改管线 |
| 2 | Web 表 / 裏 | 不自动配对，给「前の名刺の裏にする」手动操作 | 现有 v2 上传区没有自动配对；App 相机按面拍，自动挂到上一张 |
| 3 | 完成页标题人数 | = 新しく追加 + 既存と統合，读不出的不计入 | 与人脈实际变化一致 |
| 4 | 完成页的计划候补 | 没有按批次查的接口，批次完成后只给「プランで見る」链接 | 不为一行文案新开接口；R11 / R24 的接口已能在人脈与计划里看到候补 |
| 5 | 手入力「出会った場所」的活动候选 | 用 `GET /api/events` 前后 30 天的活动 | 没有「我参加过 / 将参加」的专门接口 |
| 6 | 手入力的计划候补 | 并进当天的单张补录任务，不是每人单独一条 | 与单张名片相同；免得每加一个人就多一次 AI 调用 |
| 7 | 示例模式拦截 | 演示账号或请求头 `x-orbit-sample: 1` 时写接口 403 `SAMPLE_READ_ONLY` | 仓库里没有服务端拦截的先例，按最小规则做 |
| 8 | 手入力幂等 | 「可能重复、请用户选」不写回执，用户选「别人」时可带同一键重发 | 没写库的结果不该被重放成最终结果 |
| 9 | 统合时没选的字段 | 只补空着的，不覆盖 | 不选 = 不改 |
| 10 | 「出会い：…」备注 | 写进数据的固定日文，不走多语言 | 它是数据不是界面文字 |
| 11 | App 草稿「破棄」 | 服务端没有丢弃接口，按旧屏做法只在本机隐藏 | 不新增接口；R20 接判断待ち时再定 |
| 12 | App 自动进人脈 | 每张卡只判定一次，用户改过的卡不再自动加入 | 不替用户覆盖他正在改的内容 |
| 13 | App `/start` 路由 | 删掉两条过期 `route-parity` 例外后，暴露出被遮住的旧缺口「Web 有 `/start`、App 没有」；加了跳转路由 `app/start.tsx` → `/profile/onboarding` | README 合回前清单「`/start` 按用户决定（App 以后做引导页）处理完毕」；App 的引导页就是 `/profile/onboarding`，跳过去最小；R28 重写引导时可以换 |
| 14 | 两份 `*-opening.json` | 不改 | 测试锁了它们的 sha256，是开工快照 |
| 15 | `fieldHistory` 放哪 | 放联系人记录 payload | 读取方都按键取值，没有白名单（DESIGN §3.1 的二选一） |

## 基线 → 收口

| | 基线（`5e1c385f`） | 收口（`4ea0b583`） |
| --- | --- | --- |
| orbits `npm test`（连本机 `orbit_test`） | 7041 条，通过 6524，失败 0，跳过 517 | 7184 条，通过 6666，失败 1，跳过 517。失败的是 `notification-discovery-worker-postgres`「saved cloud facts drain in bounded batches」（与本 Sprint 无关；单独重跑两次都通过，是全量并发时共用库的偶发失败，R25 REPORT 里也出现过同一个文件） |
| App `npm test` | 4257 条，失败 1（`route-parity` 两条过期例外） | 3929 条（删了 11 个只测旧屏的文件），失败 0 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 | 0 |
| App `tsc --noEmit` | 0 | 0 |
| `copy:qa` | — | 2153 条，0 问题 |

## GitNexus

- 开工：索引全量重建（`5e1c385f`）。各子任务的 impact 在 `impact-A.md`～`impact-D.md`。
- HIGH / CRITICAL 与对策：
  - `useCardBatch`、`isAutoImportEligible`、`isAutoMergeEligible`（CRITICAL）：签名与行为不变，只把规则搬到共享函数、追加 `settleCard` / `autoPending`；Web `app-card-batch-*` 71 条测试守住。
  - `enrichmentNeedsReview`（HIGH）：不改。
  - `findContactCandidate`（HIGH）：不改，只新增调用方。
  - `batchResultNotification`（HIGH，乙的文件）：只改 href 字面量，投影测试补断言。
  - `resolveSupportedInitialRouteHref`、`detailRouteHref`（HIGH）：只追加分支，非法 id 仍回首页。
  - `acquisitionResultToSummary`（HIGH）：8 个调用方全在被删文件里，随文件删除。
- UNKNOWN 全部文本确认：App 7 个旧屏、`CARD_BATCH_HOST_YIELD_PREFIXES`、`ingestContactCandidateSchema`、`MATCH_REASON`、`domainFor`、Web 入口页。
- 收口 `detect-changes --scope compare --base-ref 82d9a2db`（`detect-changes-close.log`）：186 个文件、2090 个符号、59 条受影响流程、风险 critical。critical 来自 `useCardBatch` 所在流程（预期，对策同上）；统计里含用户自己未提交的 `bridge/handoffs.md`（没有提交）和审计生成文件。

## 已知问题（复核时一起处理）

- Web 批次页的重复对照卡上有两排按钮（「統合する / 別人として追加」选项 + 「統合する / スキップ」），多余。
- Web 手入力抽屉在 390 不是全屏，底部有一条字段标签溢出到抽屉外（截图 `web/manual-390-*`）。
- Web 截图是用测试渲染器在无头 Chromium 里截的，不是 dev server；App 截图待模拟器走查。
- 手入力「出会った場所」选活动时，服务端只存活动 id，不核对这场活动是不是本人参加的。
- 收件箱里已存的旧通知仍是旧地址，靠 App 的旧链接翻译兼容。

## 交接

- **乙（R13 收件箱）**：`features/notifications/inbox-business-projections.ts` 的名片批次通知 href 已改（v2 → `/contacts/new/scan/<id>`，v1 → `/contacts/new/scan`），本 REPORT 代替通知。
- **乙（R14 推送）**：App 推送落地白名单 `notification-model.ts` 需要加 `/contacts/new/scan/*`（提需求，未改）。
- **乙（R11 人脈）**：`AddContactSheet` / `AddContactDoors` 组件可直接在人脈「＋」弹出；`shared/compute/contact-density.ts` 交 R11 接管；联系人记录新增 `fieldHistory`（详情可展示「以前の値」）；`sourceType` 不变。
- **乙（R20 Task）**：待确认草稿当前在 `contacts/new/drafts`；判断待ち接上后这一页可以删。
- **甲（R26 活动）**：`events.ts` 的 `reviewQueueHref` 已改；活动报名码改叫「参加コード」（DESIGN §9 #34）。
- **R28 引导**：App `start.tsx` 跳转到 `/profile/onboarding`；Web 引导与开始指南仍用旧 `card-batch-ui`，允许清单里保留。
- **R15 / R16**：入口开关 `ADD_INVITE_DOOR_ENABLED`（Web）与 App 对应常量；まとめて確認组件可复用。
