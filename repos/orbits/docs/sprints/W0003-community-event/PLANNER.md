# Sprint W0003 — iOrbit 社群卡片

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-06（D6：不做成活动）、RW-07（无计划时的理由；有计划时在 W0009）。**单一目标:** 活动页置顶「加入 iOrbit 用户社群」卡片；「我已加入」写本人的社群加入记录；iOrbit「已报名活动」栏显示「已加入社群」；活动推荐理由只用真实匹配词。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：无。
**进入条件:** 无外部依赖。D6：**不改活动核心模型**（`event_ops_events`、目录、推荐过滤、报名规则都不动）。D4：二维码、微信号、群介绍先用明确标注的占位，放在一个配置模块里，素材到位只改配置。

## 范围与文件

- 读取：`app/(app)/app/events/page.tsx`、`events-0918/events-list.tsx`、`features/events/public-goal-recommendations.ts`（`matchedTokens`）、推荐理由的展示位置（活动列表／iOrbit，开工时 impact 定位）、`iorbit-0918/iorbit-home.tsx`（已报名活动栏）、`features/agent/preferences.ts`（`orbit_records` 单记录写法）、`app/api/agent/ledger/route.ts` 与 `app/api/_shared/agent-request-context.ts`（认证与 envelope）。
- 修改：`events-list.tsx`（顶部固定社群卡片）、推荐理由展示组件（只显示「匹配你的目标：『…』」）、`iorbit-home.tsx`（已加入时在已报名活动栏首行显示「已加入社群」，不占用真实活动的两个名额）、`app/(app)/app/agent/page.tsx`（服务端读取加入状态并下传）及测试。
- 新建：`features/community/config.ts`（群名、介绍、微信号、二维码图片路径与 `placeholder: true` 标记）；`features/community/membership.ts`（`orbit_records` collection `communityMembership`、recordId `current`：`joinedAt`；按 actor 读写，幂等）；`app/api/community/membership/route.ts`（GET／PUT，未登录 401，只写本人）；`app/(app)/app/events/events-0918/community-card.tsx`（卡片组件，复制微信号 try/catch 回退为选中文本）；对应测试。
- 排除：改动活动核心模型、报名接口或活动推荐的过滤排序；引导第 4 步模块（W0006 复用本卡片与加入记录）；活码生成、微信侧自动化。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0003-01 | 活动页顶部永远显示社群卡片（有无其他活动都在），标「免费 · 长期有效」；占位素材有明确「占位」标注；真实活动列表的内容与排序和改动前一致 | 组件测试（有活动／无活动）+ 既有活动列表测试不改断言通过 |
| SC-W0003-02 | 点「我已加入」调用 `PUT /api/community/membership` 写入本人记录，卡片变为「已加入」；重复点击幂等；刷新或换浏览器仍为已加入 | 路由测试（未登录 401、他人不可写、重复 PUT 只一条）+ 组件测试 + 浏览器刷新回读 |
| SC-W0003-03 | 未加入时，iOrbit「已报名活动」栏的推荐位第一条是社群卡片入口（标明是社群，不伪装成活动）；已加入时该栏首行显示「已加入社群」，真实报名活动仍显示最多两场 | `app-agent-iorbit-home.test.tsx` 新增用例 |
| SC-W0003-04 | 推荐理由只显示由 `matchedTokens` 组成的「匹配你的目标：『…』」，没有匹配词时不显示理由行 | 组件测试 |
| SC-W0003-05 | 不引入新的回归 | 活动列表、推荐、iOrbit 相关测试文件；typecheck；因新增写接口，收口一次全量基线对照 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0003/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0003-community-event` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（新增写接口、按身份读写）；活动核心不动。
- 开发定向集：community membership 路由与服务测试、community-card 组件测试、iOrbit home 新用例。
- 操作链收口集：活动列表、推荐、iOrbit 相关测试文件；typecheck；一次全量基线对照（RULES 5.2）。
- 不运行：App 端；生产数据写入。

## 失败与交接

报告写明配置模块位置与占位清单（D4）、加入记录 collection 与字段（W0006 第 4 步复用）、推荐理由的改动点。
