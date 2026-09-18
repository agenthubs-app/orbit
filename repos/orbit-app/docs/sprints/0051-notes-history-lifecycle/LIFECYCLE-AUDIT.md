# Sprint0051 笔记生命周期实际审查

2026-09-16，run-01，唯一 Generator。本报告审查隔离源码，不是生产数据取证；基线 f7c8a15123b78cfa732db10c7642573b921f3dfe，字典前序 e285b9c989e386b3696e0f56fca9a48db88e13fc 精确消费。冻结 Planner 不变。真实账号、数据库、服务、设备由 ROOT 持锁验收，本线没有操作。

## 资源不是同一个“笔记”

| 资源 | 权威源／存储 | API／格式 | 可见性、同步与问题 |
| --- | --- | --- | --- |
| 独立私有笔记 | Web features/notes/service-factory → configured PostgreSQL LiveRecordStore，collection notes | GET/POST /api/notes、GET/PATCH /api/notes/[id]、DELETE /api/notes/[id]/contacts/[contactId]；note-record 实际只支持 schema1/2 | actor resolver、user/workspace/collection校验；App列表/详情/联系人关联消费此API。固定生产factory没有正式删除port或canonical v3适配 |
| App编辑草稿 | AsyncStorage，orbit:note-draft:v2:server:account:noteId/new | 本地 NoteDraft，不是服务端NoteDTO或同步镜像 | 按账号／服务器／笔记分键。此次同key写入串行保证已发出的autosave先结束，再clear，避免旧写完成后复活；不是跨进程事务 |
| 旧联系人备注 | contacts原存储；App contactNotesToView | 联系人详情payload中的旧备注 | App保持只读可达，不迁移。Web实际 app/(app)/app/contacts/contact-notes-editor.tsx 仍 PATCH /api/contacts/[id] 的 note:{body,authorLabel}，与独立笔记不同；不能将其保存结果算入独立历史全集 |
| encounter note／关系记录 | human_encounters LiveRecordStore；generated encounter另为 event_encounter_notes | /api/encounters GET/POST（actor resolver）；活动旧 /api/events/[id]/encounters 属另一work/evidence接口 | Web活动matchmaking → OrbitEncounterCapture显式记录；post-event-center读 /api/encounters?eventId。projection-repository把来源投影contacts旧备注。不是独立notes全集；固定App没有专用Encounter screen，实际生产入口与投影集合由ROOT确认 |
| AI笔记查询 | features/orbit-ai/data-query/query-service.ts 直接读取 LiveRecordStore notes | notes.query → queryNotes → noteRecordFromLiveRecord | 当前直接v1/v2 decoder，flatMap丢无效格式；列表采用独立offset scope，未绑定本线历史source fingerprint。不是已完成的canonical读取或新AI source fence |

## 按阶段审查

| 阶段 | 实际权威源、API、版本与权限 | 本线修复／证据 | 剩余问题或验收 |
| --- | --- | --- | --- |
| 发现历史 | Home/New/Detail/Contact → /notes，无隐式contact/q | 首页保留新建并新增全局入口；新建可查看过往、详情返回全局、联系人同时保留过滤入口与全局入口 | 组件点击不是实际Phone／8082验收；编辑页返回需草稿确认，不扩全局导航协议 |
| 首次读取 | NotesRoute认证／服务器scope，GET /api/notes；VM校验actor及payload | 授权源之外的records排除；本账号未解码记录使repository读失败，不再悄悄当空集合 | 错误API仍为脱敏generic500，未提供精确损坏计数UI；合法v3缺正式decoder，不能放宽成v2 |
| 分页／搜索 | service.search读取完整授权匹配集，稳定时间＋ID排序；cursor绑定query与实际集合fingerprint | 53篇服务集合20/20/13完整遍历；编辑变源旧cursor拒绝；UI显示loaded/total、完成状态、失败保留旧页可重试 | fingerprint不是canonical持久revision／snapshot；并发真实HTTP与数据库分页可见性未验证。创建／删除／账号／服务器真实切换矩阵缺 |
| 迟到响应 | App局部source、AbortController与单飞ref，不改全局HTTP／auth | 切搜索旧后页拒绝；首后页重复合并，保留较新version；联系人后页同样隔离 | 跨端源fence／离线epoch不由局部ref替代；源码缺 route-domain-inventory.ts，不假定新ROOT镜像已在Phone基线 |
| 写草稿／恢复 | AsyncStorage NoteDraft v2，校验mentions边界等 | 同key save/clear顺序；New/Edit确认／丢弃／保留退出后禁发旧timer；晚到恢复不覆盖用户修改，New本地revision避免输入后清空ABA，Edit既有mutation key隔离；再次编辑允许新草稿 | 晚到恢复与timer复活均观察真实组件RED后修复；draft load非法内容仍返回null，非完整损坏记录反馈。存储clear异常后的确认回执恢复仍需原生／持久化矩阵 |
| 取消／返回 | New/Edit脏内容提示保留／丢弃／继续，未调用业务写入 | AppScreen optional onBack默认不变；New历史退出目标在继续编辑后清除，避免后来cancel串目标 | AppScreen CRITICAL58direct/86impacted/9processes已告警，完整直接默认back/fallback验证与一次App I仍需收口 |
| 创建 | POST /api/notes，稳定幂等ID；service receipts，App confirmedNote精确owner/body/relations回执 | 现有成功／失败／不匹配回执测试保留；空取消无POST；只确认后clear并去服务端ID详情 | POST回执不是独立GET；生产SQL多进程幂等／事务未由进程内lock证明。异常throw、clear失败和晚到autosave需进一步审查 |
| 编辑 | PATCH /api/notes/[id] expectedVersion／idempotencyKey，回执新版本 | 既有version409及确认回执测试；脏编辑顶部返回提示 | 生产跨进程CAS、旧ACK／独立GET矩阵未验，不新增平行writer协议 |
| 关联／解除 | actor可访问contacts/events校验；DELETE关联只是unlink，不能当delete note | 保留原关联、解除确认测试和联系人只读入口 | 原关联查询无canonical撤权epoch证明；真正删除及新AI撤权依赖前序 |
| 删除／墓碑 | 本基线NoteService没有deleteNote，独立note DELETE route不存在 | repository明确排除已标deletedAt的原存储记录；未知格式墓碑不作为损坏活动记录 | D45冻结661c015的mutationPort仅可选，factory未接正式port；禁止整体取半接线API。正式删除writer／回执／transaction/journal接口缺 |
| 同步／离线重启 | 应消费0033～36正式canonical镜像／授权接口 | 不修改共享同步协议；不把本地草稿当离线完整历史 | Phone基线缺实际route-domain inventory／v3reader接线；授权持久epoch、完整／部分／未同步状态、重连墓碑及镜像不复活缺真实证据 |
| AI新查询 | notes.query当前直接legacy存储 | 审查明确指出无效记录静默丢弃和cursor变源不一致 | 未统一canonical decoder、未接正式source fence，SC03/04必须missing；不调用provider或付费API |

## 契约状态（不是completed）

- SC01：本地安全入口及草稿导航已实施，直接组件证据；真实设备和三语全集矩阵待ROOT。
- SC02：本地53篇服务遍历、UI失败／重试／去重／迟到请求具证据；真实创建／删除／切scope与HTTP集合对照待ROOT，不能全pass。
- SC03：v1/v2与foreign actor／墓碑读取可验证；合法canonical v3和AI统一读接口缺，missing。
- SC04：原创建／编辑／unlink与草稿串行仅部分；正式删除port、持久授权/source fence、离线重启重连缺，missing。
- SC05：中文审查已提供；固定源码生产重建／WebAPI+PhoneWeb+主8082同账号写后独立GET、真实删除／离线矩阵与主线集成均由ROOT执行，missing。

所有本地测试使用Node22、env隔离和zero-outbound guard；App／定向guard denied=0，Web一次全量有一子套件denied=4（Phone原基线同样4），real-env-blocked=true。这些是已被拒绝的尝试，不是零尝试，不声称调用成功。没有真实账号／笔记／数据库清理，不存在需要恢复的用户数据。本审查的失败、缺格式与跳过不能报告为pass；最终命令和固定提交由收口REPORT登记。
