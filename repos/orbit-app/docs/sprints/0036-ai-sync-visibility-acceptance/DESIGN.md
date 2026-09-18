# Sprint 0036 — AI 覆盖与全链验收设计

依据已批准的 [全域离线读取规范](../../../../../docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md) §3、§5、§7～9。规范中的“等待书面审查”是历史文字；本任务收到的管理线指令明确记录设计已批准。本次仅形成待管理线审查的执行计划。

## 两套权限

0033 的 offline registry 决定客户端哪些数据可以落地，0036 的 AI permission registry 决定服务器哪些记录和字段可以交给模型。两者通过 domainId 对照，但互不授权。工具声明、模型选择、App manifest、客户端 workspace 都不提供服务器权限。

服务器每次执行工具和发送 provider payload 前，以会话注入的 actor、workspace、authorization epoch 检查能力与资源授权。未知域、版本、字段、过期 epoch 和未启用 AI 能力默认拒绝。撤权后游标、artifact、会话结果缓存及 evidence 引用不能继续泄漏旧记录。

## 查询能力

保留 notes.query、tasks.query、followups.query、schedule.query；新增 aiHistory.query、contacts.query、relationshipEvidence.query、messages.query、notifications.query、meetings.query、events.query、goals.query、agentData.query。profile.getSelf 及推荐/上下文等旧入口也经过统一出站检查，不能成为绕过路径。

各查询支持 list/search/get，使用领域权威 service/repository 的 read adapter，不将所有域塞入 orbit_records 查询，也不从 AI 会话结果复制第二份权威业务记录。详情 id 必须来自当前用户请求或本轮已授权证据。AI 历史查询逐页读可见消息/输出，禁止隐藏 prompt、raw provider context。会议、活动与人脉证据按参与者/角色和来源权限读取；通知来源不可用时不返回旧摘要。

精确函数、文件与各域字段见实施计划。默认每页最多 10 项，单项文本最多 4000 字符，单次序列化结果最多 64 KiB；正文裁剪与分页分别记录，不把裁剪后的结果声称完整。64 KiB 是本线实现预算，不是用户费用预算。

游标由服务器签名，绑定 actor、workspace、epoch、工具、schema/registry 版本、过滤条件、快照位置和到期时间，不使用裸 offset 作为可跨 scope 重放的凭据。读完本页后、出站前再次检查授权；变更则拒绝该次输出。

## 新鲜度与证据

结果携带 authority=cloud_canonical、服务器 readAt、每项稳定 id、canonical revision、updatedAt、evidenceIds、partialReasons 和 nextCursor。revision 从权威记录读取，不用客户端时钟或同步游标代替；缺少可靠 revision 的适配器显式失败。空集仍带读取时间。分页未结束、文本裁剪、源不可用、已知版本落后都只能报告当前范围。

Evidence 引用绑定来源版本和服务器 scope，解析时重新授权。审计只记录 tool/status、revision 摘要、证据 ID 和错误码，不记录业务正文或模型上下文。文档站点使用脱敏引用，不公开业务 ID。

## Provider 与 prompt injection 边界

按工具的严格 DTO schema 投影，嵌套对象逐层校验，不能使用 object spread 搬运原始记录。token、Cookie、凭据、隐藏 prompt、后台审计正文、邀请密钥、raw/base64 附件和未知字段不得进入结果。模型 schema 不接受 actorId/userId/accountId/profileId/workspace/epoch。

出站边界验证每个 tool outcome、artifact、history/context 项的来源与权限；不合格数据拒绝发送。允许的业务文字标记为不可信数据，不能升格为 system 指令、工具定义、授权或副作用确认。通过真实 provider 请求序列化拦截测试验证这一点，不以提示词包含安全文案作为安全证据。

## 本机 pending 提示

0034 输出内容无关的状态摘要；0036 只消费，不改 receipt、cursor 或冲突语义。按规范化 Base URL、actor、workspace、epoch 过滤后统计 domainId 和数量。pending/conflicted/failed、已收到 receipt 但尚未在镜像观察到该 canonical revision 的记录都保持提示；delete 必须观察到 tombstone。版本是 opaque 字符串，不作大小比较。

设备草稿不进入 provider。AI 请求/响应附近的提示在错误、重启和离线只读期间保留；scope 切换立即清空旧摘要并重新读取。提示中文为“{领域}有 {数量} 项变化仅在本机，AI 暂不可见”；英文/日文提供等义文案。未启用 AI 的域明确标为“AI 未获授权”，不能承诺同步后自动可见。

## 依赖和完成条件

服务端能力/查询/出站保护可在 0033～0035 合入前独立执行。pending 消费器依赖其最终契约；全链验收依赖三个 Sprint 的固定已验收合并 SHA。0037～0041 的领域源按实际合并版本接入，不能假定其旧报告已证明全域离线。

最终矩阵覆盖规范 §3 全部业务族及所有列表/详情/子资源/搜索/聚合入口；AI 逐个授权域验证、未授权域验证拒绝。至少包含分页完整性、磁盘不足、二进制缺失、租期、401/403、跨账号/Base URL/workspace/角色、删除撤权、冲突、重装、重复重放、提示丢失/乱序/后台/杀进程恢复。

Data Atlas 与 audit JSON 从 offline registry、AI registry、路由覆盖表和真实证据生成，历史问题保留 open/partially_resolved/resolved。站点保持私有、脱敏；发布前使用 Sites 工作流。实现线交固定 SHA；管理线负责审查、合并、精确合并树验证及获准后的 push，所有证据一致后才能完成。当前规划任务不发布、不合并、不 push。
