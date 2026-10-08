# Sprint W0039 — 执行总结

> 本报告正文由 Generator（run-01）撰写；子代理写文件被环境拦截，由协调者按原文写入并提交。

## 结果

对应 [GOAL.md](GOAL.md)。**大目标 3「首页不再空」收口通过**：RH-01～RH-04 合起来在 3001 真实页面成立，全量对照没有新增失败，GitNexus 变更范围都落在 W0035～W0038 声明的范围内。本 Sprint 没有改源码。

- 已验证能做到：
  - 新用户（`verify-new`）：示例首页的活动小模组固定展开，社群卡在第一位，两场活动是真实数据（10/11、10/15，理由「近期活动」，没有费用行），其余要事带「示例」标。引导页只有 3 步；第 1 步「先这样，继续」跳过、第 2 步填目标、第 3 步「开始分析」走 mock 生成计划。回到首页，今日要事有 2 条带「本周计划 · 第 1 阶段 摸清需求」来源的计划行动和 1 条补人脉（0 位），头条是「今天可以推进一步：报名 10/11 验收用：企业软件创业者交流会。」。两条计划行动点「今天先不做」（点完第一条后剩 2 条，没有补位）、补人脉点「7 天内不再提示」之后，今日要事变成「今天没有必须处理的事。」，头条改成「今天没有安排，10/11 有一场适合你的活动：…」，活动小模组展开：社群卡第一，下面两场活动的理由是「计划里提到」，没有费用行。（SC-02）
  - 老用户（`verify-plan`，5 位联系人、有计划）：今日要事 3 条，拖期的计划行动排第一并标「已顺延 1 周」；补人脉提示带当前阶段「第 1 阶段 打基础：梳理人脉与介绍材料」，「去扫名片 →」打开 `/app/contacts/new?method=scan` 的名片上传区（没有上传）。月历上 10/11 已报名是实心靛蓝点，10/15、10/25 推荐是空心浅色圈，下方有图例。点 10/25 后，时间线出现推荐条目「验收用：企业软件早期路演会」，点进去是活动详情。底部「已报名活动」只有一条报名，没有社群行和「看看推荐」。首页没有引导第 4 步提醒。（SC-03）
  - 两个账号的首页冷启动都只请求 1 次 `plans/current`。示例首页挂载时，浏览器只请求了顶栏的 `/api/account/me` 和既有的 `/api/inbox/summary`（503），没有请求首页的真实接口。控制台只有既有错误，没有应用错误。（SC-02、SC-03）
- 仍未实现或未验证：
  - 「本周还有 N 场适合你的活动 →」这一行在浏览器里没有出现。东京本周是 9/28–10/4，本机验收库活动池里没有这周的活动（N=0），按规则整行不显示。这是 W0037、W0038 已登记的同一情况，本 Sprint 没有改 seed。
  - 示例首页的「我已加入」这次没有点：它会真实写入，W0037 已经验过；本 Sprint 只核对了浏览器没有发出其他真实接口请求。

## 运行记录

- 结果：completed。W39-1（D38）按「分两个时刻截图」执行：时刻① 刚做完引导、时刻② 把今天的要事都处理掉，另外在引导开始前截了一张示例首页。
- Generator：Opus 5.5／2026-10-01；Planner revision 3（SHA256 `83a8826fe5df9d44763c00f446f0fa922e72ae5fd871455aea8aedf576541388`，开工时核对一致）。
- 分支 `sprint/W0039-home-not-empty-closeout`，起点 `chat-agent` `a48e1749`（已含 W0035 `3dc60dc4`、W0036 `31267c09`、W0037 `346b3298`、W0038 `990e8d4f`）。报告提交与 `chat-agent` 合并 SHA 记在登记表。
- 日期条件：开工东京日期 D = 2026-10-01，月末 E = 2026-10-31；D+24 = 10/25 ≤ E，直接用 seed，**没有重建专用 fixture**。`verify-plan` 已报名活动 `orbit-verify-event-upcoming` 在 10/11 19:00（东京），推荐活动 `ORBIT-VERIFY-GOAL-PLAN` 在 10/25 19:00；月历上另一个推荐圈是 10/15 的 `orbit-verify-goal-match-legacy`。
- 档位 I。全量对照用 `git archive` 法：把 `08fe51db` 和 `a48e1749` 的 `repos/orbits` 子树分别导出到 `$TMPDIR`，链接同一份 `node_modules`，排除 `tests/pages/event-registration-readback.test.tsx`，不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，不 source `.env`，依次运行，跑完删掉副本。
  - 基线 `08fe51db`：989 个文件，6072 项，pass 5261，fail 81，skipped 730。
  - HEAD `a48e1749`：991 个文件，6149 项，pass 5338，fail 81，skipped 730。
  - 两边失败清单完全相同：**新增失败 0**，变绿 0，跳过数不变。多出的 77 项都是 W0035～W0038 新增的用例，全部通过。
  - 口径说明：这里的 81 项失败和 W0038 在工作树里测得的 9 项不能直接比。副本只导出了 `repos/orbits`，没有仓库根目录的兄弟目录（如 `repos/orbit-app`、`knowledge/`），也没有未跟踪的 `.env.local`，所以路由清单、知识库文档、PG 等用例在两份副本里都会失败或跳过。两边条件对称，结论只看新增。
- `npx tsc --noEmit -p .`（HEAD 工作树）：源码 0 错误。只有 3001 dev server 生成的 `.next-verify/dev/types/validator.ts` 报 2 条错误，属于已登记的「生成的 validator.ts」类既有问题。
- 付费 AI 调用 0 次：计划生成走 mock，`ORBIT_PLAN_GENERATOR` 未设置，`POST /api/agent/plans/bootstrap` 201，耗时 1.8 s。未 push、未部署、无迁移，没有连生产。
- 3001 验收 server 由本 Generator 启动，已停止；全量对照的后台进程已结束。没有启动 3000 server，3000 开关关闭回归按 PLANNER 的排除项不跑（W0035 已验）。
- 证据目录 `~/orbit-sprint-evidence/web/sprint-W0039/run-01/`：
  - 全量：`run-full.sh`、`full-base.txt`、`full-head.txt`、`fail-base.txt`、`fail-head.txt`、`fail-new.txt`（空）、`fail-fixed.txt`（空）
  - 类型检查：`typecheck.txt`
  - 浏览器：`browser/browser-flow.md`（逐步记录、网络与控制台），截图 `browser/new-01a～06*.jpg`、`browser/plan-01～07*.jpg`
  - GitNexus：`gitnexus-analyze.txt`、`detect-changes.txt`、`detect-changes.json`、`dc-json.mjs`、`detect-changes-mapping.md`
  - 账号与数据：`fingerprint-before.txt`／`fingerprint-after.txt`、`summary-before.txt`／`summary-after.txt`、`reset-start.txt`／`reset-end.txt`
  - 其他：`planner-sha256.txt`、`git-status-start.txt`

## 验收结果

| SC | pass / fail / blocked | 证据（测试文件或场景） |
| --- | --- | --- |
| SC-W0039-01 全量对照 | pass | 基线 6072 项／81 失败，HEAD 6149 项／81 失败，`fail-new.txt` 为空，变绿 0，跳过 730→730。`typecheck.txt`：源码 0 错误，只有生成的 `.next-verify/dev/types/validator.ts` 报 2 条错误 |
| SC-W0039-02 新用户路径 | pass（「本周还有 N 场」行因 N=0 不显示，如实记录） | ① 示例首页：`new-01a/01b`（1440）、`new-01c`（375），小模组 `expanded`，顺序 community → event → event，真实活动 id，理由「近期活动」，无费用。② 引导 3 步：`new-02a～02d`（1440），`new-02e`（375，3 段进度、「第 1 步 / 共 3 步」），`.sg-steps` 为 3 列；跳过第 1 步、填目标、mock 生成计划。③ 时刻①：`new-03`（1440）、`new-04`（375），2 条计划行动带来源，补人脉 0 位，头条按首条拼接；小模组折叠，本周 N=0 整行不显示。④ 时刻②：`new-05/05b`（375）、`new-06`（1440），今日要事为空，社群卡第一，两场活动理由「计划里提到」，无费用行。冷启动 `plans/current` 1 次；示例期浏览器只请求了 `/api/account/me` 和 `/api/inbox/summary`。写入的两个 localStorage 键已删除（见 `browser-flow.md`） |
| SC-W0039-03 老用户路径 | pass | `plan-01`（1440 首页：拖期行动排第一并标「已顺延 1 周」，补人脉引用阶段，图例）、`plan-02`（点 10/25 后时间线出现推荐条目）、`plan-03`（进入 `/app/events/ORBIT-VERIFY-GOAL-PLAN` 详情）、`plan-04`（`/app/contacts/new?method=scan` 名片上传区）、`plan-05～07`（375：首页、月历展开后选 10/25、底部已报名）；375 上点推荐条目同样进入详情。实心点 `rgb(75,79,199)`，空心圈透明底加 1px `rgb(185,188,235)` 边框。底部已报名只有 10/11 一条，没有社群行和「看看推荐」，全页没有「第 4 步」。D／E 与活动日期见运行记录，没有重建 fixture |
| SC-W0039-04 GitNexus | pass | 在 `a48e1749` 上刷新索引（`gitnexus-analyze.txt`）。compare `08fe51db`：`partial`／`truncated` 都没有设置，退出码 0，61 个文件、673 个符号、13 条执行流、risk high。`detect-changes-mapping.md` 逐项对照：代码文件全部属于 W0035～W0038 的提交（7e074834、f7e5e65a、775db2e3、78a71d8f、55c0ab3f、18d02ae1、d3f89672），并已在各自 REPORT 中声明；13 条执行流都在 AppAgentPage（W0035～W0037）和 StartGuide（W0035）上。范围外只有 3 项，都不是代码：W0040 的计划文档、用户未提交的 `bridge/handoffs.md`、被 dev server 改写的 `next-env.d.ts` |
| SC-W0039-05 收口纪律 | pass | 本 Sprint 的 diff 只有本 REPORT.md。`verify-new`、`verify-plan` 在开工和收口时都执行了 `--reset`。非 verify 数据指纹 `digest eddb0f6b…` 前后一致；verify 行数里只有 `orbit_records` 从 108 变成 106，原因是 reset 之后引导状态记录要等首次访问才建，`summary-after` 中的 `guideState: null` 也是这个原因。用户未提交文件没有暂存 |

## 假设与额外阅读

- 上下文包之外的阅读：
  - `scripts/run-node-tests.mjs`、`scripts/assert-local-test-databases.mjs`：确认排除写法。排除方式是传入显式文件列表，不是参数。
  - W0034 REPORT 的全量一行和证据格式：用来对齐 `git archive` 先例的口径。
  - `today-plan-items.ts` 第 23–24 行：查明「7 天内不再提示」的存储键是 `orbit.today.networkNudge.v1:<account>`，W0036 REPORT 没有写全这个键。
  - GitNexus 1.6.12 的 `detect-changes-format.js` 和 `tool.js`：CLI 文本只列前 15 个符号，所以改为直接调用同一后端导出完整 JSON，并据此确认 `partial`／`truncated` 都没有设置。
- 切换账号：浏览器里原本存着 `verify-plan` 的 httpOnly 会话 cookie，`document.cookie` 覆盖不了它。所以先用老账号走完 SC-03，再通过 `/api/auth/signout`（带 csrf）登出，注入 `verify-new` 的 cookie。登出请求重定向到 `localhost:3001` 时触发了一次 CORS 报错，这是验证操作本身引起的，不是应用错误。
- 浏览器 localStorage 里原有 3 个键不是本 Sprint 写的，没有动：`orbit.today.networkNudge.v1:user_verify_legacy`、`orbit.cardBatches.active.v1:user_verify_event`、`orbit.cardBatch.ledger.v1:…`。

## 问题清单

- 没有需要在本 Sprint 内修的问题，也没有需要另开 Sprint 的行为缺陷。
- 观察项（不新开 Sprint，沿用既有登记）：本机验收库本周没有池内活动，「本周还有 N 场」行没法在实机上看到。要看的话，需要在 seed 里加一场相对今天的本周活动，这和 W0037、W0038 是同一项。
- 既有问题照旧：`/api/inbox/summary` 本机 503；dev HMR websocket 报错；dev server 生成的 validator.ts 有类型错误。

## 交接

- 大目标 3（RH-01～RH-05）的验收证据已经齐全，W0039 与大目标 3 可登记为 completed。
- 回退方式：本 Sprint 只有文档，`git revert <报告提交>` 即可。没有存储键、没有迁移。
- 需要用户决定：无。
