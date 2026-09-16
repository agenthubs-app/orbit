# Sprint 0033 — 全域离线读取设计

## 依据与范围

采用已批准的[全域离线读取规范](../../../../../docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md)。本次委派明确批准设计；规范中的待审标签为历史文本，不重复索要批准。旧版仅 notes/tasks/followups/personal schedule 及单一 scope cursor 的设计被本版替代。

原生 App 每个用户可见读取入口都要登记，包括列表、详情、子资源、搜索及聚合。账号/资料/偏好、人脉/导入、笔记/任务/跟进、日程/预约/会议、消息/通知、全部 AI 会话历史、活动/角色/运营、Agent 和首页分析均纳入；AI 读取权限、离线写入与 transport 恢复调度分别归0036、0034、0035。

## 身份与安全存储

AuthSessionProvider 提供 `checking/online/local-read/locked/revoked`。SecureStore v2 envelope 绑定规范化 Base URL、canonical actor、subject、session expiry、offlineReadExpiresAt、lastVerifiedAt、workspace/domain epochs 和数据库 key reference。服务器签发的离线有效期不晚于登录到期，也不超过最后验证后七天；旧 cookie 必须在线升级。时钟倒退或未知格式 fail closed。

local-read 只解锁已授权镜像，不能通过任何在线写入检查，包括 raw fetch、stream 与后台上传。认证401/403撤销整份租期；域403只锁定/清理该域。离线退出先撤销资格并持久化清理意图，远程sign-out best effort；加密擦除失败保持锁定。断网不能即时知道远端撤权，UI不得宣称可以。

数据库按 Base URL+actor 加密隔离，行/游标/索引/资源绑定workspace/domain/epoch。v1→v2迁移必须真实SQLCipher上事务建表、复制校验、替换和重建索引，可重复、可崩溃恢复；修改旧CHECK或主键不依赖CREATE IF NOT EXISTS。旧无epoch canonical行不提升为受信新scope；outbox/conflict/device drafts保留。单域重置只清该域canonical读取；账号整体撤销执行加密擦除。

## Registry 与读取协议

每个domain记录稳定ID/schema、权威source adapter、服务器授权、字段白名单和实体ID、变更/grant/revoke/delete/retention、依赖域、页面/selector/本地索引/排序、分页/大小/历史/完整性、租期/binary policy、离线mutation adapter以及独立AI capability。

每条API路径族和写动作分别登记readPersistence（durable_normalized/encrypted_ttl_snapshot/device_only/online_only_secret）、mutationPolicy（offline_queue/local_only/online_only）、binaryPolicy（metadata_only/on_demand_encrypted/user_pinned_encrypted/never_local）。未知域、字段、版本、epoch、endpoint默认拒绝。过渡snapshot同样检查schema/expiry/epoch/bytes/hash，不允许secret/raw/base64二进制。结构化镜像加密不等于外部文件加密。

先 GET `/api/sync/manifest`，然后 GET `/api/sync/domains/[domainId]`；lease由 `/api/sync/lease` 签发。每域不透明HMAC游标绑定actor/workspace/domain/schema/registry/epoch/high-watermark/issuedAt/generation。HTTP认证和每页领域授权重新执行，客户端workspace只能作为需验证的选择器。

不同source必须有自己的授权read adapter和同事务journal，不能扩大orbit_records IN列表代替。journal保存不可变投影变化、物理删除tombstone、授权新增历史及无实体变更的撤权事件。sequence不是提交顺序：source+journal在同一事务，sync-write锁覆盖revision分配到commit，watermark遵循同一提交屏障。0034锁顺序为receipt→domain transaction/CAS→sync-write。

每页与游标原子提交。分页预算的初始工程值8页/4MiB/20秒/电量20%/空闲64MiB只限制一轮工作，不截断数据范围。达到预算为partial，下轮续cursor。页面上限200条/1MiB，超大单记录显式失败。完整AI历史可跨轮同步，不回退最近N条快照。

## 消费者、完整性和资源

所有durable读取由endpoint→typed selector映射进入镜像，网络负责更新镜像。区分fresh/stale/partial/not-downloaded/not-authorized/locked/failure。空镜像失败不转empty，只有搜索范围完整才可给无结果。聚合记录依赖版本；新集合全部页面到齐后原子切换代际，失败保留旧集合，不制造跨域全局原子性。

公共浏览是服务器明确的saved/joined/pinned/recent成员集合；个人/参与/角色数据仍完整。资源manifest记录scope/revision/size/hash/policy/completeness；bytes按需或pin进入专用加密cache，缺bytes不阻止文字。优先现有SQLCipher BLOB加密cache，避免未加密外部临时文件或自制密码算法。

网络恢复顺序：验证账号/授权→应用撤权并删除读取投影与资源→开放0034已支持上传→继续分域delta。0035负责触发/失效传输，不定义新cursor；0036只从云端独立授权的数据读取。

## 内部阶段与验收

A覆盖/策略 → B身份/存储 → C协议/registry → D个人/基础人脉 → E通信/完整日程/AI历史 → F活动角色/Agent/聚合 → G资源/搜索/旧入口清理。

每阶段独立TDD提交和管理线审查，可逐阶段集成；所有共享符号实现前GitNexus upstream impact，高风险先报告。每域必须有bootstrap/delta/物理删除/grant/revoke/reset/actor角色隔离证据。所有native入口零遗漏、真实SQLCipher迁移及同版本Web/API→App离线冷启动均是0033完成条件。

详细接口、精确文件、RED命令、GREEN与提交步骤见[实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0033-universal-read.md)。规划不创建REPORT，不改运行登记表、不merge/push。
