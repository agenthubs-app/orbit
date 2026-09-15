# Sprint 0037 — 联系人消息独立入口实施契约

版本：2026-09-16 / v1。唯一 Generator 按 [RULES](../RULES.md) 实现，不启用额外实现/评审代理，不调用已卸载的工作流技能。

**目标：** 把联系人消息从通知中独立出来，让用户看到真实对话并可靠收发、回复和同步已读。

**原需求：** N-01（真实联系人通信）；用户要求按已确认设定拆分新Sprint。[设计](DESIGN.md)及[项目接口/默认策略](../NOTIFICATION_PROGRAM.md)为本契约输入。

## 基线与进入条件

- 规划参考主线 chat-agent 的 a8ac3f761，实际开工必须重新记录 HEAD、dirty paths、Planner SHA256、文件/环境owner与run-01。不得把规划基线当运行验收版本。
- 复用 0008、0012、0026、0030 已合并代码；0012 未完成的真实 Push 验收留至 0040，不据此声称 0012 完成。无需等待 0033～0036。
- 复用用户“按照这个设定”的产品方向批准和 RULES §0 适用实施授权；核实特定环境/副作用目标，不重复要求批准同一方案。
- 本轮只创建规划；启动时在README登记真实run。未运行不创建REPORT或证据目录。

## 文件白名单

路径均相对根仓库；产品命令在对应端cwd执行。

现有文件：

- `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`
- `repos/orbit-app/src/view-models/relationship-inbox.ts`
- `repos/orbit-app/src/view-models/inbox-feed.ts`
- `repos/orbit-app/src/api/message-state.ts`
- `repos/orbit-app/src/view-models/inbox-read-batch.ts`
- `repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx`
- `repos/orbits/app/(app)/app/inbox/inbox-panel-view-model.ts`
- `repos/orbits/features/relationship-communication/service.ts`
- `repos/orbits/app/api/relationship-communication/handler.ts`

拟新增（并非已存在）：

- `repos/orbit-app/src/screens/inbox/MessageInboxList.tsx`
- `repos/orbit-app/src/view-models/inbox-tabs.ts`
- `repos/orbit-app/tests/inbox-message-separation.test.ts`
- `repos/orbits/tests/pages/inbox-message-separation.test.tsx`

共用接线：App `src/i18n/{messages,zh,ja,en}.ts`，Web现有语言/主题入口、本Sprint列出的测试及其直接行为测试；涉及共享类型时修改Web唯一源与现有同步配置，App生成副本只用sync:contract。必要存储迁移、生产入口和上述模块的service-factory按RULES §0查实后追加精确路径、用途与对应SC，不借机扩范围。

文档交接：本Sprint执行后REPORT、登记表，以及由协调者更新的bridge/status.md、bridge/handoffs.md和本Sprint交接文件。

排除：不改联系人绑定协议、不增加外部聊天平台、不重写同步存储、不生成 AI 通知、不执行旧数据迁移或宣称 Push 送达。

## 实施任务（每项先RED，再最小实现，再GREEN）

### Task 1：先证明消息与通知分离

- [ ] 为新 inbox-message-separation tests 写失败用例：一条消息和一条提醒同时未读，通知全部已读后消息计数不变；换账号迟到响应被丢弃。补会话分页/真实名字/首访与记忆选择行为。
- [ ] 在既有 Screen/Web panel 提取消息列表和账号内页签状态，保留既有会话导航与通信 API。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 2：完成阅读与发送恢复

- [ ] 覆盖 A 发消息→B 收到→B 回复→A 两端读取、重复重试只保存一条、服务端超时后查回、未读游标单调前进。
- [ ] 复用 message-state 与通信幂等链修复缺口；消息 read 与 notification read 使用独立入口，移除混合总数。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 3：双端 UI 与失败态

- [ ] 覆盖 empty/error/loading、长称呼/多行原文、取消请求、账号切换、关闭 AI、三语/暗色/大字号。
- [ ] 复用 Ink 主题、现有语言字典与组件；模拟失败只用于行为测试，不作为送达证据。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 4：真实双账号验收

- [ ] 使用共同后端和两已授权测试账号跑互发/回复/未读同步/失败恢复，在 iPhone 17 Pro Simulator 与 Web 重开同一会话。
- [ ] 按共同约束保存消息 ID 脱敏映射、服务版本、两端结果和证据；不得向非测试联系人发送验收消息。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 5：验证、交接和主线收口

- [ ] 按下方测试映射检查所有SC；所有Web/API/共享变更先production build、重启、health，再验App。保留同一记录的双向回读。
- [ ] H档收口时运行一次受影响端集成/全量与typecheck，App共享副本校验及当前原生构建/启动；不按每个Task重复全量。
- [ ] 检查diff与GitNexus detect_changes，提交固定SHA并按既定流程集成chat-agent；验证真实合并树，未合并或必需证据缺失不标completed。
- [ ] 实际执行结束才写REPORT，逐项记录SC、命令/退出码、真实环境、预算、最终/合并SHA、Bridge交接及具体缺项。

## 验收契约（最多五项）

| SC | 必须实现的行为 | 必需证据 |
| --- | --- | --- |
| SC-0037-01 | **入口和呈现：** 消息/通知独立，按账号记住选择，真实名称与原文，分页无全量联系人扫描 | 组件/分页测试 + Web/App 截图 |
| SC-0037-02 | **真实通信：** 双向收发/回复，超时重试不重复，重开有历史且送达状态真实 | 通信幂等测试 + 两账号运行证据 |
| SC-0037-03 | **阅读隔离：** 消息游标与通知已读独立；外层点、内部各自计数正确 | read-batch/lifecycle + 双端回读 |
| SC-0037-04 | **账号及体验：** 换号/迟到响应无泄漏，关闭 AI 正常通信，三语/暗色/大字号可用 | 账号隔离测试 + Simulator 状态矩阵 |
| SC-0037-05 | **交付证据：** 共同环境验收、定向及收口检查、固定提交和主线合并树验证 | 环境清单、命令退出码、SHA、执行后 REPORT |

## 定向验证与预期结果

以下命令供实施期使用；新测试必须在相应Task中先创建并观察预期失败。本轮编制文档不运行这些尚不存在的测试，也不报告通过。

```sh
# cwd: /Users/xzhao/Projects/orbit/repos/orbit-app
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/inbox-message-separation.test.ts tests/message-state-interactions.test.tsx tests/inbox-read-batch.test.ts tests/relationship-inbox-lifecycle.test.ts
npm run typecheck

# cwd: /Users/xzhao/Projects/orbit/repos/orbits
node --test --import tsx tests/pages/inbox-message-separation.test.tsx tests/api/relationship-communication-routes.test.ts tests/capabilities/relationship-communication-live-store.test.ts
npm run typecheck
```

App测试覆盖UI、动作和账号生命周期；Web测试覆盖权限、业务状态、幂等和持久化。新增仓库/迁移/事务必须用隔离PostgreSQL验证跨进程持久性及竞态，内存测试不替代。收口命令为两端各自 `npm test` / `npm run typecheck`，Web `npm run build`；服务启动按已有运行配置，不假定存在npm start或固定端口。原生构建使用已有iOS配置和iPhone 17 Pro Simulator，不清缓存/重装来掩盖状态错误。

映射：SC-01～04由对应Task的行为测试及真实证据共同证明；SC-05由实际命令退出码、运行矩阵和主线SHA证明。0040还必须独立保留provider→设备链；所有未跑项明确写“未执行”，不能写通过。

## 失败、恢复与交接

遵守[项目共同约束](../NOTIFICATION_PROGRAM.md)：意外失败最多两轮局部修复，最多三次只读假设诊断；源权限/越权、重复副作用或事实造假是对应链路硬失败。停止依赖该链的动作，继续其他独立已授权工作，保存checkpoint恢复同一run。

费用沿用累计$5及真实账本，不在本Sprint重置。真实账号、服务或Push环境缺失只阻塞相应SC的运行步骤，先完成可执行代码/测试/调查；不得把模拟结果当真实验收。证据存App被忽略的build/harness-state/evidence/sprint-0037/run-01/，报告只保留必要脱敏结果。
