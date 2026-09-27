# Sprint W0003 — 执行总结

## 目标实现情况

- 本轮要实现：活动页置顶「加入 iOrbit 用户社群」卡片，「我已加入」记为本人已加入，iOrbit 已报名活动栏首行显示社群；推荐理由只写真实匹配的目标词。
- 已验证能做到：
  - 社群卡片在活动页两个页签的列表之上固定显示（免费 · 长期有效 · 置顶），不进活动网格与统计；二维码、微信号、群介绍都是带「占位」标注的内容，配置集中在 `features/community/config.ts`（SC-01）。
  - `PUT/GET /api/community/membership`：需登录、只写本人、重复与并发加入只留一条且保留首次时间；换请求、服务端页面读取都读回已加入；未登录时卡片按钮换成登录链接；加入成功有 aria-live 播报（SC-02）。
  - iOrbit「已报名活动」栏：未加入时首行是标明「社群」的入口，已加入时首行「已加入社群」，真实活动仍显示两场（SC-03）。
  - 推荐理由只显示 `matchedTokens`；策略页不再出现「更高效地结识潜在联系人」一类无依据说法（SC-04）。
  - 真实浏览器：活动页卡片与 iOrbit 社群行渲染正常，console 无错误。
- 仍未实现或未验证：
  - **真实账号上没有点「我已加入」**：那会把用户标记为已入群，但用户并未真正加入；持久化由路由与服务测试（含跨请求、服务端读取器）覆盖。
  - 社群素材（D4）仍是占位。

## 运行记录

- 原需求：RW-06、RW-07（无计划时）；决定 D4、D6
- 结果：completed
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 最后功能 SHA：`0ff45703`；分支 `sprint/W0003-community-event`
- push：未执行

## 改了什么

| 功能 | 文件 | commit |
| --- | --- | --- |
| 社群模块（配置、契约、服务、factory、文档） | `features/community/*`、`docs/architecture/modules/community.md` | `0ff45703` |
| 加入接口 | `app/api/community/membership/route.ts`、`route-handler.ts` | `0ff45703` |
| 活动页卡片 | `events-0918/community-card.tsx`（新）、`events-list.tsx`、`events/page.tsx` | `0ff45703` |
| iOrbit 社群行 | `agent/page.tsx`、`iorbit-shell.tsx`、`iorbit-home.tsx`、`iorbit-home-styles.ts` | `0ff45703` |
| 推荐理由如实 | `iorbit-strategy.tsx`、`iorbit-styles.ts` | `0ff45703` |
| **W0001 回归修复** | `tests/ui/orbit-0918-anchor-colour.test.ts`（改读运行时 `IORBIT_STYLES` 与卡片样式）、`.ir-m-cal-link:hover`、首页「历史记录」按钮文案 | `0ff45703` |
| 测试 | community 路由／服务／真实 PG／卡片测试（新），iorbit home／screens、modular-boundaries | `0ff45703` |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0003-01 | pass | `app-events-community-card.test.tsx`（有／无活动、我的活动页签、占位标注）；既有活动列表测试不改断言通过 |
| SC-W0003-02 | pass | `community-membership-routes.test.ts`（401、只写本人、幂等、跨请求与服务端读取回读、503／500）、`community-membership.test.ts`（并发、隔离、fail closed）、`community-membership-postgres.test.ts`（本机库，未 skip，非回环地址直接失败） |
| SC-W0003-03 | pass | `app-agent-iorbit-home.test.tsx` 新增 3 条 |
| SC-W0003-04 | pass | `app-agent-iorbit-screens.test.tsx` 新增理由行与「无依据说法」两类用例 |
| SC-W0003-05 | pass | 全量 `npm test`：5178 条，42 失败；与 W0001 前基线对照**新增 0**，并修复 W0001 引起的 3 条；`tsc` 0 错误 |

## 全量基线对照

- W0001 合并后全量：45 失败。本 Sprint 后：42 失败；新增 0，修复 3：`every *-0918 <a> keeps its own colour…`、`every *-0918 scope still carries the a / a:hover baseline…`（W0001 把 `IORBIT_STYLES` 拆成两段拼接，门禁按源码切片失败）、`after returning to the overview, starting a new chat…`（W0001 把「历史记录」改成「历史」）。
- `tests/pages/event-registration-readback.test.tsx` 在每次全量里都会挂起（超过 1 小时），与本 Sprint 无关，结束该进程后套件继续。
- 另用 `git archive c9f465ca` 导出 W0001 前的代码跑了全量对照；导出不含 `.env.local` 等被忽略文件，环境相关用例在那里多失败 70 条左右，只用于确认「本 Sprint 没有新增失败」。

## GitNexus

- `EventsList`、`IOrbitHome`、`IOrbitShell`：LOW；`AppAgentPage`、`AppEventsPage` 为路由入口，UNKNOWN，grep 确认只有框架与源码类测试引用。
- staged detect-changes：24 文件、16 符号、18 流程，**risk critical**——来自两个页面入口带出的执行流；没有 HIGH／CRITICAL 的单个被调函数，全量对照新增失败为 0。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 策略页仍有无依据的效果说法 | 采纳 | 改为「以下活动按你的目标词匹配」，测试禁止相关词 |
| 群介绍被写成定稿并承诺活动名额 | 采纳 | 介绍改占位，删承诺，三项素材都有可见占位标注 |
| 真实 PG 测试未强制本地库 | 采纳 | 非回环地址直接失败 |
| 缺刷新／换设备回读证据 | 部分采纳 | 加跨请求与服务端读取器测试；真实账号点击不做（见上） |
| 加入成功无可访问性播报 | 采纳 | aria-live 状态行，按钮改 aria-disabled |

## 交接

- 给 W0006：加入记录 `orbit_records` collection `communityMembership`、recordId `current`；`GET /api/community/membership` 返回 `{ joined, joinedAt }`；服务端读取 `readCommunityJoinedForActor`；组件 `CommunityCard({ joined, signedIn })`。
- 费用：0 次付费 AI 调用。
- 下一步：W0013、W0007。
