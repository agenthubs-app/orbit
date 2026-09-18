# Sprint 0046 — 可重复真实交互与通知来源校验

Plan revision：1；existing-codebase / single-generator。原需求：R-11/R-14及用户“所有功能实际交互测试”；B/C错包校正、C/D缺有效样本与legacy提醒来源已删除。单一目标：[有效版本/样本下完成可追踪交互](GOAL.md)。

基线/证据见 [汇总§1](../SIMULATOR_REMEDIATION_PROGRAM.md#1-报告到底证明了什么)。进入条件分开：实施批准后可先准备身份检查、隔离fixture与通知失效态；实际样本写入要确认精确非生产数据库/workspace、授权actor/记录和清理方式。最终复验进入条件是0042～45固定合并版本、0033～36相应必需接口与本轮服务/Simulator唯一owner；provider/Push缺项只阻塞对应证据，不阻塞本地代码或其他链。

## 范围与文件

- 读取0037/0038/0040报告、通知source-navigation与现有种子机制；优先复用 `repos/orbits/scripts/seed-event-operations-e2e.ts`、`seed-account-contact-fixtures.ts`及已授权fixture，不执行未核目标的批量seed。
- 新建起点 `repos/orbit-app/scripts/verify-simulator-runtime-identity.mjs`、`repos/orbits/scripts/prepare-simulator-acceptance-fixtures.ts`与专用测试、脱敏manifest/精确cleanup模式；具体新增路径在run前登记。脚本默认只读/dry-run，写入需显式目标和允许列表；不携带真实凭证，不把版本字符串当运行身份唯一证据。
- 通知失效态允许按根因修改 `repos/orbit-app/src/screens/inbox/NotificationDetailScreen.tsx`、`src/view-models/inbox-notification-actions.ts`与实际legacy来源导航消费者；Web `app/api/inbox/notifications/[id]/route.ts`、实际source-navigation/typed-delivery-source服务，新增精确路径先登记。
- 验收矩阵/REPORT及Bridge交接内容由执行线交付，根台账与其他Sprint状态仅协调线更新。

排除：替代0041单元测试基线、篡改业务账号权限、重做消息/需求/报名产品、造真实用户身份、生产seed、改cancelled活动来凑样本、无确认卸载应用/清理用户库、新远程provider/Push/OAuth部署。测试若发现新产品缺陷仅精确交接，不无界吸入本Sprint。

## 验收契约（五项）

| SC | 可观察行为 | 主验证 |
| --- | --- | --- |
| SC-0046-01 | 验收能证实UDID/bundle/native产物、主线8082 JS、live Web/API身份与actor范围；错包/scheme冲突/旧服务被识别并停止对应步骤 | 身份检查脚本确定性测试、实际设备/服务manifest；无法证实不是PASS |
| SC-0046-02 | 消息双方、三类通知、已保存需求/有结果、有效可报名活动都有隔离真实样本及精确可重复清理 | fixture dry-run/目标拒绝/幂等/清理测试；实际API数据与前后数量/ID manifest |
| SC-0046-03 | 有效通知跳正确来源；来源删除、撤权、缺失时有安全解释，已读/处理与源业务完成分离 | legacy/typed两类来源行为、跨actor拒绝；原生点击与HTTP状态，不暴露已撤权正文 |
| SC-0046-04 | 有效样本下真实完成双方消息收发/已读、三类通知动作、需求保存→结果→详情、报名→取消；修复链与全域离线在固定版本复验 | 实际输入/点击/回执/截图矩阵；复用前序同版本证据须标来源，否则逐行执行 |
| SC-0046-05 | 全部测试写入精确恢复/清理，结果分PASS/FAIL/BLOCKED/未测与外部TODO，固定SHA和主线合并树闭环 | cleanup manifest、预算/未覆盖清单、逐SC REPORT、merge/remote对照 |

## 执行与最小检查

先复核主包身份与既有证据，设计带allowlist的fixture与cleanup；待改符号impact后RED→最小实现，脚本新行为先确定性测试。通知定向起点Web `tests/services/notification-source-navigation.test.ts`、`tests/services/notification-cutover-routing.test.ts`、`tests/pages/typed-notification-inbox.test.tsx`；App `tests/typed-notification-inbox.test.ts`及新增有效/失效来源render交互测试。新脚本测试名称/命令在创建时登记，不声称现已存在可运行测试。

fixture与权限/状态接线H，最终跨端矩阵I；对实际受影响端本地收口集成/typecheck一次，复用未变化前序有效结果，不能只跑源码断言或一项冒烟覆盖全部功能。Web更新后重建重启；同源离线维持actor/地址不变并停止API而保持Metro可用，包含冷启动、详情/搜索/聚合、恢复与撤权；与0033/0036矩阵对齐，不另设低门槛“9页不崩溃”。

体验运营403核对正确权限边界即可，不给账号扩权；隐私入口只核查既有规格与可达性，若确需新产品另交方案。真实provider、远程Push、OAuth各自缺证据保留TODO/blocked，不能因本地矩阵通过关闭0039/0040。

失败处置、唯一run、测试对象/服务锁、费用、脱敏证据及commit→固定SHA→merge chat-agent→合并树→适用push遵守 [共同契约§4](../SIMULATOR_REMEDIATION_PROGRAM.md#4-共同执行验收和交付约束)。不创建第二轮Generator、不把缺样本或未测写成通过。
