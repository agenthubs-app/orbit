# Sprint 0022 — 待办统一与人脉筛选执行报告

C / run-01。Planner SHA256 `d58db78992f48873a32ed040554a997241c2ee02e6573f30fc80a85ec283d9a7`。工作树 HEAD `fca77373f123c03e29a0584cba46bade5f5eb907`，有效语义基线为已发布 C0009 `a4bbfd9f6`、C0010 `d005c2b79` 及 B0006 `09e1a71fa`（主线 `0ff447a55`，报告 `e93ba57cf`）。本轮已完成，主线功能提交 `ef5d0b02d4fc8d1ea71a31fe5e9007471d21a9cf`，24路径（12产品、12测试）。文件补充见 [APPROVED_SCOPE_ADDENDUM.md](APPROVED_SCOPE_ADDENDUM.md)。

## 实现与验收证据

| SC | 实际结果 | 主要证据 |
| --- | --- | --- |
| 01 | 同一 canonical 集合按全部/人脉 × 未完成/已完成正交筛选；relationship 类别或 relatedContactId 均纳入；候选不计数，重复 ID 只保留一条；未完成视图不再附加完成历史 | task-list-scope 7项，真实 TasksRoute/HTTP交互；61条/四组合/未知与重复参数；final-direct-tasks.log 83/83；原生四视图 |
| 02 | 同ID完成/恢复，严格核对账号、版本、回执；重复点击锁定，失败保留原行，同一操作重试复用键，换号/晚到响应隔离；真实联系人和事项两个独立目标 | 实际任务 handlers/service 交互覆盖401/404、503、伪回执和迟到请求；PG同记录双向核验；iOS详情/联系人/完成三个触点 |
| 03 | 通用待办 /tasks，人脉 /tasks?scope=relationship，完成追加 view=completed；旧 /followups 保留私有包装并归一化；Pipeline入人脉，AI全部入全部，消息与日历有ID进真实详情，无ID候选进人脉列表且标“查看建议” | final-direct-navigation.log 208/208；旧路由实际私有包装5例；原生 legacy-completed-final、ai-all-tasks-final |
| 04 | 明确选择可访问联系人/事项后才启用两类起草；B公开模板只预填，用户可编辑后主动发送；候选/提醒分离回读，读取失败不显示0条，提醒绝对时刻按设备时区显示；既有生成结果从canonical会话历史回读 | tasks-unification-interactions16项通过；真实 TasksRoute→AiRoute→手动编辑发送，受控HTTP断言生成和持久化各1次、typed contact ref+origin；原生选人/取消/编辑零发送与实际PG历史 |
| 05 | Contacts需要联系筛选保留；iOS筛选、详情、联系人、完成、返回、工具及历史可用；App完成→Web回读→Web恢复→App回读一致 | contacts-task-consumers.log 70/70；native-cross-client全套AX/截图；verified.json，tools-verified.json；H检查已执行，原全量失败和局部修复结果见下文 |

证据位于主工作区 `/Users/xzhao/Projects/orbit/repos/orbit-app/build/harness-state/evidence/sprint-0022/run-01/`，C工作树保留原件。

所有直接回归使用完整文件，无 test-name 筛选。App final-typecheck.log exit0。Web产品本轮无修改，复用已发布依赖验证与本地依赖导入后Web typecheck0；不宣称Web新增了人脉筛选UI。

## 前序能力迁移

B0006 77个发布依赖已导入并单独保存 baseline，最终C增量排除这些既有改动。AI预填入口 `registerAiTemplatePrefill` 为actor+server绑定的一次性标识，URL不携带消息正文，消费真实 `app/ai/[id].tsx`。`/ai?drawer=1` 是真实历史入口。旧 message-drafts 没有 GET，且旧预览不持久化；B revision2已移除相应旧卡/PATCH，0022不发明另一份草稿状态。允许的领域确认仍由既有IORBIT协议处理。详见 tool-capability-inventory.md。

## 原生与跨端同记录

授权合成身份 `c0009-user`，隔离 PostgreSQL `127.0.0.1:55419/c0010`，workspace `c0010-cross-client`。事项 `task:fb6b0093968be355e8a66dec`（C0022 跨端完成核对），类别work，关联 `contact:c0022`。App完成后实际Web TaskDetailWorkspace显示已完成；Web恢复后App显示未完成。数据库恰好创建/完成/恢复三条历史，成功PATCH两次；联系人与connection payload逐字段未变。最终代码只读复验仍通过。

原生工具阶段明确选中该真实测试联系人和事项，进入IORBIT后保留typed引用与模板，实际输入123修改预填，未点发送。已有草稿/候选内容预先seed在actor-owned PostgreSQL canonical session，使用已发布B collection/detail handlers与provider回读，iOS历史抽屉和详情均显示。此阶段AI写请求0。模型生成结果为受控测试内容，不声称付费模型验收。自动测试另覆盖主动发送后的生成/保存HTTP次数与完整来源字段。

环境为iOS26.4模拟器Expo Go，非实体设备/推送验证。身份由隔离HTTP服务DI提供，不能写成生产cookie/OAuth验收。基础AI空会话GET使用完整测试DTO；历史查询、task读写、contacts查询使用真实服务和PG。Web UI未改，测试证明同记录一致。

原始失败保留：seed首次漏completedBy/completionSource已补；原生初次完成因seed时刻晚于宿主UTC触发append-only校验。隔离服务DI统一+24h时钟后，同一原生幂等键重试成功。失败3次均回滚，未修改产品API。详见请求日志和verify.cjs。

## 范围、验证及交接

本轮仅App待办/工具/旧入口/导航消费者及相关测试；无Web、API字段、数据库迁移、首页、ContactsScreen业务字段修改。GitNexus prior impact：initial-route链HIGH，已在编辑前警示；其余既有符号LOW，新符号未收录，补源码调用核对。主线index陈旧，detect_changes必须记录真实返回并人工核对增量文件，不能把No changes解释为没有影响。

全量收口仅跑App一次，产品文件冻结、provider keys全部unset：2645项，2601通过、44失败、0跳过，exit1。44项均来自app-wide-workspaces共同setup仍编译旧FollowupsScreen却缺Redirect。修复该测试文件指向真实统一页后，首次完整复验64/65，剩余一项仍把模板导航按钮当700字重主按钮；与现有secondaryButtonText600角色核对后，仅更新该预期，第二轮完整复验65/65通过（44工作区+5旧路由+16真实工具交互，full-failure-final-recheck.log，exit0）。产品代码未因夹具修复修改，原生与直接回归版本保持有效。不重跑全量，不将局部通过改记为全量通过。

稳定地址交接0011/0013/0015/0018：通用任务 `/tasks`，人脉 `/tasks?scope=relationship`，独立完成维度 `view=completed`，详情 `/tasks/<encoded-id>`，候选不可伪造任务ID。联系人“需要联系”留在原联系人页面，不因任务完成推进关系状态。

预算：0022无付费模型/OCR调用；原累计$5硬限额与已记$0.012780保留。0010全量旧provider环境造成的增量费用仍未知，不能记为0。未调用生产邮件、日历外部写入、设备push。

## 主线集成收口

协调者已路径限定提交 `ef5d0b02d4fc8d1ea71a31fe5e9007471d21a9cf`。冻结C补丁SHA256 `e8cf17e3bc85f7af65b8c45b7adf116c23c562ae43cfadd7e71b53017d449ed3`，原件不重写。24路径中22份逐字一致；`mobile-route-access.test.ts`保留A0003已发布登录补全预期，`app-wide-workspaces.test.ts`保留E线真实发送消息夹具/断言，仅叠加C的人脉范围、真实TasksScreen及secondary控制角色预期。没有将C旧版通信夹具覆盖主线。实际提交文件哈希见`integration-comparison-final.json`。

主线完整复验：65/65（工作区+旧路由+工具）、83/83（任务直接集）、208/208（导航消费者），App typecheck exit0，diff-check通过。原App全量的44项夹具失败保持历史结果，不称为最终全量通过；契约副本同名同数、逐字一致、自包含三项已在该全量内通过。

协调者 staged GitNexus detect因陈旧索引错误返回0/No changes，属于工具覆盖限制；人工核实24路径，沿用实施前initial-route HIGH警示及实际消费者回归，未将返回0解释为低风险。

本地仍保留0009/0010及已发布B依赖的未提交副本供追溯；正式功能以主线上述SHA为准。本轮无未完成的SC、无需用户决策的功能项。README与Bridge由协调者更新；本报告和范围补充为独立文档提交。若需回退，应由协调者按功能提交做限定revert并重验依赖，不能覆盖其他线路工作树。
