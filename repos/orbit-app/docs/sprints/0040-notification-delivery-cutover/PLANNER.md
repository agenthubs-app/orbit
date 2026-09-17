# Sprint 0040 — 推送、旧数据切换与整体验收实施契约

版本：2026-09-16 / v1。唯一 Generator 按 [RULES](../RULES.md) 实现，不启用额外实现/评审代理，不调用已卸载的工作流技能。

**目标：** 让消息和通知按独立偏好可靠送达，减少重复打扰，并安全替换旧通知数据与旧发送链。

**原需求：** N-06（可控打扰）、N-07（迁移与真实双端验收）；用户要求按已确认设定拆分新Sprint。[设计](DESIGN.md)及[项目接口/默认策略](../NOTIFICATION_PROGRAM.md)为本契约输入。

## 基线与进入条件

- 规划参考主线 chat-agent 的 a8ac3f761，实际开工必须重新记录 HEAD、dirty paths、Planner SHA256、文件/环境owner与run-01。不得把规划基线当运行验收版本。
- 0037～0039固定SHA已合并及对应验收完成；真实Push步骤需要可识别且授权的provider/project/token及可接收设备。缺Push环境不阻塞政策测试、迁移dry-run和同账号UI验证，但SC不得标全通过。
- 复用用户“按照这个设定”的产品方向批准和 RULES §0 适用实施授权；核实特定环境/副作用目标，不重复要求批准同一方案。
- 本轮只创建规划；启动时在README登记真实run。未运行不创建REPORT或证据目录。

## 文件白名单

路径均相对根仓库；产品命令在对应端cwd执行。

现有文件：

- `repos/orbits/features/notifications/delivery-service.ts`
- `repos/orbits/features/notifications/delivery-pass.ts`
- `repos/orbits/features/notifications/push-device-service.ts`
- `repos/orbits/features/notifications/expo-push-provider.ts`
- `repos/orbits/features/notifications/reminder-plan-service.ts`
- `repos/orbits/features/notifications/DELIVERY.md`
- `repos/orbits/app/api/notification-preferences/handler.ts`
- `repos/orbit-app/src/notifications/NotificationLifecycle.tsx`
- `repos/orbit-app/src/notifications/notification-model.ts`
- `repos/orbit-app/src/notifications/notification-sync.ts`
- `repos/orbit-app/src/notifications/native-notifications.ts`
- `repos/orbit-app/src/notifications/push-policy.ts`
- `repos/orbit-app/src/screens/settings/SettingsScreen.tsx`
- `repos/orbits/app/(app)/app/settings/orbit-settings-content.tsx`

拟新增（并非已存在）：

- `repos/orbits/features/notifications/delivery-policy.ts`
- `repos/orbits/features/notifications/legacy-cutover.ts`
- `repos/orbits/scripts/migrate-notification-inbox.ts`
- `repos/orbits/tests/services/notification-delivery-policy.test.ts`
- `repos/orbits/tests/services/notification-cutover.test.ts`
- `repos/orbit-app/tests/notifications/notification-channel-isolation.test.ts`

共用接线：App `src/i18n/{messages,zh,ja,en}.ts`，Web现有语言/主题入口、本Sprint列出的测试及其直接行为测试；涉及共享类型时修改Web唯一源与现有同步配置，App生成副本只用sync:contract。必要存储迁移、生产入口和上述模块的service-factory按RULES §0查实后追加精确路径、用途与对应SC，不借机扩范围。

文档交接：本Sprint执行后REPORT、登记表，以及由协调者更新的bridge/status.md、bridge/handoffs.md和本Sprint交接文件。

排除：不扩大到生产数据清洗或未授权发布、不删原始业务数据、不清空账号/设备缓存、不用Simulator注入通知冒充远程送达。

## 实施任务（每项先RED，再最小实现，再GREEN）

### Task 1：策略和偏好

- [ ] 写账号日界线/DST、时区切换、2/1配额、建议静默、22–08、夜间显式提醒、三类开关、消息免打扰和锁屏正文的RED测试。
- [ ] 扩展已有偏好服务和两端设置；使用事务预留/结算投递额度，保持OS拒绝与应用内状态区别。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 2：投递身份和生命周期

- [ ] 写并发worker/多设备、provider超时、token撤销/换号、源取消、已读、snooze改期、本地→服务端交接竞态与深链接的失败测试。
- [ ] 复用现有provider/device/ledger实现唯一投递所有权，发送前重新核对，明确取消失败与重试状态。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 3：可恢复迁移

- [ ] 在隔离数据库写包含有效用户提醒、旧自动多阶段、空话fixtures、已读/忽略和历史会话的样本，先验证dry-run零写入及反复apply幂等。
- [ ] 输出脱敏盘点与回退映射，核实精确目标和既有授权再apply。验证回退不丢用户计划、不重发已送达内容；不假定当前恰有40条。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 4：整体真实链与收口

- [ ] 按下述矩阵跑Web/App和真实provider→设备；迁移前后对账并验证新旧producer互斥。
- [ ] 两端收口检查、生产Web重建/重启、原生安装与合并树回读；更新DELIVERY/Bridge和执行报告，不宣称未做的远程部署。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 5：验证、交接和主线收口

- [ ] 按下方测试映射检查所有SC；所有Web/API/共享变更先production build、重启、health，再验App。保留同一记录的双向回读。
- [ ] H档收口时运行一次受影响端集成/全量与typecheck，App共享副本校验及当前原生构建/启动；不按每个Task重复全量。
- [ ] 检查diff与GitNexus detect_changes，提交固定SHA并按既定流程集成chat-agent；验证真实合并树，未合并或必需证据缺失不标completed。
- [ ] 实际执行结束才写REPORT，逐项记录SC、命令/退出码、真实环境、预算、最终/合并SHA、Bridge交接及具体缺项。

## 验收契约（最多五项）

| SC | 必须实现的行为 | 必需证据 |
| --- | --- | --- |
| SC-0040-01 | **频率与隐私：** 2/1配额、静默建议、安静时段及用户例外、多设备原子限额、三类偏好与锁屏隐私 | 时钟/事务/偏好测试 + 设置运行证据 |
| SC-0040-02 | **消息与投递：** 消息独立免打扰/60秒声音，关闭AI仍正常；唯一投递者、撤销、竞态、Push直达且真实送达 | 竞态测试 + 授权provider回执及设备证据 |
| SC-0040-03 | **旧流安全切换：** 盘点/dry-run/apply/回退幂等；保留原业务和显式计划，无证据旧数据不重放，旧新互斥 | 隔离数据库迁移测试 + 授权目标前后对账 |
| SC-0040-04 | **整体业务闭环：** 消息双账号以及同账号笔记发现→来源→采纳/忽略/完成→抑制，删除/撤权/过期/三语正确 | 共同Web + iPhone17Pro矩阵；远程Push另留设备证据 |
| SC-0040-05 | **主线交付：** 最终受影响端检查、固定提交/合并树、Bridge与逐SC报告真实完整 | 命令/退出码、版本/费用、SHA、未完成项清单 |

## 定向验证与预期结果

以下命令供实施期使用；新测试必须在相应Task中先创建并观察预期失败。本轮编制文档不运行这些尚不存在的测试，也不报告通过。

```sh
# cwd: /Users/xzhao/Projects/orbit/repos/orbit-app
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/notifications/notification-channel-isolation.test.ts tests/notifications/merged-notification-lifecycle.test.ts tests/notification-sync.test.ts tests/notifications/notification-registration-races.test.ts
npm run typecheck

# cwd: /Users/xzhao/Projects/orbit/repos/orbits
node --test --import tsx tests/services/notification-delivery-policy.test.ts tests/services/notification-cutover.test.ts tests/capabilities/notification-delivery-ledger.test.ts tests/api/notification-delivery-route.test.ts
npm run typecheck
```

App测试覆盖UI、动作和账号生命周期；Web测试覆盖权限、业务状态、幂等和持久化。新增仓库/迁移/事务必须用隔离PostgreSQL验证跨进程持久性及竞态，内存测试不替代。收口命令为两端各自 `npm test` / `npm run typecheck`，Web `npm run build`；服务启动按已有运行配置，不假定存在npm start或固定端口。原生构建使用已有iOS配置和iPhone 17 Pro Simulator，不清缓存/重装来掩盖状态错误。

映射：SC-01～04由对应Task的行为测试及真实证据共同证明；SC-05由实际命令退出码、运行矩阵和主线SHA证明。0040还必须独立保留provider→设备链；所有未跑项明确写“未执行”，不能写通过。

## 整体真实运行矩阵

| 场景 | 操作与观察 | 必需环境 |
| --- | --- | --- |
| 联系人通信 | A在Web发送，B在App收到并回复；A的Web/App重开回读同一会话。通知全部已读后，新消息仍未读；关闭AI不影响收发 | 两个已授权测试账号，共同后端 |
| 有期限的笔记 | A在Web保存未来明确承诺，后台自动发现；App打开原文与具体时间，稍后提醒后Web读到新计划版本 | 同账号、真实provider、有效未来时间 |
| 无期限的建议 | A在App保存有具体价值但无日期的笔记，Web看到建议且没有编造截止；双端重复接受只创建一个任务 | 同账号、真实provider、持久化回执 |
| 关闭提醒 | App忽略建议后Web同步；源任务完成后待发提醒取消；重复扫描不新增或恢复未读 | 同记录ID、扫描与投递账本 |
| 源失效 | Web删除或撤销来源权限后，App刷新不再显示正文；推送发送前再校验并抑制 | 受控QA来源/权限，不触碰其他真实数据 |
| 多设备投递 | 同一账号多个设备/worker竞争限额，验证只有一个提醒执行者；故障恢复不重复发送 | 隔离事务测试加至少一个实际接收设备；不足不得声称多设备运行已验 |
| 推送目的地 | 真实消息Push打开会话，提醒打开具体事项，建议打开来源详情；锁屏默认不泄露正文 | 授权provider项目、有效token与支持远程Push的设备 |
| 安静时段与设置 | 测试时钟验证22–08延期、用户显式夜间例外、过期不补推；真实设备验证免打扰和权限拒绝下应用内内容保留 | 定向时钟测试与设备设置证据分别记录，不伪造等待一整夜 |
| 旧流切换与回退 | dry-run零写入；按映射apply保留用户计划和阅读状态；回退不丢业务对象、不重发已投递内容 | 隔离数据库先验证，再对精确已授权目标操作 |
| 展示与异常 | 消息和三类通知分别覆盖中文/日文/英文、暗色、大字号、空态、加载失败、删除/无权限 | 当前构建Web和iPhone 17 Pro Simulator |

每行记录实际版本、脱敏账号/源/通知ID、动作、预期与实际结果、证据路径。真实provider失败、无设备或费用不足均明确保留缺项；确定性测试不能替代真实链路结果。

## 失败、恢复与交接

遵守[项目共同约束](../NOTIFICATION_PROGRAM.md)：意外失败最多两轮局部修复，最多三次只读假设诊断；源权限/越权、重复副作用或事实造假是对应链路硬失败。停止依赖该链的动作，继续其他独立已授权工作，保存checkpoint恢复同一run。

费用沿用累计$5及真实账本，不在本Sprint重置。真实账号、服务或Push环境缺失只阻塞相应SC的运行步骤，先完成可执行代码/测试/调查；不得把模拟结果当真实验收。证据存App被忽略的build/harness-state/evidence/sprint-0040/run-01/，报告只保留必要脱敏结果。
