# Sprint 0005 — 执行总结

## 目标实现情况

- 本轮建立 Web／App 共用的可靠发送协议：客户端在首次发送前固定 session、message、request ID，服务端先保存用户消息，再执行生成，并用请求记录恢复重复、超时和保存失败。
- 已验证相同请求只执行一次，相同 ID 换内容被拒绝，不同请求不能争用同一消息 revision；模型结果已经返回而助手消息保存失败时，只补写消息，不再次执行模型。旧短快照不能截断新历史，删除后的迟到保存不能复活会话，101 条消息可完整回读。
- App 对未知结果先查询、保留草稿和稳定 ID；Web 打开已保存会话不再自动 POST。两端类型和同步契约一致。
- 真实同账号 Web↔App 设备往返、真实模型成功调用和 R-00 首次 503 根因仍缺外部环境证据，因此本 Sprint 按 `blocked` 登记，未把本地实现完成冒充全部验收完成。

## 运行记录

- 目标／原需求：R-00、R-02；可靠重试与跨端续聊。
- 结果：blocked（产品实现已提交；SC-0005-04 的真实双端设备验收与 SC-0005-05 的真实模型／503 根因证据未完成）。
- run：run-01；Generator owner `/root`；2026-09-14 至 2026-09-15 00:19 JST。
- Planner revision／SHA256：revision 1；`4b7910b723924b457a36769ecbce8d565f371f5e38191125eabab80a4cffe089`。
- 基线 HEAD／承接的脏文件：`fca77373f123c03e29a0584cba46bade5f5eb907`；tracked 工作树干净。
- 被验收的最后功能 HEAD：`30c1e210c`。
- 环境：本地 Web／App Node 测试，隔离 PostgreSQL schema；未使用真实账号或原生设备。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 可靠发送状态机、输入摘要、结果恢复和 session revision 原子占用 | `repos/orbits/features/orbit-ai/reliable-send-service.ts`、`storage/orbit-agent-chat-request-store.ts` | `30c1e210c` | 01、02、03 |
| Web v2 route、请求结果查询、恢复会话零自动 POST | conversation route、session handler、`orbit-real-agent.tsx` | `30c1e210c` | 01、02、04 |
| 不可变消息 ID、旧快照与 tombstone 保护、完整历史保存 | session live record provider | `30c1e210c` | 03、04 |
| App 稳定 ID、未知结果查询、可靠回执与契约同步 | `AiConversationScreen.tsx`、App contract/schema | `30c1e210c` | 01、02、03 |
| 并发、恢复、路由、存储、渲染和真实 PostgreSQL 回归 | 对应 Web／App tests | `30c1e210c` | 01～04 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 范围 |
| --- | --- | --- | --- |
| SC-0005-01 | pass | Web 定向 42/42；重复／并发请求模型执行计数为 1；恢复 Web 会话 0 POST | 本地 route、组件和存储 |
| SC-0005-02 | pass | App 定向 83/83；未知结果先 GET；助手保存失败重试执行计数仍为 1 | 本地网络／存储故障注入 |
| SC-0005-03 | pass | actor 隔离、历史携带、旧 revision 冲突、101 条消息与删后晚到写测试通过 | 本地 memory 与隔离 PostgreSQL |
| SC-0005-04 | blocked | 共享契约、同记录读写与 Web 零自动 POST 已测；未取得同账号真实 Web→App→Web 和反向设备证据 | 外部账号／设备缺口 |
| SC-0005-05 | blocked | 本轮没有付费模型调用；没有复现或定位原 R-00 首次 503 | 真实 provider／原请求证据缺口 |

## 最小验证与未运行项

| 命令／场景 | 结果 | 对应范围 |
| --- | --- | --- |
| Web 五个定向文件 `npx tsx --test ...` | exit 0，42 pass | route、session、幂等、恢复 UI |
| App 两个定向文件，带正式 render hooks | exit 0，83 pass | 发送、恢复、渲染 |
| Web／App `npm run typecheck` | 两端 exit 0 | 类型与同步契约 |
| 显式隔离 URL 的 PostgreSQL 测试 | exit 0，1 pass | 跨 store 请求与 revision transaction lock、actor 隔离 |
| `git diff --cached --check` | exit 0 | 提交范围 |
| GitNexus `detect_changes(scope=staged)` | 返回 0 变更；索引绑定 `/Users/xzhao/Projects/orbit`，无法读取当前 worktree diff | 已用 staged diff 人工补审 22 个文件 |

App 全量曾在修复前得到 2589 pass／1 fail，唯一失败是 Node 渲染时初始化 `expo-crypto`；加入测试桩后该文件 5/5、最终相关集合 83/83，未把局部重跑记成最终全量。Web 全量因既有未配置数据库和 runtime audit 证据失败而 exit 1；本轮新增路径均在上述定向集合通过。真实双端、原生设备和真实模型验收未运行。

## 交接

- 0021 应扩展现有 `ai-sessions` v2 契约，复用稳定 ID 与 `messageRevision`，另设 organization revision；不得重建发送幂等。
- 0006 可消费现有受控 `references` 字段，但服务端联系人验权尚未实现，不能把字段存在视为引用可用。
- 未提交产品改动：无。报告与登记表在本报告提交中记录。
- 费用：0 次新增真实模型调用，原累计 `$0.012780` 不变，硬上限 `$5` 不重置。
- 回退：功能提交为 `30c1e210c`；需要回退时以独立 revert 处理，不改写历史。
- 解除 blocked：同一授权账号完成双向设备续聊并核对顺序／元数据；取得 R-00 原 503 最先失败层和处理证据及一条允许的真实生成记录。
