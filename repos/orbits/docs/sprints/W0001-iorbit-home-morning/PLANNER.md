# Sprint W0001 — iOrbit 首页报刊式改版

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-01。**单一目标:** `/app/agent` 概览屏换成报刊式版面，数据来源和写操作不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** HEAD `c9f465ca`（`chat-agent`）。承接工作区里 2026-09-28 已写好但未提交的五个文件：`iorbit-home.tsx`（重写）、`iorbit-home-styles.ts`（新增）、`iorbit-styles.ts`（拼接新皮肤、`.ir-home` 间距 26→34px）、`tests/pages/app-agent-iorbit-home.test.tsx` 与 `tests/pages/orbit-agent-visual-design.test.ts`（断言改为新版式）。已做过：GitNexus impact `IOrbitHome` = LOW（唯一调用方 `IOrbitShell`）；iOrbit 相关 6 个测试文件 90 条中 89 通过，唯一失败 `?session= restores the conversation…` 已用 stash 对照确认为改动前基线。
**进入条件:** 无外部依赖；产品批准见 REQUIREMENTS RW-01。

## 范围与文件

- 读取：`app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`、`iorbit-model.ts`、`iorbit-shell.tsx`、`../orbit-agent-next-actions.ts`，上述测试文件。
- 修改：`app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`、`iorbit-styles.ts`、`tests/pages/app-agent-iorbit-home.test.tsx`、`tests/pages/orbit-agent-visual-design.test.ts`。
- 新建：`app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts`。
- 排除：名片待确认并入要事（W0011）、示例模式（W0004）、跨月周条补齐、`iorbit-shell.tsx` 和其他 iOrbit 屏。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0001-01 | 概览屏渲染报头＋导语、今日要事、追问条、右栏时间与月历、三栏栏目；旧七张卡片、今日简报、四个 chip 不再出现 | `the home screen ships the morning-paper layout` 通过 |
| SC-W0001-02 | 今日要事按「2 小时内日程 → critical/high 信号 → 其余信号 → 跟进补位」排序；信号里已有 followup_due 时跟进队列不补位；超过 3 件显示「还有 N 件」并可展开 | **新增**组件测试：一条 2 小时内约谈 + medium 与 high 两条信号 + 一条跟进，断言主稿与短讯顺序、跟进不重复、展开后条数 |
| SC-W0001-03 | 信号的完成／明天提醒发出正确 PATCH，写失败显示 alert 且行不消失，刷新重新 POST | 既有 `suggestion rows keep … writes`、`failed signal write …` 通过 |
| SC-W0001-04 | 点月历日期驱动时间线；时间线按真实时间戳排序；手机宽度下周条在上、整月可展开，选中的今天白字靛蓝底 | 既有 `picking a calendar day …`、`today's agenda sorts …` 通过；375 宽浏览器截图 |
| SC-W0001-05 | 不引入新的回归 | iOrbit 相关 6 个测试文件除基线 `?session=` 外全过；`npx tsc --noEmit -p .` 无相关错误；桌面 1440 与手机 375 浏览器无 console 错误 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希；确认五个承接文件的 diff 仍是 2026-09-28 版本。
2. 为 SC-W0001-02 写失败测试（RED 对应的是排序逻辑，已实现则直接 GREEN，记录事实）。
3. 跑开发定向集；有限修复。
4. 浏览器桌面／手机各一次，截图存证据目录。
5. 路径限定暂存 → `detect-changes --scope staged` → 在 `sprint/W0001-iorbit-home-morning` 提交 → 写 REPORT → 合并回 `chat-agent` → 合并树跑同一定向集。

## 最小测试与检查

- 档位：L（纯界面重排，数据接口与写操作不变，impact LOW）。
- 开发定向集：`npx tsx --test tests/pages/app-agent-iorbit-home.test.tsx`。
- 操作链收口集：`tests/pages/app-agent-iorbit-home.test.tsx`、`app-agent-iorbit-chat.test.tsx`、`app-agent-iorbit-screens.test.tsx`、`orbit-agent-visual-design.test.ts`、`tests/ui/orbit-scale-ratchet.test.ts`、`app-home-live-route-services.test.ts`；typecheck 一次。
- 不运行：全量 `npm test`（纯 L，无共享契约变化）；App 端测试（不涉及）。

## 失败与交接

报告列 SC 映射、功能 SHA、命令与退出码、基线失败 `?session=` 的对照证据、已知局限（跨月周条只显示本月天数、名片药丸仍在），下一步 W0011／W0004。
