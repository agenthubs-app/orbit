# Sprint 0022 — 待办统一与人脉筛选

> 单次执行遵守 [RULES](../RULES.md)，当前主代理作为唯一 Generator；使用 executing-plans 按任务推进，不设 Evaluator 或第二实现者。

**Plan revision:** 1。**模式:** existing-codebase / single-generator / App。
**Goal:** 用同一待办集合承接全部行动和人脉筛选，保留旧链接与已有能力。
**Architecture:** 复用 canonical tasks API、详情与写入；抽取纯筛选／路由规则，旧跟进工具接入统一页后才切换旧入口。
**Tech Stack:** 现有 Expo Router、React Native、TypeScript、Node 测试及 React Native Web 交互夹具；无新依赖。
**Spec:** [DESIGN.md](DESIGN.md)。易读目标见 [GOAL.md](GOAL.md)。
**原需求:** 2026-09-14 已确认的人脉待办决定，关联 R-08／R-09／R-06；不取代 0006、0010、0011、0018 的验收。
**编制基线:** 根仓库 `chat-agent`，`585c3abaa`；编制前无 tracked 产品改动。实际启动重新记录 HEAD、diff、Planner SHA256 与 run-01。

## 进入条件

- 用户已确认统一待办、人脉筛选、需要联系人留在人脉页、首页去掉跟进入口；本次已收到完成设计后按顺序实施的指令，不重复索取同一执行授权。
- 本书面规格与文件边界审阅通过；全局 ACTIVE、依赖和适用授权齐全后才领取。缺项不消耗 Generator run。
- 0006 已交付本次迁移使用的模板、引用和手动发送入口；0022 不替它实现另一套 AI。依赖真实接口版本，不以 mock 代替前序交付。
- 列表沿用现有任务 API；0010 若已更改回执／版本，必须消费其发布版本。排序上安排 0010 在前，避免重复修改任务动作与夹具。
- 0011／0018 不反向作为本 Sprint 前置；只接收本 Sprint 的稳定地址。与相关文件持有者串行。

## 当前事实

- 路由是 `app/tasks.tsx`，不是 `app/tasks/index.tsx`；旧路由 `app/followups.tsx` 已有私有包装。
- `followups-page.ts` 已使用 category 或 relatedContactId 筛人脉任务；TasksScreen 目前只有 view 参数且未完成页仍追加 completed 分组。
- FollowupsScreen 除已保存任务外还有工作区、候选与草稿，不能只替换路由而丢失能力。
- ContactsScreen 已提供“需要联系”筛选；不新增联系人业务字段。
- `mobile-route-access.ts` 的静态前缀表尚未包括 tasks；现有页面包装不等于登录返回与深链识别已完整。

## 文件白名单

全部相对 `repos/orbit-app`。不存在的文件明确为新增；目录名不是递归写权限。

| 任务 | 修改 | 新增 |
| --- | --- | --- |
| 筛选与列表 | `app/tasks.tsx`、`src/screens/tasks/TasksScreen.tsx`、`src/view-models/followups-page.ts`、`src/screens/followups/SavedFollowupsList.tsx` | `src/view-models/task-list-scope.ts` |
| 承接工具／旧页 | `app/followups.tsx`、`src/screens/followups/FollowupsScreen.tsx` | `src/screens/tasks/RelationshipTaskTools.tsx` |
| 导航消费者 | `src/screens/contacts/ContactPipelineScreen.tsx`、`src/view-models/conversations.ts`、`src/screens/ai/AiConversationScreen.tsx`（仅入口地址／图标识别）、`src/view-models/agent-signals.ts`、`src/view-models/schedule.ts`、`src/view-models/initial-route.ts`、`src/view-models/mobile-route-access.ts` | 无 |
| 测试 | 下列命令中的现有文件 | `tests/task-list-scope.test.ts`、`tests/tasks-unification-interactions.test.ts` |

0006 发布后若消费接口需要编辑其他文件，先补确切路径与审阅，不自动扩张白名单。只读 ContactsScreen 的既有筛选与 Web 实际 tasks collection handler，不修改 Web、共享副本、数据库、首页、日期基础设施或通用 API client。执行结束才新增本 Sprint REPORT。

## 验收契约

| SC | 可观察结果 | 必需证据 |
| --- | --- | --- |
| SC-0022-01 | 全部／人脉与未完成／已完成正交筛选；同一 ID 不复制；关联联系人但非 relationship 分类仍纳入人脉；候选不混入计数。 | 纯规则与实际列表交互，空值、未知参数、61 条任务、四种组合与计数断言。 |
| SC-0022-02 | 完成／重开更新同一事项，真实联系人上下文与点击目标正确；失败不假成功，换号／晚到请求不污染新列表，不改联系人状态。 | 实际路由＋HTTP 边界交互；重复点击、失败、actor 切换和回执核对。 |
| SC-0022-03 | 旧链接、登录返回、Pipeline、AI 全部待办、消息和日历分别进入正确列表或真实详情，不丢个人待办。 | 路由解析、私有前缀、消费者与导航交互；导航零业务写入。 |
| SC-0022-04 | 旧草稿、待确认建议和提醒入口保留；0006 模板只预填并等待主动发送，针对人的操作使用明确选择，不自动接受候选。 | 工具区渲染／点击、请求计数、取消和未知联系人；旧路由切换前后的逐项能力对照。 |
| SC-0022-05 | 人脉页仍可筛需要联系的人；iOS 核心操作可用；同一待办 Web↔App 回读一致，报告清楚区分 API 一致和 Web UI 未改。 | 现有联系人交互、iOS 筛选／完成／返回／工具入口证据、授权同记录双向回读及 H 档检查。 |

## 一次 Generator 的任务顺序

### Task 1 — 统一筛选规则与列表（SC-01／02）

- [ ] 读取前序真实交付，登记 run／哈希／基线；对每个待改既有符号做 upstream impact，HIGH／CRITICAL 先报告，未收录则补源码调用核查。
- [ ] 新增纯规则测试：定义 `isRelationshipTask(task: TaskItemContract): boolean` 与 `parseTaskListSelection(params): {scope: "all" | "relationship"; view: "open" | "completed"}`。覆盖非 relationship 但关联人的事项、完成事项、无关联、未知参数与重复参数首值。
- [ ] 运行新测试观察 RED；在新 helper 中实现谓词和枚举解析，替换旧页重复谓词，沿用已有任务解码函数。
- [ ] 扩展 ink-signal-tasks 与新增交互测试，先观察范围／状态切换失败，再接列表与真实联系人上下文；不重做 TaskDetailScreen 的编辑能力。
- [ ] 验证完整相关文件与类型；功能路径限定暂存、detect_changes、提交。

### Task 2 — 工具承接（SC-04）

- [ ] 新交互测试覆盖已有草稿／候选可见、明确选择联系人、取消无请求、模板编辑后主动发送；记录旧工具能力清单。
- [ ] RED 后抽取 RelationshipTaskTools，消费 0006 已提交入口接口；保留原候选回读／确认协议，不直接搬回已取消的自动 AI 调用。
- [ ] 验证实际组件事件与 HTTP／发送意图次数；未承接完时保留旧路由指向旧页。提交已验证工具功能。

### Task 3 — 兼容路由和消费者（SC-03）

- [ ] 扩展 initial-route／mobile-route-access 测试及消费者交互：登录返回保留允许的 scope／view，有 ID 进详情，普通待办进全部，候选无 ID 不造详情。
- [ ] 观察 RED 后加入 tasks 路径识别，并按 DESIGN 的映射表修改消费者；工具能力齐全后才将旧路由变成认证内兼容跳转。
- [ ] 运行全部直接消费者与原跟进测试，调整旧预期但保留真实行为覆盖；检查联系人 enum 没被全局改名，首页不在本次 diff。验证后提交。

### Task 4 — 同版本验收与交接（全部 SC）

- [ ] HTTP 夹具调用真实路由与认证边界，检查事项完成／重开回执、actor 切换和请求失败；已有 RNW 组件 stub 不能作为真实 HTTP 证据。
- [ ] 授权测试事项 App 完成→Web 回读→Web 重开→App 回读，核对同 ID；未经授权不改真实对象。iOS 实测筛选、三个触点、返回与工具导航。
- [ ] 冻结版本，执行 H 档必要检查；缺必需原生／跨端条件如实 blocked，不用静态测试替代。
- [ ] 创建实际 REPORT，记录 SHA、五项证据、失败／未完成、旧路由兼容、另一端影响与费用；协调者更新登记并向 0011／0013／0015／0018 交接。

## 验证命令与失败边界

本次设计编制为 D 档，只核路径、链接、SC、边界与 diff。未来实施含身份／写入验证，为 H 档。App cwd：

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/task-list-scope.test.ts tests/tasks-unification-interactions.test.ts tests/ink-signal-tasks.test.ts tests/ink-signal-followups.test.ts tests/followups-view-model.test.ts tests/followups-screen-source.test.ts tests/today-tasks-view-model.test.ts tests/task-detail-interactions.test.ts tests/task-endpoints.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/initial-route.test.ts tests/mobile-route-access.test.ts tests/app-wide-route-coverage.test.ts tests/app-navigation-source.test.ts tests/agent-signals-view-model.test.ts tests/conversation-view-model.test.ts tests/ink-signal-ai-conversation.test.ts tests/ink-signal-contacts.test.ts tests/contact-pipeline-view-model.test.ts tests/contact-pipeline-render.test.tsx tests/contact-pipeline-screen-source.test.ts tests/schedule-view-model.test.ts
npm run typecheck
npm test
git diff --check
```

新增文件创建后才能运行对应命令。同版本全量已包含契约同步测试则不重复执行；没有 API 字段变化不手改同步文件。付费 AI／OCR 不在本 Sprint 验证范围，导航和模板预填应为零调用；不重置原累计 $5／已记 $0.012780 账本。

必要能力缺失或白名单不成立时停止依赖步骤，按 RULES 做有限诊断／修复与如实报告，不降低 SC，不启动第二 Generator，不自动另立新编号绕过失败。
