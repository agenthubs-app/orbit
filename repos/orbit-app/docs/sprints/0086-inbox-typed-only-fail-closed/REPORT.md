# Sprint 0086 — 执行报告

## 结果

**completed。** 五项 SC（含 03b）均有证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。唯一 run-01。
批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256 `8a4003dd…`（登记表）。

## 先用人话说

你问的三件事，答案分别是"已合并""没启用""数据库有残留"——三个都成立，而且互相叠加：

1. **已合并**：0037–0040 四个 SHA 都在 `chat-agent` 祖先链上。三类通知的**界面早就写好并合进主线了**，只是被一个账号白名单关着。
2. **没启用**：`ORBIT_TYPED_INBOX_ACTORS` 只配过一个 QA 账号，其它账号一律回落到旧的提醒流。同一个开关还挡着通知投递与发现的偏好接口，所以设置页那两块通知设置常年 404、静默消失。
3. **数据库残留**：种子写进 `notifications` 的 40 条"复核与 X 的下一步"没有可核验的目标，旧链的安全投影就把每条都改写成"来源已不可用"。0040 本该隔离它们的迁移从未执行过。

处理完之后：收件箱通知页是设计里的三类（全部／提醒／建议／动态／历史记录），4 条真实提醒；旧链返回 0 条；设置页出现"通知与消息"且 console 无错误。

按你的要求，**不可归类的记录在查询时就失败**：`kind` 不属于三类，或缺标题／原因／来源的记录，整个读取抛 `INTEGRITY_VIOLATION`（409，带违规 id，不带内容），而不是渲染一行看不懂的占位。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `9dac87258` |
| 功能提交 | `f069df7e6` feat(sprint-0086) |
| 合并 | `ada15ee26` merge(sprint-0086)（`--no-ff`） |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0086-01 复现与迁移 | pass | 迁移前演示账号 `/api/notifications` 返回 40 条、标题全是"来源已不可用"；`quarantine-legacy-notifications.ts` dry-run 命中 40／40（kept 0）→ apply → 复跑收敛为 0；记录保留并打 `quarantinedAt` + `quarantineReason`，`lifecycle_state` 改为 archived，receipt 落 scratchpad（mode 600）。迁移后旧链 0 条 |
| SC-0086-02 三类通知默认启用 | pass | 三个接口对演示账号均 200（此前 notifications 返回 `enabled:false`，两个 preferences 404）；路由单测覆盖"任意账号启用 + 仅显式 opt-out + 退役变量不再生效" |
| SC-0086-03 读取即失败 | pass | `inbox-record-service.test.ts` 新增三例：非法 `kind` → `INTEGRITY_VIOLATION` 且 message 含违规 id（list 与 get 均失败）；缺 title／reason／sources 同样拒绝；来源消失的记录退出默认列表与未读数、保留在历史 |
| SC-0086-03b 设置页两块通知设置 | pass | 截图 `sprint0086-phoneweb-settings.png`：设置页出现"通知与消息"（联系人消息、自动通知配额说明等），phoneweb console 0 错误（此前 2 条 404） |
| SC-0086-04 列表符合设计 | pass | 截图 `sprint0086-phoneweb-inbox-typed.png`：类别筛选 全部／提醒／建议／动态／历史记录，4 条提醒各有具体标题与提醒时间，无"来源已不可用"；对照 `sprint0086-before-inbox.png` |
| SC-0086-05 种子与无回归 | pass | 种子新增内容门槛守卫，不再写入"复核与 X 的下一步"；orbits 定向 21/21、通知能力 18/18、typecheck 0 |

## 与 PLANNER 的偏差（如实）

- **判断 2 作废，App 零改动**：PLANNER 以为需要把 App 收件箱从旧接口切到 `/api/inbox/notifications`。实际 `RelationshipInboxScreen` 早已内置 `useNotificationInbox` + `NotificationInboxList` 的三类界面，只在 `typedEnabled` 为真时渲染。退役白名单后它自动接管。我一度按 PLANNER 改了 App 的数据源与视图模型，发现真相后**已全部回退**，本 Sprint 不含 App 改动。
- **判断 3b 落地为"退出默认列表"**：来源消失的条目不再出现在列表与未读数里，保留在"历史记录"。
- **旧链未删除**：`/api/notifications` 仍在，供其它消费者使用；本 Sprint 只让它跳过已隔离记录。
- **生产切换未做**：退役白名单会同时影响生产 Neon 账号，按 PLANNER 列为单独运维步骤，本轮只在本机验收。

## 已知失败（均与本改动无关，已核实）

- `business-card-scan-ocr-live-store.test.ts` 2 例失败：把本 Sprint 改动 stash 后同样失败，属既有环境问题（云 OCR 未配置）。
- App 全量 3508 中 3 例在并行负载下超时（44pt 触摸目标、任务模式切换、通知注册竞态），单独重跑全部通过。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npx tsx scripts/quarantine-legacy-notifications.ts`（dry-run → apply → 复跑） | 40/40 → 0 |
| orbits 定向（inbox service／routes／business projections／postgres） | 21/21 |
| orbits 通知能力（delivery ledger／reminder mock／reminder live store） | 18/18 |
| 两端 typecheck | 0／0 |

## 下一步

生产环境的白名单退役与旧记录隔离需单独安排；旧 `/api/notifications` 的其余消费者可在后续 Sprint 收敛掉。
