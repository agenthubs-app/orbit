# Sprint 0109 — 消息三张表（消息 M2）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「消息数据方案」M2（`docs/designs/2026-09-27-data-architecture/message-design.html` 第 5、6、8 步）。已定决定：绑定并入对话表；已读并入成员表；邀请留在万能表；撤销后双方不可见、服务器不删；消息一直保留。
**单一目标:** 关系沟通的对话、成员、消息存入三张专用表，读写全部切换，接口形状不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0108 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 0108 已提供「写入取锁 + 流水号」机制（新表的流水号沿用同一序列与提交顺序保证）。生产上这几类数据的**行数查询**与**数据搬迁执行**需用户确认。

## 已查明的事实（2026-09-27）

- 模块 `repos/orbits/features/relationship-communication/`：`service.ts`（集合常量 :19-25；`record()` :196-228 总是 `targetType: "conversation"`）、`bounded-reader.ts`、`unread-summary.ts`、`read-service.ts`、`read-cursor.ts`、`service-factory.ts`。
- 集合与信封：invitations（user_id=邀请人；target=contactId）、bindings（user_id=邀请人/撤销人；target=contactId；id=digest(邀请人, contactId)）、conversations（user_id 空；id=digest(邀请人, 对方, contactId)；`participantAccountIds[2]`、`qualificationVersion`、`status`）、messages（user_id 空；id=digest(对话, 发送人, requestId)；`sentAt`、`senderAccountId`、`body`≤10000）、reads（user_id=读者；`lastReadMessageId`）、`relationshipConversationDrafts`（0104 后由本模块负责，user_id=本人，targetType `relationship_reply_draft`）。开发库各 1 行。
- 不设上限读取：`service.ts` `messagesFor` :369-376（getConversation、listConversations）、getEligibility 邀请 :509-514、listConversations :812-816（无路由调用）；`service-factory.ts` 联系人 :44-69。棘轮记 service.ts 3、service-factory.ts 1。
- 路由 `app/api/relationship-communication/`：eligibility、invitations、invitations/[token]、/accept、bindings/[contactId] DELETE、conversations/[id] GET（完整对话，消息不设上限）、conversations/[id]/draft、conversations/[id]/read、conversation-summaries、conversations/[id]/messages GET/POST、unread-summary。
- 其他读取这些集合的服务端代码：`features/notifications/typed-delivery-factory.ts:38`、`typed-delivery-source.ts:14,31-35`、`features/notifications/discovery/source-adapters.ts:10,57,59,77`、`app/api/inbox/summary/handler.ts:35`。
- 消费方（接口形状必须不变）：App `RelationshipInboxScreen`、`RelationshipChatScreen`、`RelationshipChatDetailScreen`、`ContactIntrosScreen`、`RelationshipInvitationScreen`、`ContactDetailScreen`（eligibility）、`contact-communication.ts`、`relationship-pages.ts`、`inbox-feed.ts`；网页 `bounded-contact-messages-view-model.ts`、`relationship-inbox-panel.tsx`、邀请页。App 与网页均每 15 秒轮询。
- 撤销 `service.ts:727-785` 经通用 upsert 改写绑定与对话（会改写 user_id，0114 修通用 upsert；本 Sprint 新表不经过它）。

## 范围与文件

1. **三张表**（迁移并入现有迁移机制，可重复执行）：
   - 对话：对话编号（沿用现有算法）、邀请人、被邀请人、邀请人的联系人编号、状态、资格版本号、撤销时间、最新消息序号、最新消息时间、创建/更新时间、`sync_revision`。
   - 对话成员：（对话编号, 账号）主键、显示名、读到的序号、未读数、最新消息时间、成员状态（有效/已离开）、`sync_revision`；索引（账号, 最新消息时间 desc）。
   - 消息：（对话编号, 序号）主键、消息编号唯一（沿用 digest 算法，去重靠它）、发送人、发送人显示名、正文、发送时间、资格版本号、requestId、`sync_revision`。
   - 三表的 `sync_revision` 沿用 0108 的序列与提交顺序保证。
2. **写入**：接受邀请建对话与两行成员；发送在一个事务里锁对话行 → 序号加一 → 插入消息（编号冲突则返回已有消息）→ 更新两行成员（发送人读到本条、对方未读+1、双方最新消息时间）；已读改写本人成员行；撤销改对话状态与资格版本号、两行成员标为已离开。
3. **读取**：会话摘要按成员索引分页；消息按（对话, 序号）翻页；未读总数为本人成员行未读数之和；`conversations/[id]` GET 改为有上限；上述其他服务端读取方（通知投递、发现、收件箱汇总）改读新表。去掉 4 处不设上限读取。
4. **接口不变**：所有路由的响应形状与错误语义保持不变（游标可换格式，仍为不透明字符串）。
5. **搬迁**：一次性、可重复执行的搬迁脚本，把现有集合的数据写入新表（本地执行；生产需确认）；旧集合行保留，不删除。
6. **清掉最后两处读旧集合**（0104 遗留）：profile-signal 模块整类读取 `messages` 以生成档案「寻找」建议、审计模块读取 `conversations`——旧集合在 0104 后已无数据来源；改为不读（或改读新表中本人有权看的数据，若产品上确需），对应棘轮下调并在报告说明。
- 邀请、草稿（0104 新增的 `conversations/[id]/draft`，集合 `relationshipConversationDrafts`）继续留在万能表。
- 排除：放进手机（0119）；断网发送（0120+）；界面改动。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0109-01 | 规模：测试库造 10 万用户的对话，收件箱列表、未读数、翻页的执行计划走索引，耗时不随总用户数增长 | EXPLAIN + 计时对照 |
| SC-0109-02 | 去重（同 requestId 发两次只一条、序号不跳号）；并发（两人同时各发 50 条，序号 1–100 连续不重复） | 真库测试（先 RED） |
| SC-0109-03 | 未读：等于对方发来且未读的条数；打开后归零；自己发的不算。撤销：双方列表、未读、消息接口都不再返回；旧资格版本号发送被拒；服务器行仍在 | 真库测试 |
| SC-0109-04 | 隔离：第三人在任何接口拿不到对话；所有路由响应形状与改前一致（契约测试）；App 与网页消费方无需改动 | 契约测试 + 路由测试 |
| SC-0109-05 | 棘轮 −4（另加第 6 项清理带来的下调）；搬迁脚本可重复执行；phoneweb 与 Simulator 两账号互发、已读、撤销；两端全量、typecheck 通过 | 摘要 + 截图 |

## 测试

- 档位 H（新表 + 写入事务 + 多个读取方）。开发集：关系沟通服务/读取/未读的真库测试、通知投递与收件箱汇总相关测试；收口：两端全量；Postgres 测试显式设置 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`。
- 规模测试可复用外接盘上的 `orbit_scale_test`（`/Volumes/ORICO`），或在测试库生成；报告写明方法。

## 生产（需用户确认）

① 只读查询生产五类集合行数；② 部署新代码前后的顺序（先建表 + 搬迁，再切代码；或代码兼容两者）；③ 旧集合保留，何时删除另行决定。协调者汇总进 `PRODUCTION_ROLLOUT.md`。

## 失败与交接

交接给 0119：三张表的 `sync_revision` 与成员表是放进手机时挑行与「离开」处理的依据。
