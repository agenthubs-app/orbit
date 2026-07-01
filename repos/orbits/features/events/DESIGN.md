# Events 模块设计文档

## 设计定位

Events 负责活动前、中、后的关系工作流。它不是日历系统本身，而是把活动变成关系机会：导入活动、看参会者、设定目标、准备开场白、记录现场遇见的人，并在活动后整理联系人和跟进。

活动相关动作必须保留来源和用户确认。想连接某个人，不等于立即发出消息。

## 子能力范围

- `event-crud-and-import`：活动创建、导入、详情；包含 mock、hybrid 和 live-store 实现。
- `event-attendee-roster-mock`：参会者列表和已知联系人标记。
- `event-goal-and-readiness-mock`：活动目标和准备清单。
- `event-encounter-note-capture-mock`：现场记录和证据。
- `on-site-want-to-connect-mock`：想认识某人的意图记录。
- `post-event-contact-review-mock`：活动后联系人复核。

## 契约与数据边界

契约位于 `features/events/contract.ts`。核心 DTO 包括 event record、attendee、goal、readiness checklist、encounter note、want-connect intent、post-event review 和 provenance。Events 不直接写联系人库，活动后联系人仍应进入 Acquisition 或 Contacts 的确认边界。

Service factory 注册 event crud、attendee、goal/readiness、encounter、want-connect 和 post-event services。

## Mock 行为

Mock 使用本地活动 fixture，不访问真实日历、会议平台、联系人库、消息系统或通知服务。want-to-connect 只记录本地意图，post-event review 只生成复核候选。

## Live 替换方案

第一阶段 live 只指 Events Live Store：`event-crud-import` 可以通过 live service 读取 Orbit 自有活动、读取详情、手动创建活动。这个 live store 不等同于日历同步或活动平台导入；缺少 live store provider 配置时必须返回受控失败，不能退回 mock/hybrid。

Calendar Provider Import 是后续独立集成。它可以接日历、活动平台、badge 扫描、会议系统或现场记录工具，但必须先通过单独设计处理 OAuth、权限、去重、后台同步和 provider payload 映射。活动后写入联系人前仍必须经过 Acquisition/Contacts 的确认流程。

## API 与页面使用

产品入口包括 `/app/events` 和 `/app/events/[id]`。API 包括 events、attendees、goal、readiness、matches、encounters、want-to-connect 和 post-event review。页面应按活动前准备、现场动作、活动后复核组织信息。

## 测试要求

- event import 测试确认 no live calendar/database write。
- attendee roster 测试确认已知联系人和推荐池稳定。
- want-connect 测试确认没有消息发送。
- post-event review 测试确认候选联系人仍需确认。
- 页面测试覆盖列表页和详情页的 empty/pending/failure。

## 团队协作规则

Events 团队维护活动上下文，不直接实现联系人导入和消息发送。参会者转联系人走 Acquisition；跟进任务走 Followups；开场白推荐可调用 Recommendations。
