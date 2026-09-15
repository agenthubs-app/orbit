# Sprint 0034 — 个人数据离线写入与冲突处理设计

## 前置条件与边界

0034 只建立四个 actor-private 域的离线写入：note、canonical task、`category=relationship` 的已确认跟进，以及 personal schedule。0033 的增量读取、提交有序 `sync_revision` 和四域本地镜像必须已经完成并合并；0033 Note DELETE 还必须完成数据库级 CAS 修复，证明两个进程中的 stale PATCH 不能复活已删除笔记。Note CAS 未满足时，Note 离线 mutation 不得启用，其余无依赖工作可以继续。

| 行为 | 离线队列 | 原因 |
| --- | --- | --- |
| 笔记 create/update/delete | 支持 | actor 私有；依赖 0033 Note CAS、version 和墓碑 |
| 待办 create/update/status/delete | 支持 | actor 私有 canonical task；不含 suggestion 接受 |
| 已确认关系跟进 create/update/status/delete | 支持 | wire 仍为 task；create 还需本地资格快照及服务端重验 |
| 个人日程 create/update/delete | 支持 | actor 私有 canonical personal schedule |
| meeting/event/invitation/registration/chat/permission/account/provider/AI side effect | 不支持 | 多方状态、实时资格或不可逆副作用必须在线确认 |

未保存编辑器草稿仍是 Device-only Draft。只有用户点击现有“保存／完成／删除确认”后才生成 Pending Local Change。0034 不把联系人全集切到增量同步，也不开放 AI 写入。

## 权威与原子性不变量

1. PostgreSQL 中的领域记录和 `orbit_records.sync_revision` 是 Cloud Canonical Record；SQLite pending overlay 不是服务器事实。
2. 对每个 mutation，`baseRevision` 检查、领域校验与写入、新 `sync_revision` 读取、全局幂等 receipt 写入必须在**同一个 PostgreSQL transaction** 中完成。receipt 写失败就回滚领域写；领域写未提交就不得返回 `acknowledged`。
3. 离线入口必须复用对应领域已有 advisory-lock key 和 transaction-bound repository。不得在外层拿一把新锁、再调用会另开 transaction 的 service，也不得以进程内 mutex 代替数据库锁。
4. mutation receipt 在 PostgreSQL 中按 `(workspace_id, actor_id, mutation_id)` 全局唯一，不因 route 进程重启、换实例或领域不同而丢失。fingerprint 覆盖 kind、operation、目标、base revision、patch 和资格引用；同 ID 同 fingerprint 重放返回逐字等价的已存结果，同 ID 不同 fingerprint 返回持久 `IDEMPOTENCY_MISMATCH`，不执行领域写。
5. receipt 保存 terminal `acknowledged`、`conflict` 或 `permanent` 结果；网络、deadlock retry exhaustion、5xx 和 429 等 `retryable` 结果不持久化。并发首次请求由同一领域锁和 receipt 唯一约束收敛成一个结果。
6. `sync_revision` 只能由数据库分配。客户端时间、payload version、`updatedAt`、本地 enqueue 序号均不能充当 revision。

这些规则只依赖 PostgreSQL transaction、unique constraint、row/advisory lock 和项目 `pg` 抽象；实现不能引用 Supabase、Neon 或其他厂商 SDK。相同代码必须能运行在本地 PostgreSQL、Neon、Supabase PostgreSQL 或其他兼容托管实例。

## 共享 wire 契约

共享 contract 定义 TypeScript 类型，共享 API schema 以 strict Zod 在两端运行时校验；App 副本继续由 `npm run sync:contract` 生成并做逐字一致性测试。

```ts
type SyncMutationKind = "note" | "task" | "personal_schedule";
type SyncMutationOperation = "create" | "update" | "delete";

interface SyncMutationCommand {
  mutationId: string;
  kind: SyncMutationKind;
  clientEntityId: string;
  operation: SyncMutationOperation;
  baseRevision: string | null;
  patch: NoteMutationPatch | TaskMutationPatch | PersonalScheduleMutationPatch;
  relationshipEligibility?: {
    contactId: string;
    connectionId: string;
    snapshotVersion: number;
  };
}

type SyncMutationItemResult =
  | {
      status: "acknowledged";
      mutationId: string;
      canonicalId: string;
      revision: string;
      record: SyncChange;
    }
  | {
      status: "conflict";
      mutationId: string;
      conflictKind:
        | "revision_mismatch"
        | "remote_deleted"
        | "relationship_ineligible";
      serverRecord: SyncChange | null;
      serverRevision: string | null;
    }
  | {
      status: "retryable";
      mutationId: string;
      code: string;
      retryAfterMs?: number;
    }
  | {
      status: "permanent";
      mutationId: string;
      code: string;
      fieldErrors?: Readonly<Record<string, string>>;
    };
```

wire command 绝不携带 actorId、workspaceId、server timestamp、receipt 内容或任意 JSON。actor/workspace 只由服务器认证上下文注入。结构限制如下：

- 一批最多 50 项；request body、单项 patch、字符串长度和嵌套深度都有硬上限；对象全部 `.strict()`，拒绝未知字段、危险键和非 allowlisted patch。
- create 的 `clientEntityId` 必须为 `local:<uuid>` 且 `baseRevision=null`。update/delete 只有在 create 已 ack 并解析 alias 后才可上传，必须使用 canonical ID 和非空 canonical `baseRevision`。
- relationship task create 只发送 contact/connection ID 和 snapshot version，不发送联系人正文或本地资格快照；普通 task 不得伪造 relationship eligibility。
- 一个已认证且 schema 合法的 batch 始终以 HTTP 200 返回逐项结果。revision、remote-delete、relationship eligibility 和 idempotency 冲突都不是 HTTP 409。HTTP 409 只保留给 0033 `GET /api/sync` 的 `SYNC_RESET_REQUIRED`；batch 级 401/403、400/422、429/5xx 继续使用统一 failure envelope。

## 服务端 mutation transaction

每个 item 独立 transaction，批次可部分成功；进程在响应前崩溃时，客户端以相同 mutation ID 重放并由持久 receipt 恢复准确结果。transaction 顺序固定：

1. 认证 actor/workspace，解析 strict command 和 canonical fingerprint。
2. 取得对应领域现有 advisory lock；同一实体不得绕过 task、note 或 personal-schedule 的既有锁顺序。
3. 在全局 receipt table 中检查 `(workspace, actor, mutationId)`；匹配则返回保存结果，不匹配则返回 permanent mismatch。
4. create 确认 client local ID 不被当作 canonical authority；update/delete 以 actor、workspace、collection 和 canonical ID 读取当前记录及 `sync_revision`，在 transaction 内比较 `baseRevision`。
5. 在同一 transaction-bound store/repository 中调用现有领域 validator 和 mutation core。不得从 batch 直接拼 JSON 写 `orbit_records`，也不得弱化 note version、task transition、personal schedule expectedUpdatedAt 或 owner 检查。
6. 对 relationship create 重新读取 canonical connection lifecycle。只有 contact、connection、actor/workspace 仍一致且 stage 允许跟进时才执行；本地 snapshot 只解释用户离线时为何能选择，绝不授权服务器写入。
7. 从刚写入的 canonical row 读取数据库分配的 revision，并通过领域 allowlist mapper 构造 record；把 terminal result 和 fingerprint 写入 receipt table。
8. commit 后才向 handler 暴露 `acknowledged`。transaction 回滚、连接中断或无法确认 commit 一律归为 retryable；不能猜测成功。

receipt migration 接入现有 `runOrbitRecordsMigration` 链路，可幂等重跑，并包含唯一约束、actor/workspace 索引、结果大小上限和清理策略。清理周期不得短于所有受支持客户端的离线重放窗口；本 Sprint 默认不自动删除 receipt。

## 本地 schema v2 与真实迁移

本地公开模型中的 `canonicalRevision` 必须是 `string | null`。纯本地 create 在服务器 ack 前没有 canonical revision；禁止写 `"0"`、payload version、时间戳或 local revision 伪装。v2 将以下层分开持久化：

- **canonical layer**：服务器 allowlisted record/tombstone，只有真实 canonical ID/revision。
- **pending layer**：本机 client entity ID、actor/workspace、operation-derived overlay、`baseRevision: string | null`、状态和最后错误；不改写 canonical payload。
- **outbox layer**：不可变 command/fingerprint、稳定 mutation ID、单调 `enqueue_order`、retry metadata。`createdAt` 只用于显示，不能决定 FIFO。
- **conflict layer**：本机 pending 快照、server allowlisted record/tombstone、server revision、conflict kind 和发生时间；不能塞进 `sync_meta`。
- **alias layer**：`local:<uuid>` 到 canonical ID 的独立映射；所有导航和 selector 通过 alias 解析，不能批量字符串替换 payload。
- **eligibility layer**：actor/workspace-scoped 的最小 relationship snapshot（contactId、connectionId、connectionVersion、stage、display label、syncedAt）；它与其他本地数据同库加密。
- **scope state**：上传资格是 `active | auth_locked | reconciliation_required`，不与 cursor 或业务记录混存。

`LOCAL_SYNC_SCHEMA_VERSION` 升到 2，并新增显式的 `migrateLocalSyncV1ToV2`。迁移必须在一个 SQLite transaction 内可重跑、可崩溃恢复：

1. 建立 v2 临时表和约束，不原地把 v1 行解释成新语义。
2. `sync_state=synced` 的 v1 行复制到 canonical layer；pending/failed/conflicted 的 payload 复制到 pending layer，保留原始 JSON，但旧 `revision` 只记为 legacy evidence，不能无证据升级成 canonical/base revision。
3. 对无法从 v1 唯一恢复 server conflict base 的行设 `reconciliation_required`。先完成 0033 bootstrap/delta 并取得 canonical base，再允许上传；本机输入始终保留。
4. v1 outbox 按 `(created_at, mutation_id)` 一次性分配唯一递增 `enqueue_order`，随后所有新 enqueue 在 transaction 内取号。迁移时计算 fingerprint，补 actor scope，并保持 mutation ID 和 patch 不变。
5. 建立空 alias/eligibility 表，校验逐表行数、唯一键和 JSON 可解码性；更新 schema version 后才删除/改名 v1 表。任一检查失败回滚，v1 数据仍可读。
6. 连续运行初始化/迁移两次必须无数据变化。测试还要覆盖在每个 DDL/复制检查点模拟崩溃后重开。

0033 delta 永远只更新 canonical layer。它不能覆盖 pending/conflict；reset 只清当前 workspace canonical rows 和 cursor，保留 pending、outbox、conflict、alias、eligibility 与 Device-only Draft。

## FIFO、上传与 ack transaction

同一 resolved entity 严格按 `enqueue_order` FIFO，不以时间戳排序。调度器每次只选择每个实体的 queue head，不同实体最多四个并发；alias 解析前，所有引用同一 local ID 的 mutation 属于同一队列。上一个 mutation 未 `acknowledged`、被用户解决或明确永久丢弃前，后续 mutation 不能上传。

- 网络、5xx、429、commit-unknown 为 retryable，使用 bounded exponential backoff + jitter；App 重启后复用相同 mutation ID/fingerprint。
- 400/422 领域校验为 permanent，保留本机输入并允许编辑后以新 mutation ID 入队。
- 401/403 将整个 scope 设为 `auth_locked`，立即停止新上传；不得删除或移动队列。
- item conflict 只冻结该实体队列；其他实体继续同步。

处理 `acknowledged` 必须是一个 SQLite transaction：核对返回 mutation ID 正是 entity queue head；upsert canonical record/revision；create 时写 alias；把同一实体后续 local-ID command 解析成 canonical ID，并以 ack revision 作为下一 mutation 的 base；删除已 ack outbox head；重算 pending overlay；最后才向 UI 发布 synced 状态。任一步失败就保留 outbox，重复 receipt 可安全重试。非 head、错误 actor/workspace、revision 倒退、malformed record 或 alias 碰撞均拒绝 ack，不能局部提交。

## 会话过期、换号与主动登出

`AuthSessionProvider` 不再把所有 401 等同于清除同步数据库：

- session expiry 清除失效凭据、关闭数据库 handle、把原 scope 标成 `auth_locked`，但保留加密 DB 文件、key、outbox 和 Device-only Draft。登录页不能展示其内容。
- 只有相同 base URL 且服务端重新认证为同一 actor 后才能解锁并继续；另一账号获得独立 scope，不能重定向或读取旧队列。
- 主动登出前调用 `hasUnsyncedChanges()`。若有 pending/failed/conflict/outbox，必须显示数量和明确选择：取消登出、保留加密数据并登出、或确认永久删除本机未同步内容后登出。最后一项才调用 crypto erasure；失败时不谎报已清除。
- 无未同步内容时可沿用现有安全清理。账号切换、App 卸载和 OS key 丢失仍按不可恢复数据处理并明确报错。

## Relationship eligibility

在线读取 canonical connection lifecycle 时，把最小资格投影写入加密 eligibility layer。离线 UI 只能从该快照选择已有、未删除且 stage 为 `needs_follow_up`、`active` 或 `nurture` 的 contact/connection；`archived` 明确不合格，并显示快照时间。快照缺失或不合格时不允许创建 relationship followup，但普通 task 仍可用。

上传时服务端在 mutation transaction 内使用 `readCanonicalContactLifecycles` 等现有 canonical authority 重新验证 actor、workspace、contact、connection 和 version/stage。snapshot version 仅用于检测 stale，不是权限凭证。资格已撤销、connection 被删或映射改变时返回 `relationship_ineligible` item conflict，保留本机文本；用户必须改为普通 task、选择当前合格联系人或丢弃，不能强制覆盖资格规则。

## 三类冲突及用户动作

| 冲突 | 服务器结果 | 用户可选动作 |
| --- | --- | --- |
| `revision_mismatch` | 当前 active record + revision | 使用云端；以该 revision 重新确认保留本机；另存副本 |
| `remote_deleted` | tombstone + revision | 接受删除；把本机内容另存为新记录；不得复活原 canonical ID |
| `relationship_ineligible` | 无敏感正文，返回资格失效原因码 | 改为普通 task／改选合格关系并新建 mutation；或丢弃本机更改 |

“使用云端”删除当前 conflict 和该实体被其依赖的 pending changes，并保留 server canonical record。“保留本机”绝不是自动重试：用户确认后生成新 mutation ID/fingerprint，以 conflict 的 server revision 为 base；delete conflict 必须再次展示云端当前内容。另存副本总是生成新 `local:<uuid>` create；remote-deleted 不能重用旧 canonical ID。解决 queue head 后才可重新评估后续 FIFO 项，且任何重写都在一个本地 transaction 中完成。

## UI 与 AI 真实性

Notes、Tasks、Today、Personal Schedule 的列表与详情都从 canonical + pending overlay selector 读取，并显示 `待同步／同步失败／有冲突／登录后继续同步`。成功入队只表示“已保存在本机”，不得导航后显示“已同步”。同步状态由持久 state 驱动，不以请求 Promise 成功猜测。

Orbit AI 仍在服务器执行，只能读 Cloud Canonical Record。同步前 App 明示“这项更改仅在本机，AI 暂不可见”；服务器 ack 后才可说明云端已收到。逐记录 AI freshness/revision 的展示由 0036 实现，不作为 0034 的完成条件。

## 安全与完成定义

- 本地文件继续使用 SQLCipher 和 SecureStore key；日志、REPORT、测试输出不得包含 patch 正文、cookie、数据库 URL、cursor secret、contact identity 或完整 receipt。
- 所有 server mapper 维持 0033 allowlist；receipt/conflict 也不能下发 provider token、附件字节、task activities/reminders 或其他 actor 数据。
- migration、transaction、lock 和 query 只使用 provider-neutral PostgreSQL 能力；不得把托管厂商名称写入运行分支。
- 四域离线操作跨重启可恢复、同实体 FIFO、服务器 exactly-once effect、ack 原子落地、三类冲突不丢数据、401 保留并锁定 scope、不支持动作从不入队，才算产品行为完成。
- 完成后仍需 production Web/API 重建重启、真实 PostgreSQL migration 双跑、iOS Simulator 四域与账号生命周期验收、同账号 Web/AI 回读、全量相关回归、合并 `chat-agent`、精确合并树验证和 push/remote SHA 记录。
