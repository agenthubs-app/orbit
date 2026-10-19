# R20a 第二次独立复核（RD-25）

**结论：请求修正，尚不能收口。** 核对 `origin/redesign`（`5ac76820a`）、第一次 REVIEW、REPORT 所列提交及最终源码；仓库保持只读。

## S

- **S1｜外部日历重连后可能显示旧账号事件。** `repos/orbits/features/calendar-external/reader.ts:41-44` 的缓存键只有 Orbit actor 和时间窗。撤销旧 Google 连接并在五分钟内改连新账号后，授权状态重新为 active 即命中旧事件缓存；只读复现得到 `old → old`、provider 仅读取一次。缓存须绑定连接版本，并补撤销／换号回归。

## M

- **M1｜App 离线跟进范围与统一判定不一致（SC-05）。** `repos/orbit-app/src/data/sync/task-outbox-mutation.ts:20` 只认 `category=relationship`；`src/screens/todo/TodoScreen.tsx:224-229` 据此限制操作。但 `repos/orbits/features/todo/followups.ts:20-22` 会收录其他类别中挂了联系人的任务。实测 `category=event`、有 `relatedContactId` 的任务在线属于フォロー，离线完成却被拒绝。对已有任务复用统一判定，并守住仅完成／改晚的操作限制。
- **M2｜任务分页仍未做到列表宽进。** `repos/orbit-app/src/api/schema/task-page.ts:17-28`（Web 副本同形）用严格枚举和 `z.array` 解析卡片；实测一条未知 `category` 会使整页失败。按规则 10 逐条跳过未知类别，保留服务端总数，补兼容测试。
- **M3｜Agent 旧屏未退役（SC-14）。** `repos/orbit-app/app/agent.tsx:1-4`、`app/agent/actions.tsx:3-15`、`app/contacts/all-actions.tsx:1-4` 仍直接挂旧屏，route coverage 也仍登记为 screen。按 PLANNER §8 完成带 `entry` 定位的跳转，再更新路由及离线清单。
- **M4｜“自身新失败 0”只适用于上一轮红线。** 最终 Web 全量仍有 31 失败；相对开工基线新增按钮 ratchet 失败（85＞79）。D 线 `repos/orbits/app/(app)/app/orbit-2026/calendar/CalendarPresenter.tsx:31,80,83` 仍有三个非 `.btn` 原生按钮。按设计改用合规控件并重跑 ratchet；App 全量仍有 13 失败，不能据失败名称推断本 Sprint 全量通过。

## m

- `repos/orbit-app/app/_layout.tsx:107-117` 的 R20a 提交 `5bd066aad` 超出 PLANNER §1 路径；后续 R18b 根门禁是另一项工作。`e00017299` 的 Plan／Event 跨线改动也尚缺 owner 审阅记录。请主会话补交接与归属结论。

## SC 逐项核实

| SC | 结果 |
| --- | --- |
| 01 | 预检、画面清单有；状态步骤未齐 |
| 02 | 跟进读取修复及定向测试有；双端操作未齐 |
| 03 | 计数贯通契约、读取和同步；端到端未齐 |
| 04 | 聚合、游标有；`completion_question` 缺来源 |
| 05 | 副本、outbox 有；见 M1，原生验收未齐 |
| 06 | 容器切换、返回有局部证据 |
| 07 | 来源动作有局部证据；实体草稿与一日一问未齐 |
| 08 | 草稿有局部证据；完整送达链未齐 |
| 09 | Web 编辑已修；全操作未齐 |
| 10 | 日历与面谈局部可用；全状态未齐 |
| 11a | 双端组件骨架已交 |
| 11 | 提案／改期局部可用；原生全链未齐 |
| 12 | OAuth 白名单、只读接口有；见 S1 |
| 13 | 错误／离线状态有局部实现 |
| 14 | Today、Followups 已退役；见 M3 |
| 15 | 像素门禁仍 FAIL |
| 16 | 两端全量及 copy 门禁仍 FAIL |

**核实通过：** 第一次 REVIEW 的 S1、S2、M1～M4 均有对应修复；RD-33 七项有代码落点，像素验收仍未通过。To-do 鉴权、签名游标、日志固定诊断码及 OAuth `returnTo` 签名白名单未见所查路径泄露。与目标版本内容相同的定向测试复跑 **12/12 通过**；未重跑全量或像素门禁。