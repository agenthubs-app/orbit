# Sprint 0039 — 有依据的 AI 自主发现实施契约

版本：2026-09-16 / v1。唯一 Generator 按 [RULES](../RULES.md) 实现，不启用额外实现/评审代理，不调用已卸载的工作流技能。

**目标：** 让 AI 从允许使用的真实信息中自主发现具体动作，有可信时间才提醒，并展示可核查的原文依据。

**原需求：** N-04（信息来源与自主性）、N-05（质量与规模）；用户要求按已确认设定拆分新Sprint。[设计](DESIGN.md)及[项目接口/默认策略](../NOTIFICATION_PROGRAM.md)为本契约输入。

## 基线与进入条件

- 规划参考主线 chat-agent 的 a8ac3f761，实际开工必须重新记录 HEAD、dirty paths、Planner SHA256、文件/环境owner与run-01。不得把规划基线当运行验收版本。
- 0038记录/动作/证据契约已经合并验证；复用0018/0019笔记与建议采纳、0024目标匹配、0029云端只读面。0036的全局收口不阻塞服务端已提交数据发现。
- 复用用户“按照这个设定”的产品方向批准和 RULES §0 适用实施授权；核实特定环境/副作用目标，不重复要求批准同一方案。
- 本轮只创建规划；启动时在README登记真实run。未运行不创建REPORT或证据目录。

## 文件白名单

路径均相对根仓库；产品命令在对应端cwd执行。

现有文件：

- `repos/orbits/features/agent/signals/source-collector.ts`
- `repos/orbits/features/agent/signals/service.ts`
- `repos/orbits/features/agent/signals/contract.ts`
- `repos/orbits/features/agent/preferences.ts`
- `repos/orbits/app/api/agent/preferences/route-handler.ts`
- `repos/orbits/features/notes/service.ts`
- `repos/orbits/features/orbit-ai/data-query/query-service.ts`
- `repos/orbits/features/orbit-ai/data-visibility/manifest.ts`
- `repos/orbits/features/contact-needs/service.ts`
- `repos/orbits/features/notifications/signal-materializer.ts`
- `repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx`
- `repos/orbit-app/src/screens/settings/SettingsScreen.tsx`

拟新增（并非已存在）：

- `repos/orbits/features/notifications/discovery/source-adapters.ts`
- `repos/orbits/features/notifications/discovery/evidence-extractor.ts`
- `repos/orbits/features/notifications/discovery/qualification-policy.ts`
- `repos/orbits/features/notifications/discovery/discovery-worker.ts`
- `repos/orbits/features/notifications/discovery/discovery-repository.ts`
- `repos/orbits/features/notifications/discovery/semantic-dedup.ts`
- `repos/orbits/scripts/run-notification-discovery-worker.ts`
- `repos/orbits/tests/services/notification-discovery.test.ts`
- `repos/orbits/tests/services/notification-discovery-privacy.test.ts`
- `repos/orbits/tests/services/notification-discovery-bounds.test.ts`
- `repos/orbit-app/tests/notification-evidence-detail.test.ts`

共用接线：App `src/i18n/{messages,zh,ja,en}.ts`，Web现有语言/主题入口、本Sprint列出的测试及其直接行为测试；涉及共享类型时修改Web唯一源与现有同步配置，App生成副本只用sync:contract。必要存储迁移、生产入口和上述模块的service-factory按RULES §0查实后追加精确路径、用途与对应SC，不借机扩范围。

文档交接：本Sprint执行后REPORT、登记表，以及由协调者更新的bridge/status.md、bridge/handoffs.md和本Sprint交接文件。

排除：不接入新的邮箱/聊天平台、不读取本地未同步正文、不自动发送通信、不批量重建联系人关系、不增加费用上限；真实Push策略仍归0040。

## 实施任务（每项先RED，再最小实现，再GREEN）

### Task 1：建立来源和权限反例

- [ ] 为每个必需来源写actor权限/源版本/作者/本地pending不可见/删除撤权/外部连接缺失的RED测试。
- [ ] 复用云端服务和最小字段allowlist，增加证据适配器与来源可用性状态，不直接读App数据库。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 2：实现提取和资格

- [ ] 先写精确承诺、无日期建议、模糊时间、同名、否定、转述、外部回复未知、活动已结束、指令注入样例；断言对应入箱或拒绝原因。
- [ ] 注入既有provider做结构化提取，确定性层核对时间、事实权限、目标相关性；事实/推断分开展示。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 3：去重、状态和有限执行

- [ ] 先写笔记+任务+日程同事项、无关同标题、不复活忽略、7天到期、日限额、多worker争抢、崩溃恢复与429/provider故障测试。
- [ ] 用真实事务约束实现语义映射、游标、租约、次数/费用账本；登记进程启动方式、调度和健康输出，不只交付无人调用的函数。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 4：设置与真实发现链

- [ ] 覆盖关闭AI、撤销消息分析、换号、源删除及同一版本重新开启零重放；模型测试默认fake且不读开发者密钥。
- [ ] 核对累计预算后，在授权provider与共同QA环境从Web/App分别保存事实→后台自动发现→原文→采纳/忽略→另一端回读。记录真实provider与来源修订；无provider只阻塞该证据。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 5：验证、交接和主线收口

- [ ] 按下方测试映射检查所有SC；所有Web/API/共享变更先production build、重启、health，再验App。保留同一记录的双向回读。
- [ ] H档收口时运行一次受影响端集成/全量与typecheck，App共享副本校验及当前原生构建/启动；不按每个Task重复全量。
- [ ] 检查diff与GitNexus detect_changes，提交固定SHA并按既定流程集成chat-agent；验证真实合并树，未合并或必需证据缺失不标completed。
- [ ] 实际执行结束才写REPORT，逐项记录SC、命令/退出码、真实环境、预算、最终/合并SHA、Bridge交接及具体缺项。

## 验收契约（最多五项）

| SC | 必须实现的行为 | 必需证据 |
| --- | --- | --- |
| SC-0039-01 | **来源与隐私：** 必需来源可读且最小化；actor、分析授权、版本、作者正确；pending/撤权/删除不得泄露 | source adapter与隐私反例 + 运行来源清单 |
| SC-0039-02 | **自主性与可信内容：** 真实保存自动触发，具体动作可追溯；时间/歧义/否定/注入安全，不自动发消息或建任务 | 固定样例行为集 + 授权真实provider链 |
| SC-0039-03 | **语义和生命周期：** 跨来源同事项去重，忽略不复活，普通改写不重置阅读，过期/撤权抑制 | 事务/并发/源失效测试 + 双端处理回读 |
| SC-0039-04 | **有界运行：** 几万联系人无全量模型调用；分页、3条日限、重试、租约恢复、费用硬限实际生效 | 合成大数据与故障测试、成本和队列账本 |
| SC-0039-05 | **交付证据：** 两端事实→发现→证据→采纳/忽略闭环，收口检查与主线固定版本 | 运行矩阵、费用、退出码、SHA、执行后REPORT |

## 定向验证与预期结果

以下命令供实施期使用；新测试必须在相应Task中先创建并观察预期失败。本轮编制文档不运行这些尚不存在的测试，也不报告通过。

```sh
# cwd: /Users/xzhao/Projects/orbit/repos/orbit-app
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/notification-evidence-detail.test.ts tests/typed-notification-inbox.test.ts
npm run typecheck

# cwd: /Users/xzhao/Projects/orbit/repos/orbits
node --test --import tsx tests/services/notification-discovery.test.ts tests/services/notification-discovery-privacy.test.ts tests/services/notification-discovery-bounds.test.ts tests/services/inbox-record-service.test.ts
npm run typecheck
```

App测试覆盖UI、动作和账号生命周期；Web测试覆盖权限、业务状态、幂等和持久化。新增仓库/迁移/事务必须用隔离PostgreSQL验证跨进程持久性及竞态，内存测试不替代。收口命令为两端各自 `npm test` / `npm run typecheck`，Web `npm run build`；服务启动按已有运行配置，不假定存在npm start或固定端口。原生构建使用已有iOS配置和iPhone 17 Pro Simulator，不清缓存/重装来掩盖状态错误。

映射：SC-01～04由对应Task的行为测试及真实证据共同证明；SC-05由实际命令退出码、运行矩阵和主线SHA证明。0040还必须独立保留provider→设备链；所有未跑项明确写“未执行”，不能写通过。

## 失败、恢复与交接

遵守[项目共同约束](../NOTIFICATION_PROGRAM.md)：意外失败最多两轮局部修复，最多三次只读假设诊断；源权限/越权、重复副作用或事实造假是对应链路硬失败。停止依赖该链的动作，继续其他独立已授权工作，保存checkpoint恢复同一run。

费用沿用累计$5及真实账本，不在本Sprint重置。真实账号、服务或Push环境缺失只阻塞相应SC的运行步骤，先完成可执行代码/测试/调查；不得把模拟结果当真实验收。证据存App被忽略的build/harness-state/evidence/sprint-0039/run-01/，报告只保留必要脱敏结果。
