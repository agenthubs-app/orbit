# Sprint 0040 执行报告

run-01 / 2026-09-16 / **blocked：代码已交付并合并，真实远程推送与模型闭环未验收**。

消息、提醒、建议和动态已接入独立系统推送偏好、会话免打扰、默认锁屏隐藏、安静时段、去重限额与可恢复切换。共同 Web/API 和 iPhone 17 Pro 已验证设置双向回读、关闭 AI 且会话免打扰时仍收到联系人消息，以及三语设置。真实 QA 完成 dry-run、apply、rollback、再次启用，14 条原业务记录的哈希一致。缺实际 Push 项目/注册/接收设备和已对账 AI 预算，不能将确定性测试算作真实送达或真实发现。

## 版本与重叠

- Planner SHA256 `de08d8ed7560c0321afa9a2bf4b2e5b950db9218c83fd6f268ba7f8bcdd665ee`；基线 `562373393`；唯一 Generator 为当前 session；分支 `codex/e-line-sprint-0040`。
- 功能提交 `eacd7a227`；chat-agent 合并树 `0b552649deb2c287c28a9fa2a00a63983576c7fc`。主线 `78f33b29b` 的中文离线读取设计保留；合并树与本线只差这份文档，产品代码一致。未 push、部署或清理生产数据。
- 0033 所在9174工作树 `1c8b442e1` 检查时 tracked clean，0035 尚未编辑通知协调器。没有改 sync/outbox/query-service/manifest 或另一线的 Simulator、3108/8082。0035 后续合并仍需验证通知与同步回调组合。
- 必要文件补充见 DESIGN，Web 为 contract/schema 唯一源，App 通过 `sync:contract` 生成副本。根 AGENTS/CLAUDE、未跟踪 GitNexus/旧设计文件保持原状，未提交。

## SC → 实现 → 验证

| SC | 交付内容与证据 | 结论 |
| --- | --- | --- |
| 01 频率与隐私 | 账号时区/DST、22–08 延期及过期抑制、用户夜间例外、自动2/建议1配额、跨设备事件预留、时区变化24小时保护；四通道开关、会话免打扰、锁屏默认隐藏，CAS及actor隔离；Web/App真实偏好回读 | 策略/PG/运行设置通过；未声称真实等待一夜或多设备远程送达 |
| 02 消息与投递 | 真正消息来源独立于AI；60秒会话声音窗口；本机取消成功才确认当前generation；旧/新lane隔离、租约CAS、发送前权限/已读/源状态重查；未知provider结果不重发，已知ticket可恢复；opaque ID认证导航 | 定向、真实PG、App收到真实消息通过；真实provider→设备及实际注册交接 blocked |
| 03 旧流安全切换 | actor事务、显式workspace/batch/hash、dry-run零写入、持久映射、重复apply幂等；保留用户计划与历史；回退不覆盖用户改动或晚到回执，旧producer继续隔离 | 隔离PG反例和实际QA迁移/回滚/再次启用通过；QA未含旧空话样本，不声称清理了40条 |
| 04 整体闭环 | 0037/38已固定的消息/三类通知；本轮设置双向、AI关闭后真实入站、原生三语/暗色/大字号；原生来源路由补齐 | 部分验证。真实模型→发现→动作→推送未执行；本轮原生回复发送未确认，不能以旧轮证据替代完整新矩阵 |
| 05 主线交付 | 单次两端全量、必要定向修复、类型、Web生产重建重启、原生Release安装启动、固定SHA合并、合并树Web16/App129及类型检查 | 代码交付与报告完成；全量失败和外部缺项保持可见，Sprint不标completed |

## 实现要点

新增 `delivery-policy`、事务偏好/配额仓库、typed source/factory/worker 和迁移服务/CLI。复用原有 `notificationDeliveries`、加密设备仓库和 Expo adapter。偏好读取独立于 push vault，缺密钥不会让设置不可用。旧显式提醒派发与切换共用账号事务锁，避免切换瞬间双响。旧自动多阶段意图退出执行，原始业务和用户明确计划保留。

设备交接在原生通知队列内先取消 Orbit 本地计划，全部成功后才向服务端确认当前 generation；未注册或取消失败不会取得 server ownership。发送尝试在 provider 调用之前持久化，超时保持 `receipt_unknown`，有已知ticket时恢复对账，不因本地保存失败重复请求。默认推送仅含 deliveryId；解锁后重新认证并验证当前来源。原生 `inbox/sources/[id]` 补齐0039同路径，复用已有认证详情，不复制权限模型。

运行及迁移说明同步到 Web `features/notifications/DELIVERY.md`。回滚不是恢复旧自动通知：未改动归档可恢复，已退役自动意图继续隔离，设备回到local；重新启用必须新批次/新generation。

## 命令、结果与失败历史

证据位于本地被忽略的 `build/harness-state/evidence/sprint-0040/run-01/`；命令日志由 `/tmp/orbit-0040-*.log` 复制到其 `commands/`，不含登录凭据。没有把局部通过记成全量通过。

- 策略、lane、actor隔离/延期、adapter静音、旧路由隔离、未知结果/ticket恢复、原生所有权、认证目的地、迁移均先观察失败再实现。API测试首次从错误cwd调用tsx的失败属于命令失败，不算业务RED。真实PG来源首次暴露已有 text 与 timestamptz 比较错误（42883），补显式cast后通过。
- Web定向 `web-target` **38/38**，包含真实PG；新租约CAS真实PG **1/1**；provider成功后本地ledger失败恢复 **2/2**。原生首组 **24/28**，新组件/API/标签夹具修复组先 **22/23**，再 **23/23**，保存全部日志。
- App `npm test` **2955：2942通过、13失败、0跳过**，exit1。12项为新增偏好/ownership读请求、标签或监听器夹具边界；1项为0039来源路由缺口。修复后五个受影响完整文件 **179/179**（`app-full-repair`）；没有重跑全量或宣称全量通过。
- Web `npm test` **3521：3424通过、25失败、72跳过**，exit1。既有21项包括审计13、旧contract2、旧报名3以及联系人文案/主页/scratch各1；新消息夹具1和共享PG并发冲突3。串行定向10项中PG通过、仅消息夹具失败；修复多个visibility监听器的测试边界后 **5/5**（`web-message-repair`）。未修改无关基线，未重复全量。
- `npm run sync:contract` exit0；两端最终 `npm run typecheck` exit0；Web `npm run build` exit0。生产服务已重启，health `live/ok` 后再验App。原生Release构建 exit0，包含最终来源路由，安装启动成功。
- 合并树 `0b552649d`：Web `node --test --import tsx --test-concurrency=1` 对策略/策略PG/迁移/路由/typed-worker/真实source/租约PG/偏好API/投递API九文件 **16/16**，exit0；App `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs` 对ownership/navigation/merged-lifecycle/registration-races/relationship-inbox五文件 **129/129**，exit0；两端完整typecheck exit0。
- GitNexus 提交前 staged：63文件、74索引项、0已索引受影响流程、LOW；新符号UNKNOWN另读直接调用链。此前reminder service/factory CRITICAL影响已告知并覆盖旧消费者，不把索引缺覆盖解读为0风险。`git diff --cached --check` exit0。

## 实际环境与运行证据

Web `http://127.0.0.1:31037` production/live；DB `orbit_qa_sprint0037_20260916`，workspace `workspace:qa:sprint0037`。QA A `user_mu393kmp_ss48sg`、B `user_mu393ktl_6qoc1c`；iPhone17Pro `9BF990F2-45B8-42CE-8543-E583B941DA17`，bundle `app.agenthubs.orbit.sprint0037qa`。运行的是功能提交的同一产品树；主线仅多一份设计文档。

- Web关闭建议推送 revision1，App回读关闭（`native-web-prefs-readback.png`）；App打开后Web读revision2（`native-suggestion-on.png`、`web-settings-native-readback.json/png`）。App开启会话免打扰revision3，服务端回读相同conversation ID。
- App关闭AI后，B通过真实认证Web API发消息，返回201，A的原生App显示新正文和真实称呼（`native-ai-off-message.png`、`messages-ai-off-read.json`）。QA脚本错误要求200导致发送后报错，随后只读确认，未重复发送。消息分析授权仍开启，发现开关关闭；免打扰影响推送，不影响会话内容。
- 本轮原生回复尝试遇到离屏AX坐标/键盘焦点与列表刷新，服务端仍为5条消息，没有新原生出站。`native-ai-off-reply*.png`、`messages-ai-off-native-reply.json` 是尝试记录，即使文件名含confirmed也**不是发送成功证据**。保留未确认结果；未用API代发冒充App回复。0037有原生回复证据，本轮不据此标满整个新矩阵。
- Web中/英/日设置各6控件；英文dark截图。原生中文light、英文dark/accessibility-large及日文light当前构建截图已检查，通知设置文案可读、换行正常。旧导航返回按钮在英/日仍为中文“返回”，保留为既有导航文案限制，不宣称全屏三语无遗漏。
- 实际dry-run hash `23b77552655d00f48adbb99377b79b900c6348538f76c6ba3adc0ec6b39770cb`，0条修改、无阻塞，保留显式plan `reminder:7b05144fd4a746a99cfcf7dd`。批次 `sprint0040-qa-a` apply generation1，再rollback；批次 `sprint0040-qa-a-reenabled`重新启用generation3。前/后/最终14条原业务记录hash均为 `e0fded0306435277e78224e13012815287efeca35fd545778e940d2fec11c273`，覆盖note/task/plan/inbox/interaction/message/read；见 `migration-rollback-readback.json`。旧空话/多阶段归档反例由隔离PG fixtures验证，实际QA不存在这些旧样本。
- 收尾恢复QA A中文、发现开启、原会话不静音，保留消息分析授权、四通道开启、默认锁屏private与安静时段；见 `qa-restored.json`。无有效远程注册设备，实际所有权未确认给server，不能声称真实取消→注册→远程送达已发生。

## 未完成项与恢复条件

1. **真实AI发现和0040依赖矩阵**：沿用累计$5，已结算$0.012780以外，0020意外历史增量仍未知，三次只读对账没有原始结算证据；专用provider也未配置。本轮0模型/OCR调用。需先补原费用记录并配置专用provider，再用真实未来来源验证发现/原文/采纳/忽略/完成及失效；不能把未知当0或另开预算。
2. **远程Push、原生所有权和真实点击目的地**：当前运行配置及process环境均无 `ORBIT_PUSH_TOKEN_KEY`、Expo send/access/receipt配置和EAS project ID，没有实际注册的接收设备；只读检查结果 `provider-availability.json`。需要可识别的授权项目、真实注册和支持接收的设备后跑provider→ticket→receipt→设备→认证目的地。没有注入Simulator通知或伪造token。
3. **当前构建原生出站确认与完整展示矩阵**：本轮有真实入站，原生出站自动化尝试未成功确认，达到局部诊断上限。需可靠的原生输入/点击再回读同一message ID；全场景三语/删除/无权限的真实发现记录也依赖第1项，不能只用设置截图替代。
4. **全量既有失败**：保留上述21项Web基线与一次全量失败历史；当前改动的受影响复验、合并检查通过不代表整个仓库全绿。未经要求不扩大修复到审计、注册、主页等无关模块。

所有独立代码、策略/事务/生命周期验证、共同设置/入站、迁移对账和主线交付已执行；剩余真实链需上述环境/账本或新的原生操作证据，不能靠重复测试或空转补齐。run-01在此关闭为blocked，不自动开启第二次Generator。20分钟跟进按原约定暂停；本线发现watch worker停止，Web服务保留供查看。BR-028记录相同范围和缺项。0037/0038 completed；0039/0040均代码交付但真实链未验收，不宣称四个Sprint全部完成。
