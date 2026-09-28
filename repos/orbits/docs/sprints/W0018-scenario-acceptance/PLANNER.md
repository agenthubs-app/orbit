# Sprint W0018 — 逐场景真实页面验收

**Plan revision:** 2（2026-09-28 按 Codex 方案 review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-02。**单一目标:** 11 个场景在 3001 验收 server 上桌面 1440／手机 375 走完，小问题修复，交验收报告页面。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；W0016 的 REPORT（启动与取 cookie 的命令）。
**进入条件:** W0016、W0017 completed。

## 上下文包（从这里起步，不通读其他 REPORT）

- 必读：W0016 REPORT「交接」一节（启动、种子、cookie 命令，账号用途）；[REQUIREMENTS.md](../REQUIREMENTS.md) RW-01～RW-12 与 RV-02（场景的期望行为）。
- 场景与对应代码入口（出问题时从这里查）：

| # | 场景 | 账号 | 入口文件 |
| --- | --- | --- | --- |
| 1 | 示例四页与写拦截，刷新不闪真实数据 | verify-new | `app/(app)/app/_demo/`、`iorbit-0918/iorbit-shell.tsx`、`iorbit-plan.tsx`、人脉页示例（W0005） |
| 2 | 引导 4 步：硬顺序、不足 3 张拦截、续做、完成后示例消失 | verify-new | `app/(app)/app/start/`、`features/guide/progress.ts` |
| 3 | 老用户不进示例、只提示第 3 步 | verify-legacy | 同上 |
| 4 | 计划生成「生成中→已完成」、刷新保持、计划页与卡片一致 | verify-new（走完第 3 步） | `iorbit-plan-card.tsx`、`features/plans/mock-generator.ts` |
| 5 | 打勾同步首页本周推进、已延后、@ 提及、重新分析额度、到期回顾 | verify-plan、verify-expired | `iorbit-plan.tsx`、`features/plans/reanalysis.ts` |
| 6 | 真实名片上传、行业识别、审阅页改行业 | verify-legacy（上传 W0016 裁好的单张图） | `card-batch-0918/` |
| 7 | 需求匹配弹出、「约 TA」三按钮、邮件模板 | verify-event | `plan-match-sheet`、`features/plans/matching*.ts` |
| 8 | 活动归属询问、取消勾选不记、计划活动变已参加 | verify-event | `card-batch-ui.tsx` `EventAttributionPrompt` |
| 9 | 今日要事排序、名片待确认项、社群卡片、推荐理由 | verify-plan、verify-event | `iorbit-home.tsx`、`events-0918/community-card.tsx` |
| 10 | 开关关闭时与改版前一致 | 3000 端口 + 测试账号 | — |
| 11 | 周一小结 | verify-plan | 只在东京周一出现：非周一执行时标「待周一复核」，不加时钟后门 |

- 已知待修：只有 `app/(app)/app/agent/page.tsx` 第 228 行读报名时传了 `userId: session.user.id`，应改为 `actorId`（第 161、185 行是账号解析和引导参数，不改）。报名写入用 `actor.id`（`app/api/events/[id]/registration/route-handlers.ts` 第 480 行），键为 eventId + actorId（`features/events/registration/service.ts` 第 43 行）。回归测试要覆盖两个 id 不同的情况，并同时覆盖 legacy 投影与 canonical membership 两条读取路径（同类修复参照 `tests/api/event-attribution-candidates-route.test.ts`）。
- 易错边界：
  - 只用 `verify-*` 账号。
  - **真实识别的调用量**：正常路径每张图 3 次请求（视觉转录、文本结构化、高风险复核：`features/acquisition/deepseek-business-card-ocr-provider.ts` 第 230、254、290 行），方向回退最多再加两组双请求（`business-card-ingest-v2/worker.ts` 第 70 行），即最多 7 次／图；批次确认后还可能有 1 次匹配 AI。`bc_ingest_items.usage` 只记最终选中结果的合计，**不能当总账**。上限：最多上传 8 张单张图；按 provider 请求逐次记录次数与 token（用本地 dev server 日志或只在本地开启的计数，不改生产行为），匹配 AI 单列。
  - **桌面与手机分别从初始状态开始**：每个会写入的场景，桌面走完后用 W0016 的单账号重置命令复位再走手机。
  - 验收矩阵每一步记录：页面 DOM 关键文本、相关 HTTP 请求（有无、状态码）、需要时的数据库读回、console 错误；截图只作视觉证据。
  - 「小问题」= 单文件或同一组件内、不改接口与数据结构、不涉及写入语义的修复；超出则登记新 Sprint（W0020 起），不在本 Sprint 修。
  - 截图只放 `~/orbit-sprint-evidence/web/sprint-W0018/run-01/`；验收报告页面引用截图时由协调者发布，不放进仓库。
  - 浏览器 pane 可能卡住：请求挂起时先用 curl 判断是 dev server 编译还是代码问题，不要反复重试同一操作。

## 范围与文件

- 修改：验收中发现的小问题所在文件；`agent/page.tsx` 的报名 id 修正及测试。
- 新建：验收报告 HTML（证据目录内），由协调者发布为页面。
- 排除：较大问题的修复（登记新 Sprint）；Preview。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0018-01 | 11 个场景桌面、手机各从初始状态走过，每一步有 DOM／HTTP／必要的数据库读回／console 记录，外加截图与结论（通过／已修复／遗留→新 Sprint 编号）；「刷新不闪真实数据」「硬顺序」「持久化」「写拦截」用请求记录与读回证明，不只靠截图 | 验收矩阵 + 报告 |
| SC-W0018-02 | 所有小修复有对应测试或截图前后对照，console 无新错误 | 测试＋截图 |
| SC-W0018-03 | `/app/agent` 按账号 id 读报名，两个 id 不同时报名状态正确（legacy 投影与 canonical membership 两条路径） | 回归测试 |
| SC-W0018-04 | 真实名片识别（≤8 张）：行业识别正确率；按 provider 请求逐次的调用次数与 token（含复核、方向回退），匹配 AI 单列；与 W0013 的 +45–50% 估算对照 | REPORT 表格 |
| SC-W0018-05 | 不引入新的回归 | 受影响测试；typecheck；一次全量基线对照 |

## 最小测试与检查

- 档位：H（会触及多处页面与读取口径）。
- 收口：修改文件所在测试文件与直接消费者；typecheck；全量基线对照。

## 失败与交接

REPORT 列出遗留问题与新 Sprint 编号；把 Preview 上要复验的关键场景（建议 1、2、4、8、10）交给 W0020。
