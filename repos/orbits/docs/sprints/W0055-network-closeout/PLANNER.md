# Sprint W0055 — 大目标 4「人脉真分析」收口

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-9、R-15、R-16，配额口径统一）：本轮不产生 App commit，收口时写 Bridge handoff（Web 版本、App 影响、未验证范围）；新用户路径改为经真实名片确认或 W0053 导入入口进入 ≥5 位联系人、等维护任务跑完再验三标签，`--guide-step1` 只留给 W0054；配额按操作计次、成本按 HTTP 子账汇总；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。回填的 AI 调用走系统预算（账本 `pool='system'`，不占用户主动池与后台自动池）；W48-9 的生产开关与生产迁移在本 Sprint 收口时一并请求授权（不执行）。

**Plan revision:** 3。**模式:** existing-codebase / single-generator（收口型：少量脚本与删除，其余为验收证据）。运行状态只在登记表。
**原需求:** RN-13（限流回填脚本与本地验证；删除 `features/contact-needs` 的 web 用途；死代码清理；全量对照；3001 两条路径 1440／375 截图）。D41～D43、D39。
**单一目标:** 回填脚本可安全预演与在本机执行；网页端死代码与关键词需求匹配的 web 用途清零而手机端接口不动；用全量对照、GitNexus 变更对照、两条真实路径和读取总账证明成功标准 A／B／C 成立；写一份 Bridge handoff 记录大目标 4 对 App 的影响（本轮不产生 App commit，R-9）。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 大目标 4 开工 SHA = W0043 开工前的 `chat-agent` HEAD（W0043 REPORT 记载；编制时 `chat-agent` 为 `4ac5a6dc`，GitNexus 索引 `a48e1749`）；对照目标为 W0054 合并后的 `chat-agent` HEAD（开工时记录）。
**进入条件:**
- W0043～W0054（含 W0048a、W0048b）在登记表均为 completed（登记表依赖），各自合并 SHA 已记录。
- 各 REPORT 的接口以 REPORT 为准——Generator 开工时**只摘**：W0045 补全回填入口、W0047 强度重算入口、W0048a 快照生成入口、三层更新入口 `runNewContactLayers` 与账本 `reserve／beginCall／endCall／finish`（`pool: "system"` 用法；按操作计次、子账记 HTTP）、各 REPORT「App 影响」节、W0048b 的生产切换清单（环境变量与迁移）、W0051 洞察生成入口、W0050 是否已移除网页端对 `/api/contacts/needs-matches` 的使用、W0051 是否已改过 `network-all.tsx` 的筛选区、W0054 的门槛与示例选择器、各 Sprint 新增读取的实测字节与次数、真实 AI 调用次数与 token。不复核实现。
- W55-1～W55-6 已定（D44，见文末）。
- 本机 `localhost:5432` 测试库可用（`node scripts/assert-local-test-databases.mjs`）；3001 验收 server 可启动；本机 DeepSeek 已配置（W55-4 选真实调用时）。回填脚本的**生产执行不在本 Sprint**，届时单独授权。

## 已查清的事实（2026-10-01 按 `4ac5a6dc` 复核）

1. **`features/contact-needs` 与 `/api/contacts/needs-matches`。** 网页端页面与客户端代码当前 **0 处**调用该接口（`rg -n "contacts/needs|needsMatches|ContactNeeds" 'app/(app)'` 无结果）；服务端只有路由本身 `app/api/contacts/needs-matches/{route,handler}.ts`。**手机 App 在用**：`repos/orbit-app/src/api/endpoints.ts:36` `contactNeedsMatches: "/api/contacts/needs-matches"`、`src/screens/contacts/ContactNeedsMatchesScreen.tsx`（`src/data/offline-read/route-domain-inventory.ts:23、237`）。另外 `features/notifications/discovery/qualification-policy.ts:1` 从 `features/contact-needs/scoring` 引 `criteriaForNeed`（GitNexus：`criteriaForNeed` LOW，调用方 `scoreContactsForNeed`、`discoveryPrefilter` → `runActor`）。所以**模块和路由都不能删**，「删除 web 用途」= 证明并锁住网页端 0 使用（W55-1）。W0050 可能已改动相关代码，开工时以其 REPORT 为准再扫一次。
2. **死代码核实（文本搜索 + GitNexus，`a48e1749`）。** 下列文件在 `app`／`features`／`shared` 内**没有任何生产引用**（GitNexus 对其导出组件均为 UNKNOWN／0 调用方，文本搜索只命中测试与审计脚本）：
   - `app/(app)/app/contacts/contact-industry-editor.tsx`（94 行）
   - `app/(app)/app/contacts/business-card-capture-workspace.tsx`（1026 行）
   - `app/(app)/app/contacts/orbit-cards-interactions.tsx`（53 行）
   - `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-command-center.tsx`（782 行；同目录其他文件仍被页面使用，不删）
   - `app/(app)/app/contacts/ingest-v2/business-card-ingest-v2-start.tsx`（393 行）、`business-card-ingest-v2-view.tsx`（1269 行）
   - `app/(app)/app/contacts/orbit-crm-sidebar.tsx`（142 行）——**唯一引用方** `orbit-real-cards-dashboard.tsx:14`，而后者（441 行）本身也没有任何路由引用（`OrbitRealCardsDashboard` 只被测试引用）。
   - **连带孤儿**（删除上面的文件后变成 0 引用）：`ingest-v2/business-card-batch-view.tsx`、`ingest-v2/ingest-v2-upload-feedback.ts`（只被 `business-card-ingest-v2-view.tsx` 引用）。`ingest-v2-client`、`ingest-v2-copy`、`ingest-v2-private-image`、`ingest-v2-route-view-model`、`ingest-v2-content-transport` 仍被 `card-batch-0918/*`、`network-import.tsx`、`use-pending-cards.ts` 使用，**不删**。
3. **引用这些文件的测试与脚本（删除时要同步处理）。** `tests/pages/app-contact-industry-editor.test.tsx`、`app-business-card-capture-workspace.test.tsx`、`app-business-card-ingest-v2-pairing.test.tsx`、`app-business-card-ingest-v2-view.test.tsx`（整文件只测被删代码）；`tests/pages/app-contacts-subroutes-live-route-services.test.ts:53–80`（读 `orbit-crm-sidebar.tsx`、`orbit-cards-interactions.tsx` 源码的两条用例）、`tests/pages/core-product-ux-optimizations.test.ts:96–105`（读 sidebar 源码）、`tests/pages/app-contacts-dashboard-account-scope.test.ts:126–145`、`tests/pages/app-contacts-primary-industry.test.tsx`（渲染 `OrbitRealCardsDashboard`）、`tests/ui/orbit-global-ask-pinned-bar.test.ts:7–8、29–37`（第二条用例读两个 v1／v2 审阅视图源码；第一条只测悬浮球样式，保留）。审计门禁 `tests/audits/full-product-functional-audit.test.ts:1396、1409–1411` 与 `scripts/generate-full-product-functional-audit.mjs` 以 `file:line` 记录这些文件——门禁对**源文件已删除**的键自动归为退役（1463–1466 行 `existsSync` 判定），删除不会让门禁变红；`KNOWN_UNRESOLVED_LINE_ANCHORED_EVIDENCE_KEYS` 里这几条可以顺手删（名单只许变短）。审计测试有固定失败基线（记忆：4 项），以全量对照为准。
4. **「所有人脉」假筛选。** `app/(app)/app/contacts/network-0918/network-all.tsx:50–53` 的「来源／关系状态／行业／排序」四个 `<label>` 只显示固定文字，没有任何交互（真正的来源筛选是下面的来源卡片 55–65 行）。RN-09（W0051）要在本页加档位筛选、换列；开工时以 W0051 合并后的版本为准，删掉仍然不可交互的筛选框，可交互的保留。GitNexus：`NetworkAll` LOW（调用方 `AppContactsPage`、`AppContactDetailPage`）。
5. **验收账号。** `scripts/seed-verify-accounts.ts`：`verify-new`（0 联系人、新用户）、`--reset verify-new --guide-step1` 补 3 位已确认联系人（不调识别 AI）；`verify-plan` 5 位、`verify-legacy` 4 位……**没有 50+ 联系人且有跟进记录的账号**（`contactFixtureIndexes` 最多 8 个夹具）。W0054 之后第 1 步不能再跳过。`--guide-step1` 直接注入 3 位联系人、绕过名片确认与导入的写入触发点（W0051 洞察 dirty、W0048a 三层入口），**只用于 W0054 的无付费门槛测试，不能证明成功标准 A**（R-15）；本 Sprint 的新用户路径改为经真实入口进入 ≥5 位联系人（见 SC-04）。名片样本只有 `docs/designs/arranged_meishi.heic`、`random_meishi.heic` 两张合照，能否确认出 ≥5 位以实测为准，不足则用 W0053 CSV 导入补足。数据库围栏：`scripts/lib/verify-database-target.ts` 的 `assertVerifyDatabaseTarget()`（`VERIFY_EXPECTED_DATABASE_NAME = "orbit_newui_events_20260922"`、`VERIFY_EXPECTED_WORKSPACE_ID = "workspace:orbit-small-staging-20260917"`）。
6. **回填脚本的既有写法。** `scripts/migrate-contact-primary-industries.ts`：默认预演、`--apply` 才写、按 `--email` 选账号、`loadLocalEnv()`。W0045 已登记「老联系人回填脚本」（补全阶段），本 Sprint 的脚本是**编排**：按 补全 → 强度 → 洞察 → 快照 顺序调用 W0045／W0047／W0051／W0048a 交接的入口，不重写各阶段逻辑；所有 AI 调用以 `budget: "system"`／`pool: "system"` 记账（W55-5），不计入任何用户池；每批仍是 1 次操作、每次 HTTP 一条成本子账，`--max-ai-calls` 按子账的 HTTP 次数计。
7. **全量对照的先例。** W0039／W0034：`git archive` 导出两个 SHA 到仓库外临时目录对称运行，排除 `tests/pages/event-registration-readback.test.tsx`，不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，不 source `.env`，跑完删副本；跨多个 Sprint 不能用 RULES §5.2 的 `git stash` 法。
8. **读取总账（D39）。** 判定线 1.6 GB；最近一张表在 W0037 REPORT「数据库月预算」：基线 1,106.83 MB，三档合计 1,222.78／1,282.63／1,761.38 MB（10%／20%／100% 无目标用户占比）；W0040（首页资料建议跳过）的实测变化以其 REPORT 为准。口径：W0017 返回行 JSON 字节 × 次数 × 用户数。
9. **GitNexus。** 收口前在合并后 HEAD 上 `node .gitnexus/run.cjs analyze --index-only` 刷新，再 `node .gitnexus/run.cjs detect-changes --scope compare --base-ref <大目标 4 开工 SHA> --repo .`（在 `/Users/li/work/orbit` 运行）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- 本目录 GOAL.md、`../REQUIREMENTS.md` 大目标 4 整节（成功标准 A／B／C 与共享契约，验收口径以它为准）。
- W0043～W0054 的 REPORT：**只摘**进入条件列出的入口、选择器、读取实测与 AI 记录。
- `scripts/migrate-contact-primary-industries.ts:95–190`（预演／`--apply` 写法）、`scripts/seed-verify-accounts.ts:58–170、960–1200`（账号表、`--reset`、`--guide-step1`、指纹）、`scripts/lib/verify-database-target.ts`、W0045 的补全回填脚本（以 REPORT 路径为准）。
- `app/(app)/app/contacts/network-0918/network-all.tsx`（W0051 合并后版本，全读）。
- `features/contact-needs/DESIGN.md`、`app/api/contacts/needs-matches/handler.ts`（只改头注释）。
- 事实 3 列出的测试文件（只读要删／改的用例）、`tests/audits/full-product-functional-audit.test.ts:1380–1500`。
- `scripts/run-node-tests.mjs`（`npm test` 入口，确认排除参数写法）。

### 关键符号与影响等级（GitNexus，索引 `a48e1749`，2026-10-01；开工时在新索引上重跑）
- 要删除的导出：`CrmSidebar` LOW（唯一调用方 `orbit-real-cards-dashboard.tsx` 内 `AppShell` → `OrbitRealCardsDashboard`）；`OrbitRealCardsDashboard`、`ContactIndustryEditor`、`BusinessCardCaptureWorkspace`、`OrbitCardsInteractions`、`AppContactsCommandCenter`、`BusinessCardIngestV2Start`、`BusinessCardIngestV2View`：**UNKNOWN**（0 调用方）——按 CLAUDE.md 不当作安全，已用文本搜索补查（事实 2、3），开工时再跑 `rg` 一次作为删除前证据。
- `NetworkAll({ viewModel, initialSource, openDetail })`：LOW（`AppContactsPage`、`AppContactDetailPage`）。只删不可交互的筛选标签。
- `criteriaForNeed(goal: string): CriterionDefinition[]`：LOW，但有通知发现的生产调用方——**不改**。
- `createContactNeedsService`：LOW（`createConfiguredContactNeedsService` → 路由）——**不改**。
- 回填编排调用的各阶段入口（W0045／W0047／W0048a／W0051 交接的函数）：只调用不修改；若必须修改，先 impact，HIGH／CRITICAL 停下另开 Sprint。

### 前序交接要点
- W0043：调试英文清零、empty 显示真实空态。W0044：跟进时钟按请求时刻。W0045：`seniority`、规范地区、`origin` 字段与补全回填脚本。W0046：聚合时间线、memo 单一写入。W0047：强度档 `tier`／`dormant`／`signals[]`，管线按档位。W0048a：`NetworkAnalysisSnapshot`、`sourceDataVersion`、三层更新入口、两池配额账本（按操作计次、成本按每次 HTTP 一条子账；用户主动池：手动重新分析每天 ≤3 次、计划生成、单人洞察重新生成，总熔断每人每东京日 10 次操作——已定（D45，2026-10-02）；后台自动池：memo 提取、洞察批量、导入补全、快照自动重算、季度补细，每人每东京日 60 次操作、≤20 人／批，超限顺延显示「明天更新」；回填用 `system`）。W0048b：计划接 DeepSeek、读取路径 0 调用、老模板计划 AI 重新生成、生产开关清单。W0049～W0051：结构／机会／洞察三标签、`ContactInsight`、列表洞察列与档位筛选。W0052：驾驶舱读快照。W0053：CSV／vCard／活动导入与去重。W0054：第 1 步满 3 张、完成闩锁、门槛卡、示例静态快照；`--guide-step1` 只是 W0054 的无付费门槛测试捷径，本 Sprint 新用户路径不用它（R-15）。
- W0016／W0018：3001 `preview_start {name:"orbits-verify"}`，浏览器用 `http://127.0.0.1:3001`；`verify-session-cookie.ts <账号>`；`--reset`／`--fingerprint`／`--summary`；`next-env.d.ts` 被改不提交。

### 易错边界（都对应到 SC）
- **手机端接口一行不动**：`app/api/contacts/needs-matches/**`（头注释除外）、`features/contact-needs/**`（DESIGN.md 除外）、`app/api/mobile/**`、`shared/compute/**` 在本 Sprint diff 里为空；`repos/orbit-app` 不改。（SC-02）
- **删除必须 0 引用**：每个被删文件删除前后各跑一次 `rg`，删除后 `app`／`features`／`shared`／`tests`／`scripts` 内 0 命中（审计脚本里的历史 `file:line` 证据键除外，逐条说明）；`npx tsc --noEmit -p .` 通过。（SC-02）
- **回填默认不写、默认不连生产**：不加 `--apply` 时 0 写入、0 AI 调用；脚本启动时断言目标库，非本机库直接拒绝（生产执行需要后续单独授权时再加显式开关与授权记录，本 Sprint 不实现「连生产」路径）；`origin=user` 的补全值永不覆盖；第二次执行 0 写入、0 AI 调用（按 `sourceDataVersion` 判定）；超过 `--max-ai-calls` 立即停在检查点；回填的账本行全部 `pool='system'`，目标账号两池当日用量不变。（SC-01）
- **验收不碰真实数据**：只操作 `verify-*` 账号，结束后 `--reset`，`--fingerprint` 前后一致；浏览器本地键（「今天先不做」等）验完清掉；导入用 CSV 只含虚构数据。（SC-04、SC-05）
- **成功标准 A 走生产链路（R-15）**：新用户 ≥5 位联系人必须经真实名片确认入口或 W0053 批量导入入口进入（触发 W0048a 三层入口与 W0051 洞察 dirty），不用 `--guide-step1`；等维护任务（`contact-insights`、`network-snapshot`）跑完、dirty 行与 job 清空后再验三标签。（SC-04）
- **不产生 App commit（R-9）**：App 影响只写进 Bridge handoff；本 Sprint diff 不含 `repos/orbit-app`。（SC-02、SC-05）
- **全量对照看新增失败，不看全绿**；两份副本对称运行。（SC-03）

## 范围与文件

- **新建：** `scripts/backfill-network-analysis.ts`（编排脚本）及 `tests/scripts/backfill-network-analysis.test.ts`（或放 `tests/services/`，按仓库惯例）；网页端 contact-needs 源码门禁测试（可并入既有 `tests/pages/` 源码门禁文件）。
- **新建（Bridge，R-9）：** `bridge/2026-MM-DD-network-real-analysis.md`（按 `bridge/templates/handoff.md` 格式，日期取收口当天）。`bridge/handoffs.md` 队列行：开工时若该文件仍有用户未提交改动（RULES §4），**不编辑、不暂存**，把要加的一行原文写进 REPORT 交协调者；否则只追加一行并只暂存这一路径。
- **修改：** `scripts/seed-verify-accounts.ts`（W55-3 新增 `verify-network`）；`app/(app)/app/contacts/network-0918/network-all.tsx`（删假筛选）；`features/contact-needs/DESIGN.md`、`app/api/contacts/needs-matches/handler.ts`（只改注释）；事实 3 的混合测试文件（只删对应用例）；`tests/audits/full-product-functional-audit.test.ts` 的已知名单（可选，只许删）。
- **删除：** 事实 2 的 8 个文件 + 2 个连带孤儿（W55-2），以及只测它们的 4 个测试文件。
- **证据：** `~/orbit-sprint-evidence/web/sprint-W0055/run-01/`。
- **排除：** 回填脚本的生产执行、部署、push；`/api/contacts/needs-matches` 与 `features/contact-needs` 的删除；App 端；任何 HIGH／CRITICAL 符号的行为修改；新功能。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0055-01 | **回填脚本。**对 `verify-network` 依次跑 预演 → `--apply` → 再次 `--apply`：预演 0 写 0 调用，首次按 补全 → 强度 → 洞察 → 快照 写入，第二次 0 写 0 调用 | 脚本测试（mock provider 与内存 store，先 RED） |
| SC-W0055-02 | **清理与 App 接口不动。**删除事实 2 的 8 个文件与连带孤儿后，各文件基名在 `app features shared tests scripts` 内 0 命中，App 用的接口与共享计算目录 diff 为空 | 删除前后 `rg` 原样输出 + `git diff --stat` |
| SC-W0055-03 | **全量对照与变更对照。**大目标 4 开工 SHA 与合并后 HEAD 两份 `git archive` 副本对称跑 `npm test`，`comm -13` 新增失败为 0 | `full-base.txt`、`full-head.txt`、`fail-new.txt` |
| SC-W0055-04 | **两条真实路径（成功标准 A／C，R-15）。**①新用户 `verify-new`：`--reset` → 经真实名片确认入口或 W0053 CSV 导入入口进入 ≥5 位已确认联系人 → 设目标 → 生成计划（真实调用）→ 跑完维护任务 → 人脉三标签都有针对目标、带依据的内容；②老用户 `verify-network`（回填后）各页按新设计呈现 | 两条路径截图（1440／375）与网络记录（`~/orbit-sprint-evidence/web/sprint-W0055/run-01/`） |
| SC-W0055-05 | **总账、AI 汇总、Bridge handoff 与收口纪律。**把各 Sprint 实测读取汇总进 D39 表、全部真实 AI 调用汇总一张表，并写好 Bridge handoff 记录 App 影响（R-9） | REPORT 总账表 + `bridge/2026-MM-DD-network-real-analysis.md` |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 预演只输出每阶段将处理的联系人数与预计 AI 操作数／HTTP 数，store 写入 0、AI provider 调用 0 | 脚本测试、本机预演输出 |
| 01 | `origin=user` 的值不被覆盖；`--max-ai-calls`（按子账 HTTP 次数）到上限即停并写检查点，续跑从检查点继续 | 脚本测试 |
| 01 | 目标库不是本机验收库时启动即拒绝 | 脚本测试 |
| 01 | 在 3001 本机库对 `verify-network` 实跑后，该账号三标签与洞察有内容 | 两次 `--apply` 输出、截图 |
| 01 | 回填写入的账本操作行全部 `pool='system'`，账号用户主动池与后台自动池当日用量为 0；调用次数与 token 从子账聚合记入 REPORT | 账本查询输出 |
| 02 | `network-all.tsx` 不再有不可交互的筛选标签（剩下的筛选都能改变列表） | `tests/pages/app-network-all.test.tsx` 新增断言 |
| 02 | 网页端对 `features/contact-needs` 的 import 与对 `/api/contacts/needs-matches` 的请求为 0，有源码门禁测试锁住 | 门禁测试 |
| 02 | `git diff --stat <开工 HEAD>` 中 `app/api/contacts/needs-matches/`（头注释除外）、`features/contact-needs/`（DESIGN.md 除外）、`app/api/mobile/`、`shared/compute/` 为空；`repos/orbit-app` 无改动（R-9） | `git diff --stat` |
| 02 | `tests/api/contact-needs-route.test.ts`、`tests/services/contact-needs.test.ts` 原样通过；受影响测试文件全过、`npx tsc --noEmit -p .` | 命令输出 |
| 03 | 排除 `event-registration-readback`、不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`、不 source `.env`；变绿与跳过数变化逐条说明 | `fail-new.txt`、`typecheck.txt` |
| 03 | 刷新 GitNexus 后 `detect-changes --scope compare --base-ref <开工 SHA>` 不是 `partial`／`truncated`，受影响符号与执行流逐项落在 W0043～W0055 各 REPORT 声明的范围内，范围外逐条解释或登记后续 | `detect-changes.txt`、符号 → Sprint 对照表 |
| 04 | 新用户路径不使用 `--guide-step1`；≥5 位联系人的进入方式（名片确认或 CSV 导入，虚构数据）与确认数写进 REPORT；进入后能看到 W0051 洞察 dirty 行与 W0048a 三层入口被触发 | 网络记录、数据库查询输出 |
| 04 | 验三标签前 `contact-insights`、`network-snapshot` 维护任务已跑完：该账号 `contact_insights` 无 `dirty_at` 非空行（或剩余行为「明天更新」并如实记录）、`network_analysis_jobs` 无该账号行 | 数据库查询输出 |
| 04 | 新用户三标签无调试英文、无「来源暂时不可用」误报（成功标准 B） | `get_page_text` 检索输出 |
| 04 | 老用户 `verify-network`：管线按 新认识／有往来／核心／待唤醒 分组、结构四维分布与目标高亮、机会覆盖度「已有 a／还缺 b」与待唤醒、洞察可按档位筛选、详情弹窗时间线每条标来源、「所有人脉」有档位列与洞察一句 | 截图 |
| 04 | 两条路径 1440 与 375 各截图、控制台 0 错误、中英切换各抽查一屏；AI 调用次数与 token（子账聚合）；结束后两个账号 `--reset`，`--fingerprint` 前后一致，`--summary` 存证 | 控制台日志、指纹前后 |
| 05 | W0043～W0054 REPORT 实测的新增读取（含 W0048b 三类读流量、W0054 门槛计数、W0048a 快照读取、W0051 洞察读取等）与本 Sprint 两条路径的实测，按 W0017 口径汇总进 D39 表（10%／20%／100% 三档、与 W0037／W0040 最新合计衔接）；季度维护等后台读取单列；超过 1.6 GB 按 W55-6 登记 D32 | REPORT 总账表 |
| 05 | 全部真实 AI 调用汇总一张表：按 Sprint、按场景（计划／季度补细／快照／洞察／memo 提取／导入补全／名片识别）、按池（用户主动／后台自动／system／名片识别不入账），操作数与 HTTP 数、token 分列 | REPORT AI 汇总表 |
| 05 | **R-9**：Bridge handoff 含 Web 版本、App 影响（`shared/*` 改动与 optional 字段清单、App 副本校验测试预期状态、`needs-matches` 保留、C-6 与 W0044 观察项）、未验证范围、下一责任方与关闭条件；`bridge/handoffs.md` 有用户未提交改动时不编辑不暂存，队列行原文写进 REPORT | handoff 文件、`git status --short` |
| 05 | 本 Sprint diff 只含白名单（含新 handoff 文件）；未提交的用户文件未被暂存 | `git diff --stat`、`git status --short` |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0043～W0054 含 W0048a／b completed；W55-1～6 已定），记录开工 SHA、合并后 HEAD、Planner 哈希、`git status`、seed `--fingerprint`；摘 REPORT 接口与实测；对要删的导出和 `NetworkAll` 在新索引上跑 impact、删除前 `rg` 存证。
2. 先启动全量对照的基线副本（耗时长，可与后续步骤并行，但不与 3001 争用同一测试库写入时段）。
3. RED → 实现：回填编排脚本与测试；`verify-network` 种子（W55-3）；源码门禁测试。
4. 删除死代码与对应测试、删假筛选、改注释；跑受影响测试文件与 tsc；一条操作链提交（`detect-changes --scope staged`，`partial`／`truncated` 重跑）。
5. 3001：本机回填预演与两次 `--apply`（`verify-network`）→ 新用户路径（≥5 位经真实确认或导入入口进入 → 设目标 → 生成计划 → 跑完 `contact-insights`／`network-snapshot` 维护任务，R-15）→ 两条路径截图 → 恢复账号与指纹；刷新 GitNexus 跑 compare；跑合并后 HEAD 的全量副本并对照。
6. 写 Bridge handoff（R-9，见「失败与交接」）与 REPORT（结果、SHA、SC 表、总账与 AI 汇总、问题清单、证据路径）；交接分支 `sprint/W0055-network-closeout` 与固定 SHA，由协调者合并、登记 completed，并在 README 把大目标 4 标为完成。

## 最小测试与检查

- **档位：I（集成收口）。** RULES §1.1「一个大目标全部合并后再跑一次全量」与 §5.1 I 档；本 Sprint 自身的脚本与删除按 L 处理（删除的导出均为 0 调用方，`NetworkAll` LOW），不另做 Codex 代码 review（若 W55-3／回填编排触及 HIGH／CRITICAL 符号的修改，停下另开 Sprint）。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`）：** 回填脚本测试、源码门禁测试、`tests/pages/app-network-all.test.tsx`、事实 3 的混合测试文件、`tests/api/contact-needs-route.test.ts`、`tests/services/contact-needs.test.ts`、`tests/audits/full-product-functional-audit.test.ts`（与基线失败清单对照）。
- **全量：** 一次，按 SC-03 对称副本法；这是本 Sprint 唯一的全量运行。
- **浏览器：** 3001 两条路径 × 1440／375。
- **不运行：** 生产回填、Preview、PG 差分、App 端测试（App 端未改，依据：`repos/orbit-app` diff 为空）。

## 失败与交接

进入条件缺项则不启动。全量出现新增失败：先确认是否偶发（只重跑该文件两次）；稳定复现则定位到所属 Sprint，小问题（文案／样式、非 HIGH／CRITICAL）在本 Sprint 内修并登记，否则记 failed 并建议新 Sprint。路径验证不过同理。REPORT 写：W55-1～6 的执行结果；回填脚本用法与生产执行建议（分档、预计调用数与 token、需要的授权）；删除清单与 `rg` 证据；总账与 AI 汇总；两条路径截图路径；账号恢复与指纹结果。回填脚本的生产执行作为「等待用户决定」登记到 README，不在本 Sprint 执行。**Bridge handoff（R-9）**：交接记录写明 ①Web 版本（大目标 4 合并后 `chat-agent` SHA、各 Sprint 合并 SHA）；②App 影响：W0043～W0054 改动的 `shared/contract`／`shared/domain`／`shared/compute`／`shared/api-schema` 文件与新增 optional 字段（汇总各 REPORT「App 影响」节，至少含 W0045 补全字段、W0046 时间线契约、W0047 `relationshipTierDistribution` 与强度契约、W0051 `ContactInsight` 与卡片 DTO 可选字段），App 端副本校验测试（`repos/orbit-app/tests/{contract,api-schema,compute,domain}-sync.test.ts`）在 App 执行 `npm run sync:contract` 前的预期状态，`/api/contacts/needs-matches` 保留给 App（W55-1），App 本地计算仍无真实强度（C-6）、`shouldNormalizeTaskToToday` 把逾期显示为今天（W0044 观察项）；③未验证范围：App 端界面、App 测试与 typecheck 本轮均未运行；④下一责任方：App 线，关闭条件：App 同步契约并通过其测试后由协调者标 `verified`。**W48-9 生产切换一并登记请求授权（不执行）**：生产迁移（W0048a 三表、W0051 `contact_insights`、W0053 两张导入表）、生产环境变量 `ORBIT_PLAN_GENERATOR=ai`、`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`，顺序为先迁移再开开关，与回填分档（内部账号 → 小比例 → 全量）同一张授权清单。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W55-1 | contact-needs 模块与路由保留给 App（通知发现也引用 `criteriaForNeed`），网页端只证明并锁住 0 使用：确认 0 使用、加源码门禁测试、在 `DESIGN.md` 与 `handler.ts` 头注释写明「仅供 App，Web 已改用计划匹配器（RN-08）」 | Stripe／GitHub 下线接口：先停自家前端的使用，接口为现有客户端保留到迁移完成再按版本下线 |
| W55-2 | 清单外连带死代码一并删（`orbit-real-cards-dashboard.tsx`、`ingest-v2/business-card-batch-view.tsx`、`ingest-v2/ingest-v2-upload-feedback.ts`）；只测被删代码的测试整文件删，混合文件只删对应用例；删前确认被删断言保护的行为另有覆盖，REPORT 列对照 | Linear、Notion：删功能连同专属测试一起删，删前确认行为覆盖迁到现行实现 |
| W55-3 | 种子脚本新增 `verify-network`：D2 老用户、有目标与计划、55 位确定性联系人、30 条 memo、10 条已完成跟进、同场活动与日程约见，四档都有；随 `--reset`／`--fingerprint`／`--summary` 工作；已有同类账号则复用 | HubSpot 沙箱、Salesforce 全量沙箱用接近真实规模和分布的种子数据做发布验收 |
| W55-4 | 两条验收路径与本机回填各用真实 DeepSeek 跑一次（计划、快照、洞察），按 D43 记录每次调用与 token；第二次执行必须 0 调用 | 发布验收在接近生产的预发环境调用真实模型，mock 只用于单元测试 |
| W55-5 | 回填走系统预算、不占用户配额：账本记 `pool='system'`；`--max-ai-calls` 必填，另有 `--batch-size`、`--sleep-ms`，按 actor 串行、可断点续跑（检查点写在仓库外）；生产按内部账号 → 小比例 → 全量逐档授权 | HubSpot、LinkedIn 的历史数据回填按系统配额分批、可恢复、分档放量，不消耗用户侧额度 |
| W55-6 | 总账超 1.6 GB 不阻塞收口，如实登记 D32 周检，列最大的两项新增读取与瘦身方向，由用户决定是否另开瘦身 Sprint | 上线后靠监控和周检盯预算，超预算立项优化，不为预算回滚已验收的功能 |

W48-9（D44）：生产迁移与 AI 开关不在任何开发 Sprint 执行，统一在本 Sprint 收口时列入授权清单（见「失败与交接」）。
