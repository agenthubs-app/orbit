# Sprint R38 — 计划 v3 收口

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** I（收口：真调用 + 验证 + 登记）。
**单一目标:** 三种目标的真实 DeepSeek 调用各 1 次并登记（初稿 v3、准备卡 pick / card、重新生成；账本 trigger `plan` / `manual`）；R37a 的三个真账号核对项有结论（有问题当场修）；两端全量测试对照基线新增失败 0；Web 门禁复跑；文案与 DEFERRED 登记；停在生产迁移 v8 / 部署之前。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md) §4 R38、§5 R38、§6（D-1～D-9、授权项）、§7。
**基线:** 开工时 `chat-agent` HEAD `61c317517`（R33–R37b 全部已 push）。
**进入条件:** R33–R37b 已完成；用户 2026-11-03 已授权真实 AI 验证（DeepSeek，每种目标各 1 次，次数控制在必要范围）。
**并行会话（不得触碰）:** `docs/designs/redesign-2026-10/` 下的设计稿（另一会话在改）；`repos/orbit-app/src/components/ui/Text.tsx`（另一会话在改）。
**分支:** 直接在 `chat-agent` 提交，一律 `git commit -- <路径>`；提交前看 `git diff --cached`；检查和提交不放在同一条命令里；不 push。

## 交接项汇总（四份 REPORT 末尾「给 R38」）

| 来源 | 交接项 | 本 Sprint 处理 |
| --- | --- | --- |
| R34 | Tavily 真实召回（三份计划各跑一次，≤24 次）；看召回再定地区词 / `TAVILY_MAX_RESULTS` / goalText 60 字 | 用户没有注册 key（`.env.local` 和生产都没有 `TAVILY_API_KEY`）→ 只登记；起草时走 disabled，核对「本次未能联网核实」风险行在真实输出里出现 |
| R35 | `firstDraftV3` 真调用，登记 token 与修理码；被拒原文留成 fixture；已知风险：`summary` 加粗非子串、`comparison.rows[].typeKey` 不是 slot id、「每类恰好 3 问」 | 验证脚本经 `onRejected` 收集被拒原文；REPORT 登记修理码 |
| R36b | 阶段副标题 `why`：v9 提示词不产出 | 看真实输出，登记 |
| R37a | `pick` / `card` 真调用各目标 1 次，trigger `plan` / `manual`；真账号三项（补生成时序、`payload.source.eventTitle`、`homeMarket` 格式）；门禁 `web-R37a.json` | 全做 |
| R37b | 真调用后在 App 上看准备卡；依据区现状库来源标题显示库 id（`PlanV2Detail` 无 citations）；copy-qa 提示两端一起改；简体字回退（另一会话在做） | App 显示改为 Web 上看真数据（App 与 Web 读同一 `PlanHomeView`，逐字段一致已由 R37b 屏测保证），App 门禁等 Text.tsx 会话落地后复跑；citations 登记暂缓；copy-qa 本 Sprint 判断并两端同改 |

## 验证做法（真实 AI）

- 脚本 `repos/orbits/scripts/r38/real-ai-verify.ts`（照 R27 先例）：
  - 只接受回环 `ORBIT_EVENT_DATABASE_URL`；计划、联系人、事实走本机库的 live 仓储，账号 `user_orbit_primary_qa`（91 位联系人，本机最接近真账号的数据）。
  - AI 账本放临时 schema（network-analysis 迁移到 v8），打印账本行后删除，不动本机 public 账本（本机 public 账本停在 v3）。
  - DeepSeek HTTP 有硬上限（默认 36 次），逐次打印耗时与 token；先 `R38_AI_CAP=0` 空跑验证装配。
- 每种目标的步骤：建 intake → 背景三块确认 → 选题 → 作答（取 AI 推测，没有就取第一个选项）→ 初稿 → 确定 → `ensure`（匹配作业前）→ 跑候补匹配作业 → 再 `ensure`（看补生成）→ 给第一件事的联系人手动补一条事实 → `markStale` → 重新生成（`manual`）。
- 预计调用次数：每种目标「背景 1 + 选题 1 + 初稿 1–2 + 挑选 1 + 卡 ≤3 + 重新生成 1」≈ 8–9，三种合计 ≤27。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R38-01 | **真实 AI**：三种目标的初稿都是 `schemaVersion: 3` 且过了 `checkDraftV3`（或修理后过）；准备卡 pick + card 产出 1–3 件事；账本：初稿 `plan_draft`/`plan`，初次准备卡 `plan_prep`/`plan`（`planFlow` 计数不变），重新生成 `plan_prep`/`manual`（`planFlow` +1）；实际 HTTP 次数、token、估算费用登记 | 验证日志（`R38/run-*/ai/`）、REPORT 账本表 |
| SC-R38-02 | **真账号三项**：补生成时序结论；「关联活动」字段结论（有问题修）；`homeMarket` 格式结论 | 本机库查询结果、修复提交与测试 |
| SC-R38-03 | **全量测试**：Web `npm test`（export 回环库）与 App `npm test` 对照基线，新增失败 0；Web `npx tsc --noEmit -p tsconfig.build.json` 只有已知的本地 `.next*/` 错误；App `npm run typecheck` 只有基线已有的 1 条 | 失败清单 diff、命令与退出码 |
| SC-R38-04 | **门禁复跑**：Web `web-R36a.json` 与 `web-R37a.json` 全 PASS；App 门禁登记复跑条件 | 门禁总表 |
| SC-R38-05 | **登记**：copy-qa 两端一起改的文案；DEFERRED-A 新增行；部署准备（迁移 v8 命令、要部署的提交、部署前检查结果）；`detect-changes --scope all` 非 partial | REPORT「部署准备」节 |

## 范围与文件

- 修改（按需）：`repos/orbits/features/plans/prep/*`（核对项发现的问题）、两端文案文件（copy-qa）、`DEFERRED-A.md`、本目录文档。
- 新建：`repos/orbits/scripts/r38/real-ai-verify.ts`。
- 排除：设计稿、App `Text.tsx`、生产迁移、部署、`TAVILY_API_KEY`、TestFlight、push。
