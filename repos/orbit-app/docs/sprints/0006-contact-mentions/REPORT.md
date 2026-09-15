# Sprint 0006 — 执行总结

## 目标实现情况

- IORBIT 编辑器现在可按姓名或公司搜索联系人，选择结果携带稳定 contact ID；同名联系人通过公司、职位和 ID 区分。已选联系人显示为可移除的 `@` 引用，发送时随 protocol v2 可靠请求保存。
- 联系人详情、联系跟进、收件箱润色、跟进任务／提醒候选这四组已批准入口改为一次性模板预填。路由只携带不含业务文本的意图 ID，用户仍可编辑，点击发送前不发起模型请求，也不会自动发信、建任务或建提醒。
- 可靠发送和 canonical session 保存都会先按当前 actor 验证 contact reference。无权限、已删除和跨账号引用统一拒绝；联系人服务不可用返回可重试失败。旧客户端省略已有引用时保留原值，试图替换同一消息的引用会冲突。
- 本地功能实现、浏览器交互、服务端权限和持久化回读均已验证。当前没有同版本、同账号的真实 Web／App 环境，因此 SC-0006-05 要求的真实双端引用往返仍 blocked；未用夹具冒充该证据。

## 运行记录

- 目标／原需求：R-06；B 线按 0005 → 0021 → 0006 顺序完成所有可执行 epoch。
- 结果：blocked（功能已提交；真实同账号 Web↔App 引用回读证据未完成）。
- run：run-01；Generator owner `/root`；2026-09-15 JST 开始，2026-09-15 02:41 JST 收口。
- Planner revision／启动 SHA256：revision 2；`303ad11647d89384ff31d64cb7d125a660dc95026028a8bc83aaa15c6d90f173`。
- 基线 HEAD／承接的脏文件：`75eca33e9`；启动时 tracked 工作树干净。
- 被验收的最后功能 HEAD：`09e1a71fa`。
- 原环境／账号角色／设备：本地 Node、React Native Web／Playwright、内存 live-record store；没有真实业务账号、iOS 构建或部署。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 一次性模板预填、联系人 picker／引用 chip、四组业务入口转入 IORBIT | App AI、联系人、跟进、收件箱 screen／view-model 与测试 | `09e1a71fa` | 01、03、04、05 |
| 服务端引用验权、user message 引用持久化、旧客户端合并与不可替换规则 | Web conversation route、session handler、reliable send、session provider 与测试 | `09e1a71fa` | 02、04、05 |
| 补齐 `ai-sessions` 公共类型出口并用同步脚本更新 App 副本 | Web／App contract index | `09e1a71fa` | 02、05 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0006-01 | pass | App 真实组件／浏览器 picker 测试 | 部分姓名、公司过滤和两个同名联系人均按稳定 ID 选择；发送体断言对应引用。 |
| SC-0006-02 | pass | Web authorization、reliable route、session API 与 live store 测试 | actor 可读后才持久化／执行；越权与删除统一 403，服务不可用 503；历史保留原 ID，旧快照不能替换。 |
| SC-0006-03 | pass | 联系人详情、Followups、Inbox 和 app-wide 入口测试 | 批准的 1／2／3／7 全部只导航并预填，发送前 0 POST；草稿保留，既定例外入口未改。 |
| SC-0006-04 | pass | 空引用普通问题、联系人空数据／加载失败、服务拒绝测试 | 普通任务无需联系人；picker 不可用时保留问题并允许无引用发送，服务端失败可解释。 |
| SC-0006-05 | blocked | App 保存载荷和 Web session 回读分别通过；邮件模板明确只生成可编辑草稿且无自动发送 | 缺同一真实测试账号在同版本 Web 和 App 之间发送、重开和回读同一引用的运行证据。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| App 0006 AI／联系人定向集合 | `09e1a71fa` 前最终 diff | 134 pass、0 fail | 01、03、04、05 |
| Followups source＋浏览器 | 同上 | 17 pass、0 fail | 03、04 |
| Inbox lifecycle／source | 同上 | 95/95 与 12/12 | 03、04 |
| App-wide 与联系人旧入口回归 | 同上 | 44/44 与修正后 7/7 | 03 |
| Web 0006 route／authorization／origin／session 集合 | 同上 | 23 pass、0 fail | 02、04、05 |
| 可靠发送、契约出口、Web agent 请求体回归 | 同上 | 18 pass、0 fail | 02、05 |
| `npm run sync:contract`；App contract sync | 同上 | 同步 17 个 contract、5 个 schema、2 个字典；3/3 pass | 02、05 |
| App／Web `npm run typecheck`；`git diff --check` | 提交前最终 diff | 两端 exit 0；diff check exit 0 | 01～05 |
| App 全量 `npm test` | 提交前最终 diff | 首轮 2603/2604，唯一旧 `/inbox` 入口断言已按批准行为修正；最终 2604/2604 | 01、03、04 |
| Web 安全全量 `npm test` | 提交前最终 diff | 最终 3252：3020 pass、48 fail、184 skip；B 线相关 4 项修复后消失 | 02、04、05 |

Web 剩余 48 项为当前仓库既有运行时覆盖／产品清单审计、活动注册基线、密码重置队列配置和未配置 `ORBIT_EVENT_DATABASE_URL`／本地迁移数据库；0006 定向集合通过，未宣称 Web 全量通过。最终两次 Web 全量均显式 unset OpenAI、DeepSeek、Gemini／Google 和 Anthropic 密钥。

未运行同账号真实 Web↔App 往返和当前 iOS 原生交互，因为本 run 没有可用的同版本部署、测试账号与原生构建。GitNexus 索引绑定其他旧 checkout，当前 8475 worktree 的 staged detect 返回 0；实际 staged diff、直接消费者测试和全量回归用于补审。

## 交接

- 已验证成果／仍欠功能：本地产品实现全部进入 `09e1a71fa`；只欠 SC-0006-05 的真实双端运行证据。
- 未提交改动、文件所有权及活进程句柄：功能提交后只剩本报告、Planner 运行记录和 Sprint README；测试进程均已退出。AI／Followups 文件已释放并把 SHA 交给 C 线 0022。
- App／API 实际版本、另一端影响：App 和 Web 共同使用 protocol v2、origin schemaVersion 1 与 `AiSessionReferenceContract`；旧客户端省略引用可兼容，替换已存引用会收到冲突。
- 费用：硬上限仍为 `$5`，此前 B 线已记录累计 `$0.012780`。本轮没有主动发起真实模型调用；第一次 Web 全量在发现宿主存在模型密钥后约一分钟内中断，未取得供应商用量，故本轮增量费用未知，不能记为 0。随后所有 Web 全量均显式 unset 模型密钥。
- 已知风险／恢复或回退方式：模板预填只存于当前 App 进程且一次性消费，进程重启会丢失未打开的预填；用户可从原业务入口重新进入。功能回退可反向应用 `09e1a71fa`，不得删除已保存会话。
- 下一步／依赖恢复条件：准备同版本 Web/API 与 App、同一授权测试账号和至少一个可访问联系人；App 发送带引用问题，Web 重开核对 ID，再由 Web 续聊并在 App 重开核对。完成后可把 SC-0006-05 和 Sprint 状态改为 pass／completed。
