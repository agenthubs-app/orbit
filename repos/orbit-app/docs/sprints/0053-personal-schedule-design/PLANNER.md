# Sprint 0053 — 个人日程设置与详情

唯一SprintContract revision1，existing-codebase / single-generator。需求：2026-09-16用户参考图，要求新建Sprint更改个人日程设置/查看并交支线执行，关联R-03/R-10/R-14、0010/0027/0042与0051笔记读接口。目标 [GOAL](GOAL.md)、设计 [DESIGN](DESIGN.md)、[实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0053-personal-schedule-design.md)。0052已保留需求匹配，不复用其编号。

## 基线和就绪

规划主线8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5；执行固定依赖基线42fcd36208b1291b00371bc2e8777f02ff301e41（0051最终提交，包含Phone f7c8a15123b78cfa732db10c7642573b921f3dfe、已固定AppScreen可选onBack、笔记只读行为和0050字典等价提交）。ROOT已核对f7至42的25路径差量及clean状态；独立codex/sprint-0053-personal-schedule-design/worktree，启动登记记录实际HEAD及Planner SHA256。只集成本Sprint增量及精确必要依赖，不merge整个Phone祖先；0051部分交付不代表v3、删除或离线生命周期完成。

唯一执行者现有B任务 `01a0a879-e8fe-77e3-b748-bd78005aecc8`，GPT-5.6 Sol / medium。0050/0051原Generator均已实际结束并释放所有源锁、测试和执行槽；0053使用上述固定依赖，四字典本Sprint新增键由B独占，AppScreen仅消费固定onBack，笔记域只读。ROOT完成run-01全局登记并发送显式启动交接后才实施，不启动第三Generator。既定用户授权复用，不重复设计审阅。提醒/重复运行时、外部OAuth不在本Sprint实现；未支持状态必须诚实。

## 统一字段与兼容

保留canonical个人集合、id/sourceId/actor/workspace/updatedAt及原mutation存储。不增加第二笔记库或日程表。给个人数据增加可选allDay:boolean、timeZone:IANA string、meetingMethod:video/in_person/phone/unspecified、meetingUrl:string、contactIds/noteIds:string[]；旧记录可缺这些字段，不默认改写。当前canonical strict schema需同步窄扩展meetingUrl/contactIds/noteIds，个人schema也一致；不为此扩通用sync协议/写锁。

新客户端通过header `x-orbit-personal-schedule-version: 2`显式取得新个人DTO；GET/POST/PATCH/DELETE和个人集合使用同一序列化。无header保持原v1个人DTO白名单形状，不泄露新字段导致旧strict客户端失败；旧PATCH省略新字段保持它们，不把缺字段当清除。底层读取校验完整新数据，再按版本投影；authority日历使用真实allDay而非v1假时间。源契约/schema同步走已有sync:contract，不手改App副本。

编辑新字段可选/明确null清除，allDay:false表达取消全天，关系[]表达清空；expectedUpdatedAt与稳定idempotencyKey沿用。关系验证用当前正式owner-reader，不从客户端actor或URL猜授权；notes接口未固定只阻关系那一步，其他日程设置/详情继续。

## 文件边界

- App修改src/screens/schedule/PersonalScheduleScreen.tsx、PersonalScheduleList.tsx、src/view-models/personal-schedule-editor.ts、src/api/personal-schedule.ts及必要列表/首页/日历跳转消费者；新增src/screens/schedule/PersonalScheduleDetailScreen.tsx、PersonalScheduleTimeBlock.tsx、PersonalScheduleAssociations.tsx，src/view-models/personal-schedule-detail.ts，app/schedule/personal/[id]/edit.tsx；现有[id].tsx改为详情，new.tsx仍新建。
- Web修改features/personal-schedule/{service,authority-contract,service-factory}.ts、shared/contract/tasks.ts、shared/api-schema/personal-schedule.ts、app/api/schedule-items/{personal-handler,personal-route}.ts及实际个人collection serializer；app/(app)/app/tasks/{personal-schedule-workspace,personal-schedule-client,personal-schedule-editor-model}.tsx/ts按真实扩展名，拆真实阅读/编辑状态。必要专用personal-schedule/association-reader.ts与representation.ts可新增，不改通用store/notes事务。
- 字典仅本Sprint新增三语键，等待ROOT释放；AppScreen只消费0051固定可选onBack，不并行修改。关联选择复用有界搜索/当前notes接口，只读取其他域，不改其source/ACL。schedule.query/离线字段校验消费者有必要差量由ROOT核锁、impact后登记，不平行重写0033～36。
- 测试App tests/personal-schedule-{editor.test.ts,interactions.test.tsx}、实际日历/home直接消费者；新增tests/personal-schedule-detail-interactions.test.tsx、personal-schedule-duration.test.ts。Web tests/api/{personal-schedule-routes,personal-schedule-collection}.test.ts、tests/pages/{personal-schedule-workspace,personal-schedule-page-account-scope,app-schedule-route-services}.test.tsx/ts准确路径以现有文件为准；新增tests/api/personal-schedule-representation.test.ts及关系/全天相关直接service行为。
- 文档本Sprint/Bridge真实交接；排除任意真实migration、填demo人名/笔记、另造关系跟进任务、自动向对方分享/邮件/Push、重复日程引擎、Calendar/Gmail/Microsoft adapter、新视觉方案/独立Sites、删用户记录/清缓存、覆盖前序未提交内容。

## 五项SC

| SC | 可观察结果 | 验证 |
| --- | --- | --- |
| 0053-01 | 新建/编辑按参考图标题+合并时间块+地点；30/60/120/全天真实保存，跨天及DST正确，时区附注不抢主内容 | 同viewport状态对照；duration/本地时间测试、native实际picker/保存；未改时间保秒，结束晚于开始 |
| 0053-02 | 日历/首页/个人列表打开独立真实详情，编辑/改期可回读，线上安全链接仅点击打开，清除和未知状态不假显示 | App/Phone/Next实际路由交互，source/id匹配、缺结束/坏URL/取消/404/读取失败、三语/字号/键盘 |
| 0053-03 | 自己的联系人/笔记关联可选择保存移除跳转；不写他人跟进，不读取已删/无权内容；提醒/重复无能力不假生效 | owner/workspace反例、关联读写回执及GET、删除/撤权后拒绝与可恢复提示；零自动模型/外发 |
| 0053-04 | v1/v2兼容、CAS/幂等/单飞/旧ACK/换号/保稿完整，原个人创建修改删除及meeting/event列表不回归 | 真实handler双版本、旧record/旧PATCH、新schema消费、并发409/故障回滚、已固定顶栏onBack；不放宽认证或通用时间规则 |
| 0053-05 | 固定源码Web生产build/restart、PhoneWeb与主8082 Simulator同记录完成创建→查看→改期→跨端回读，视觉对照通过且安全集成 | ROOT合法自建记录/明确清理范围、固定SHA/BUILD/PID/health/API base，App↔Web双向包括新字段；真实测试矩阵/报告/merge chat-agent/合并树/适用push |

## 执行与交付

读RULES/AGENTS、Bridge、本参考和步骤、0010/0027/0042报告与0051固定接口；实际modifiedsymbol upstream impact，HIGH/CRITICAL先报告，新符号/图盲区补源，不当零风险。用户图已选，不重新ImageGen选方向或搭独立原型。使用已有tokens/icons/真实头像展示；不复制系统chrome。

TDD正常/时间/版本/权限反例，H写入/契约定向完整文件、types/sync；本地代码收口受影响端一次I，保留真实失败与skip，只修本次受影响项，失败最多2本地repair。遵循零出站/env屏蔽，Generator不操作真实DB/账号/服务/设备；ROOT统一生产build/restart与实际SC，测试mock不冒真实结果。图稿vs真实同状态同viewport比较，受规则限制不无限视觉循环。

安全独立功能路径commit+实际detect→固定SHA/残留/未完成交接；真实run结束才REPORT。ROOT精确merge chat-agent、合并树必要验证、按已有授权push并核远端；缺任何SC或未合并不得completed。新字段影响offline/AI读取缺项单列，不因界面漂亮关闭0033～36。
