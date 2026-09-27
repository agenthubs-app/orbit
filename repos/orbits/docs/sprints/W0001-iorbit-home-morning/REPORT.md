# Sprint W0001 — 执行总结

## 目标实现情况

- 本轮要实现：打开 iOrbit 先看到「今天最该做的 1–3 件事」和依据，日程、目标进度、活动和对话退到右栏与底部栏目。
- 已验证能做到：
  - 报头导语由真实计数拼成；今日要事按「2 小时内日程 → critical/high 信号 → 其余信号 → 跟进补位」排序，第 1 件是唯一带卡片的主稿，其余为短讯，超过 3 件原地展开（SC-01、SC-02）。
  - 已解决的信号不再混进要事；任一数据源读不到时显示「部分数据暂时读取不到」，不再给出「今天没有要紧的事」的确定结论（Codex 代码 review 后补）。
  - 信号的完成／明天提醒写操作、失败提示、刷新保持不变（SC-03）。
  - 时钟每分钟前进，「现在」线在日程全部结束和空日程时也显示，跨东京午夜自动切日；手机上周条在上、整月可展开（SC-04）。
  - 暖色只出现在主稿序号、倒计时和「现在」线三处。
- 仍未实现或未验证：
  - 名片待确认并入今日要事（W0011）；
  - 周条跨月时只显示本月的几天（月历只有当月格子）；
  - 本账号今天没有要事，浏览器里只看到安静态，满数据形态由组件测试覆盖，要到 W0004 示例模式才能在页面上看到。

## 运行记录

- 目标／原需求：RW-01
- 结果：completed（合并后验证见下）
- run：run-01；Generator：Claude（主会话）；2026-09-28
- Planner revision：2
- 基线 HEAD：`c9f465ca`；承接五个未提交文件（见 PLANNER）
- 被验收的最后功能 HEAD：`a54004c8`
- Sprint 分支：`sprint/W0001-iorbit-home-morning`
- `chat-agent` 合并 SHA：见登记表运行记录
- push：未执行（无授权）

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 报刊式首页、合并排序、部分失败提示、分钟时钟、现在线、周条 | `iorbit-home.tsx`、`iorbit-home-styles.ts`（新）、`iorbit-styles.ts` | `a54004c8` | SC-01～05 |
| 测试改为新版式并新增 6 条 | `tests/pages/app-agent-iorbit-home.test.tsx`、`tests/pages/orbit-agent-visual-design.test.ts` | `a54004c8` | SC-01～05 |

## 验收结果

| SC | 结果 | 证据 | 范围 |
| --- | --- | --- | --- |
| SC-W0001-01 | pass | `the home screen ships the morning-paper layout` | SSR 结构 |
| SC-W0001-02 | pass | `today's items merge schedule, signals and follow-ups in priority order`（注入时钟，无跳过）、`resolved signals never enter today's items` | 排序、去重、展开 |
| SC-W0001-03 | pass | `suggestion rows keep … writes`、`failed signal write …`、`a single unavailable source never reads as an all-clear` | 写操作与失败提示 |
| SC-W0001-04 | pass | `picking a calendar day …`、`today's agenda sorts …`、`the now line stays visible …`、`the month toggle opens and closes …`；内置浏览器 375 宽截图（周条、今天白字靛蓝底、现在线） | 时间栏 |
| SC-W0001-05 | pass | 收口集 95 条中 94 通过，唯一失败为基线 `?session= restores…`（改动前 stash 对照已确认）；`tsc --noEmit` 0 错误；1440／375 浏览器 console 无错误 | 回归 |

## 最小验证与未运行项

| 命令／场景 | 结果 | 对应 SC |
| --- | --- | --- |
| `npx tsx --test` 收口集 6 个文件 | 95 条，94 pass，1 基线失败 | 全部 |
| `npx tsc --noEmit -p .` | 0 error | SC-05 |
| 内置浏览器 `/app/agent` 1440 与 375 | 渲染正常，console 无错误 | SC-04、05 |

- 全量：未触发（L 档）。另在后台跑了一次全量，作为后续 H 档 Sprint 的基线，不作为本 Sprint 证据。
- 证据截图：在会话的内置浏览器中查看，未落盘到仓库（`AGENTS.md` 禁止仓库内证据）。

## Codex 代码 review（gpt-5.6-sol）与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 已解决信号被当成今日要事，还带写按钮 | 采纳（`selectAgentHomeSignals` 会带回 1 条 resolved） | 过滤 `row.completed`，新增测试 |
| 单个来源失败时谎报「没有要紧的事」 | 采纳 | 新增部分失败提示与导语、测试 |
| 现在线在日程结束／空日程时消失，时间停在挂载时刻 | 采纳 | 分钟时钟 + 可注入时钟、尾部现在线、跨午夜切日、测试 |
| 缺月历展开测试和浏览器证据 | 采纳 | 新增测试，浏览器验证 |
| 暖色 4 处超过上限 | 采纳 | 导语改为墨色强调 |

## 交接

- 已验证成果：见上。
- 未提交改动：无（本 Sprint 范围）；工作区里用户自己的 `bridge/`、`docs/designs/Orbit_0918/` 等未动。
- 另一端影响：无（App 不使用该页面）。
- 费用：0 次付费 AI 调用。
- 回退方式：`git revert` 合并提交即可恢复旧的七卡片首页。
- 下一步：W0002、W0003、W0013、W0007。
