# 名片批量摄取 V2 设计方案（v2.4 定稿）

> 状态：定稿。
> 评审记录：GPT-5.6-sol（max effort）三轮评审——第一轮「需大改」→ v2.2；第二轮「需小改」→ v2.3；第三轮终审确认架构与并发协议闭环，剩余 2 处事务边界缺口 + 3 项精确化已全部落入本版，评级达到「可执行」。
> 原则：保留幂等 / 隔离 / 恢复内核，砍掉为 500 张规模预设的机械；简洁优雅，但每一条正确性保证都要可证明。

## 0. 决策记录

### 产品决策（相对 V2 完整版）

1. **不做名片区域裁切**。原图上传后即销毁，裁错不可恢复；改为拍摄引导页（示例照：一卡一照、正对、填满画面、光线充足）前移解决。
2. **拍摄/上传前常驻提示**：「一张照片只拍一张名片，多张合拍可能识别不准确」。只提示，不做多卡检测（YAGNI）。
3. **批次上限 500 → 100**，UI 推荐 20–50；消灭 SSE / cursor 增量查询的存在理由。
4. **PDF 移出本版范围**，继续走现有 source-file 流程。
5. 去掉失败清单导出；指标压缩到 5 项。

### 第一轮评审后的修正（v2.2）

6. **item 表就是唯一的 durable queue**，删除 OCR outbox；只保留 notification 与 cleanup outbox。
7. **替换图片不经过 `awaiting_upload`**：单事务 `terminal_failed → queued` 原子交换 digest / object key。
8. **批次级生命周期事务固定锁序：先锁 batch 行，再动 items**，消灭"双 worker 双双弃权、批次永卡 processing"竞态。
9. **通知引入 `review_generation` 事件代际**。
10. **联系人确认与 item 转换同一 PostgreSQL 事务**，沿用现有稳定 contact ID 幂等键。
11. provider 预检移到 finalize；batch 删除 `failed` 状态。
12. lease 论证修正（provider 上界 120s / 端到端 deadline 240s / lease 300s）。
13. 补齐字段与约束；共享对象存储改为部署门槛；手工录入 = `confirmed` + contact ID；过期不因重试续命。

### 第二轮评审后的修正（本版）

14. **引入唯一的锁内状态归约函数 `reconcileBatchStateLocked`**，所有生命周期事务收口调用。修复确定性死角：全部 items 被排除后 finalize，无 worker 触发完成检测，批次永卡 `processing`。
15. **`attempt_count` 重新定义为"已授予的 lease 次数"，只在领取时 +1**；领取只匹配 `attempt_count < 3`；`processing + lease 过期 + 次数耗尽` 由 batch-first reaper 转 `terminal_failed`。修复双重计数与"第三次过期后无人终态化"。
16. **过期覆盖已 finalize 的 `processing`**：`{processing, ready_for_review}` 按同一 `expires_at` 过期；复核 API 锁内检查 deadline。修复"6.9 天重试 + worker 卡死 = 批次永生"。
17. **"CAS 0 行静默丢弃"仅限 worker 结果提交**；用户事务（确认/重试/换图）前置条件失败一律回滚并返回 409。修复"联系人已插入、item CAS 0 行仍提交"的事故路径。
18. 跨表不变量不用 CHECK（PostgreSQL 普通 CHECK 读不到父表）：**局部字段组合用 CHECK，跨表不变量由 repository 唯一事务入口 + 竞争测试保证**。
19. **创建批次原子化**：batch + 全部 item 行同一事务插入；唯一键冲突时读已提交批次比对 fingerprint，残缺批次不得幂等返回。
20. collecting 期换图收严：不同 digest 默认 409；显式换图需 `If-Match: version`；两条换图路径共用同一把 batch-first 交换事务。
21. finalize 顺序修正：先幂等返回已 finalize 结果，再对 `collecting` 做 provider 预检；全排除批次直接拒绝 finalize（`400 EMPTY_BATCH`，引导取消）。
22. 通知投递的保证降级为诚实表述：outbox 每 generation 恰好一条 + best-effort supersede + 下游按 generation 幂等；文案用"批次状态有更新"，不断言具体状态。

### 第三轮（终审）后的修正（本版）

23. **finalize 的权威校验全部移入 batch 锁内**：锁内幂等分支（并发 finalize 已成功 → 返回首次结果）、锁内重新校验 items（含 `EMPTY_BATCH`）；锁外检查仅作快速失败。修复"锁外检查后最后一项被并发排除，全排除批次仍被转入 processing"竞态。
24. **统一 deadline 前置检查 `expireIfDueLocked`**：所有持 batch 锁的状态变更事务先执行它，过期优先转 `expired` 并返回 410；worker 领取 SQL 额外要求 `b.expires_at > now()`。修复"sweep 未跑之前，过期批次仍可被 finalize 续命 / 被授予新 lease"。
25. reaper 终态化写全字段（清 lease，否则违反自家 CHECK 约束）。
26. lease token 逐 item 生成（`gen_random_uuid()`），不共用批量 token。
27. 删除 `item.retryable` 冗余字段：是否可重试由 `error_code` 集中映射函数决定，消灭矛盾组合。

## 一、产品目标

- 17 张、约 29 MiB 的真实 HEIC 稳定处理；单张失败不拖垮批次。
- 上传中断、刷新页面、worker 崩溃均可恢复。
- 多 worker 不重复提交 OCR 结果、不重复创建联系人。
- 原图不持久化，只保存轻量 OCR 衍生图。
- 联系人只能由用户逐张确认后创建（确认前写入恒为 0，确认后恰好为 1）。
- 批次上限 100 张，UI 推荐每批 20–50 张。

```text
拍摄引导 → 选择照片 → 创建 collecting 批次及 manifest（单事务）
  → 每张独立上传（服务端同步标准化）
  → 用户 finalize（幂等返回 → provider 预检 → 单事务入队）
  → worker 并发识别 → reconcile → ready_for_review（带 generation 的通知）
  → 用户确认 / 跳过 / 重试 / 替换 / 手工录入 → reconcile
  → 全部终态 → completed，衍生图经 cleanup outbox 删净
```

## 二、上传与图片处理

### API（6 个端点）

```text
POST /api/contact-drafts/business-card/batches                     创建批次（带完整 manifest）
PUT  /api/contact-drafts/business-card/batches/{id}/items/{itemId}/content    上传（collecting 期）
POST /api/contact-drafts/business-card/batches/{id}/items/{itemId}/replace   换图（collecting/review 期，需 If-Match）
POST /api/contact-drafts/business-card/batches/{id}/finalize
POST /api/contact-drafts/business-card/batches/{id}/cancel
GET  /api/contact-drafts/business-card/batches/{id}                ?view=summary 只返回派生计数
```

> 此处只列摄取与批次生命周期端点。复核动作（确认 / 重试 / 跳过 / 手工录入）沿用现有 item action 端点，其事务行为按 §五 收紧——不要误解为接口已全部列出。

### 创建批次（单事务）

manifest 每项：`fileName / mimeType / rawSize / seq / clientDigest`；请求级 `idempotencyKey`。

- **batch 行与全部 item 行在同一事务插入**；服务端一次生成 `batchId` 与全部 `itemId`。
- 持久化 `manifest_fingerprint`（manifest 规范化后的 SHA-256）。
- `UNIQUE(actor_id, idempotency_key)` 冲突时：读取已提交批次，同 fingerprint 且 item 行数等于 `expected_items` → 返回首次结果；不同 fingerprint → `409 IDEMPOTENCY_CONFLICT`。（原子创建保证不存在"残缺批次"，行数校验是防御性断言。）
- `UNIQUE(batch_id, seq)` 约束 items。

### 单张上传（collecting 期）

- 原始请求体（非 multipart），浏览器并发 3 张，单张原图上限 10 MiB。
- **不信任 `Content-Length`**：流式读取中执行硬字节上限，服务端重算 SHA-256 与客户端 digest 比对。
- 同一 item、相同 digest 重传 → 幂等返回成功。
- 同一 item、不同 digest → **一律 `409 CONTENT_MISMATCH`**（防两个旧页面并发形成"最后写入者获胜"）。用户在 UI 上显式换图时走 `replace` 端点，带 `If-Match: item.version`。
- Next.js proxy 上限只需略高于单张上限；route 运行在 Node runtime，平台最大执行时间须明显大于服务端标准化 deadline。

### 换图（两条路径，一把事务）

collecting 期（item = `uploaded`）与 review 期（item = `terminal_failed`）共用同一个 repository 方法 `swapDerivativeLocked`：请求内先标准化新图并写对象存储（不动 DB），随后单事务：锁 batch → 锁 item 校验前置条件（collecting：batch=`collecting` 且 item=`uploaded`；review：batch∈{`ready_for_review`,`processing`} 且 item=`terminal_failed`）→ 原子交换 digest / `derivative_object_key` → 旧对象写 cleanup outbox → review 路径额外置 item `queued`（`attempt_count=0`、`next_retry_at=now()`）并将 batch CAS 回 `processing`。前置条件不满足 → 回滚、`409`，新对象尽力删除 + sweep 兜底。**不存在持久化的"准备替换"中间态。**

### 标准化（上传/换图请求内同步完成）

1. 校验 magic bytes、MIME；**解码器级**像素与内存上限（不允许"完整解码后再查像素数"），防压缩炸弹。
2. 按 EXIF 方向旋转；**不裁切**。
3. 最长边缩到约 2048 px；自适应 JPEG/WebP 压缩，目标 300 KiB–1.2 MiB，硬上限 2 MiB（最终参数由 OCR 准确率评测定）。
4. 移除全部 EXIF / GPS / 设备信息。
5. **先写对象存储、后做 DB 事务**；DB 失败立即尽力删除新对象，sweep 兜底孤儿。
6. 原始字节只存在于请求内存，请求结束即释放。

并发准入：浏览器端并发 3 之外，服务端另设 per-actor 与全局的标准化并发上限（信号量），防多用户同时解码 HEIC 耗尽内存。失败当场返回 `IMAGE_INVALID`。

P2 验收含真实 HEIC 峰值 RSS / CPU / P95·P99 / 请求超时实测；平台无法稳定覆盖时退回"临时加密对象 + 后台标准化"，不硬撑同步方案。

### 拍摄引导

进入批量导入前展示引导页：4 张好/坏对比示例照，要点为一卡一照、正对名片、填满画面、光线充足；引导页与上传页均常驻多卡提示。

## 三、数据模型

### Batch

```text
id / actor_id / status / expected_items / version
review_generation            -- 单调递增，每次成功进入 ready_for_review +1
idempotency_key / manifest_fingerprint
ingest_version               -- 'v2'
status_reason / created_at / updated_at / finalized_at / expires_at
```

状态（6）：`collecting → processing → ready_for_review → completed`，加 `cancelled / expired`。

- `ready_for_review ↔ processing` 可因复核重试/换图往返。
- `completed` 与 `ready_for_review` 的进入统一由 `reconcileBatchStateLocked` 驱动（§六）。
- 进度计数不落库：**单条 SQL** 同一 MVCC 快照返回 batch 行 + `COUNT(*) FILTER (WHERE ...)` 全部计数（含"等待退避中"），UI 不会看到不一致组合；此查询不需要锁。生命周期判断则一律在锁内重新 COUNT，不信任 API 层先前的计数。

过期语义：

- `collecting`：`expires_at = created_at + 24h`，不重置。
- finalize 时重置 `expires_at = finalized_at + 7d`；**此后 `processing` 与 `ready_for_review` 均按它过期**，复核重试/换图不重置——7 天从首次 finalize 起算，批次不能靠重试永生。
- **统一前置检查 `expireIfDueLocked`**：所有持 batch 锁的状态变更事务（上传落库、换图、finalize、worker 提交、reaper、确认、重试、跳过）第一步执行——`collecting` 超 24h，或已 finalize 的 `processing / ready_for_review` 超 `expires_at` 时，优先转 `expired`、fence items、写 cleanup outbox，本次业务操作返回 410。它同时是 `reconcileBatchStateLocked` 的前置步骤：过期优先级高于 completed / ready。
- worker 领取不持 batch 锁，因此领取 SQL 额外要求 `b.expires_at > now()`——不为已过期但尚未被 sweep 的批次授予新 lease。

### Item

```text
id / batch_id / seq / status / version
source_file_name / raw_size / raw_mime_type
image_digest / derivative_object_key / derivative_size
extraction / extraction_schema_version      -- OCR 结构化结果 JSON 及 schema 版本
review_issues                               -- 复核提示（低置信字段等），可空
confirmed_contact_id                        -- 确认/手工录入后回填
attempt_count                               -- 已授予的 OCR lease 次数（仅领取时 +1）
next_retry_at / lease_token / lease_expires_at
error_stage / error_code / provider_request_id / trace_id
-- 不落 retryable 冗余字段：是否可重试由 error_code 的集中映射函数决定，避免矛盾组合
created_at / updated_at
```

状态（9）与完整转换表：

```text
-- collecting 期
awaiting_upload → uploaded          上传+标准化成功
awaiting_upload → excluded          用户排除
uploaded        → excluded          用户排除（已上传后反悔）
uploaded        → uploaded          换图（replace 端点，If-Match，原子交换）

-- finalize（单事务）
uploaded        → queued            next_retry_at = DB now()，attempt_count = 0

-- worker（见 §六）
queued          → processing        领取：SKIP LOCKED + 新 lease_token + attempt_count+1
processing      → processing        过期接管（同领取 SQL，attempt_count+1，新 lease_token）
processing      → extracted         OCR 成功，CAS 提交
processing      → terminal_failed   不可重试错误 / 可重试但 attempt_count 已达上限 / reaper 终态化
processing      → queued            可重试错误：next_retry_at = 退避+抖动（不增计数，计数在领取时）

-- 复核期（均持 batch 锁，见 §五）
terminal_failed → queued            人工重试 / 换图：attempt_count=0，next_retry_at=now
terminal_failed → skipped           跳过
terminal_failed → confirmed         手工录入：同事务创建联系人，回填 confirmed_contact_id
extracted       → confirmed         用户确认：同事务创建联系人，回填 confirmed_contact_id
extracted       → skipped           用户跳过

-- cancel / expire（批次级事务统一驱动，见 §七）
{awaiting_upload, uploaded, queued, processing, extracted, terminal_failed} → excluded
```

不变量与落地方式：

- 局部字段组合用 **CHECK 约束**：`queued ⇒ next_retry_at NOT NULL`；`processing ⇒ lease_token/lease_expires_at NOT NULL`；非 `processing` 不得残留 lease；`confirmed ⇒ confirmed_contact_id NOT NULL`。
- 跨表不变量（`awaiting_upload/uploaded` 只存在于 `collecting` 批次）**不用 CHECK**（PostgreSQL 普通 CHECK 不能读父表）：由 repository 唯一生命周期事务入口 + P1 竞争测试保证。由此推论：`processing` 批次下"无 `queued`/`processing` item ⇒ OCR 已收敛"恒成立。
- 所有更新一律条件更新（version / 状态谓词），禁止无条件 upsert。
- **"影响 0 行 → 静默丢弃"仅适用于 worker 结果提交**（lease 被接管/批次已取消，属预期竞争）。用户发起的事务（确认/重试/换图/跳过）前置条件失败一律**回滚并返回 409**，绝不部分提交。

OCR 收敛集合：`extracted / terminal_failed / confirmed / skipped / excluded`。
批次完成集合：`confirmed / skipped / excluded`。

## 四、finalize（幂等事务）

1. 读取 batch：已非 `collecting` 且由同 key 首次 finalize 产生 → **直接幂等返回首次结果**（不再做任何预检——已入队批次不因 provider 此刻抖动返回 503）。
2. `collecting` 批次：同步预检 provider 已配置/能力可用；不可用 → `503 PROVIDER_UNAVAILABLE`，批次留在 `collecting`。预检只保证"配置存在"，不承诺运行期可用——瞬时故障由 item 重试消化。
3. （可选快速失败）锁外预览 items 给 UI 提前反馈；**不作为权威判断**。随后开启事务、锁 batch、先执行 `expireIfDueLocked`（超 24h → `expired`，返回 410）。锁内再判状态：`finalized_at IS NOT NULL` 且状态 ∈ {`processing`, `ready_for_review`, `completed`} → 并发 finalize 已先成功，**直接返回首次结果**；状态非 `collecting` 的其余情形按当前状态返回 409/410。
4. 同一事务、同一 batch 锁下**重新读取并校验全部 items**：存在 `awaiting_upload` → 返回待处理明细（UI 四选一：重试上传/换图/排除/取消）；`uploaded` 数量为 0 → 回滚并返回 `400 EMPTY_BATCH`，引导取消批次；否则 `uploaded` items → `queued`（`next_retry_at = now()`、`attempt_count = 0`），batch → `processing`，写 `finalized_at` / `expires_at = now() + 7d`，bump version，提交。
5. 独立 worker 进程启动时也做 provider readiness 检查（API 与 worker 的环境配置可能不一致）。

## 五、复核期操作

全部走 repository 唯一生命周期事务入口（锁序：batch → items），结束前调用 `reconcileBatchStateLocked`：

**确认 / 手工录入**（同构）：

```text
1. 锁 batch（校验 ∈ {ready_for_review, processing}，expires_at 未过）
2. 锁 item，校验为 extracted（确认）/ terminal_failed（手工录入）
3. 以稳定 contact ID 幂等键插入联系人（联系人服务必须支持传入本事务的 unit-of-work——
   "同一个 PostgreSQL"不等于"同一个事务"）
4. item → confirmed，回填 confirmed_contact_id
5. 衍生图写 cleanup outbox
6. reconcileBatchStateLocked
7. 任一前置校验失败 → 全部回滚，返回 409
锁内禁止任何网络调用（OCR provider、推送等）。
```

**人工重试**：锁 batch → item CAS `terminal_failed → queued`（`attempt_count=0`）→ batch 若为 `ready_for_review` 则回 `processing` → reconcile。

**换图**：见 §二 `swapDerivativeLocked`（review 路径）。

**跳过**：锁 batch → item → `skipped` → cleanup outbox → reconcile。

## 六、Worker 与状态归约

### 唯一归约函数（锁内调用）

```text
reconcileBatchStateLocked(batch):
  前置：expireIfDueLocked(batch) —— 已到 deadline 则优先转 expired（§三），不再继续归约
  若所有 item ∈ {confirmed, skipped, excluded}:
      batch → completed
  否则若 batch = processing 且不存在 {queued, processing} item:
      batch → ready_for_review；review_generation += 1；同事务写通知 outbox
  否则: 不变
```

调用方：finalize（防御）、worker 成功提交、worker 终态失败、reaper 终态化、确认、跳过、手工录入、人工重试、换图。任何路径到达收敛点都必然经过它——不存在"没人触发完成检测"的死角。

### 领取（单事务 CTE，不持 batch 锁；claim 后不得再申请 batch 锁，维持全局锁序）

```sql
WITH candidate AS (
  SELECT i.id FROM items i
  JOIN batches b ON b.id = i.batch_id
              AND b.status = 'processing'
              AND b.expires_at > now()          -- 过期批次不授予新 lease（sweep 之前也不行）
  WHERE i.attempt_count < 3
    AND (   (i.status = 'queued'     AND i.next_retry_at   <= now())
         OR (i.status = 'processing' AND i.lease_expires_at <  now()) )   -- 过期接管
  ORDER BY i.next_retry_at NULLS FIRST, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT :n            -- n ≤ worker 实际并发能力，不预领
)
UPDATE items SET status = 'processing',
                 lease_token = gen_random_uuid(),   -- 逐 item 生成独立 fencing token
                 lease_expires_at = now() + interval '300 seconds',
                 attempt_count = attempt_count + 1,
                 version = version + 1
FROM candidate WHERE items.id = candidate.id
RETURNING items.*;
```

- `attempt_count` 只在此处递增 = "已授予的 lease 次数"，上限 3；毒图最多被执行 3 次。
- 时间一律用数据库时钟。
- 索引：`(status, next_retry_at)` 之外，加部分索引 `lease_expires_at WHERE status = 'processing'`。

### 提交（持 batch 锁）

```sql
UPDATE items SET status = 'extracted', extraction = ..., version = version + 1, ...
WHERE id = ? AND status = 'processing' AND lease_token = ? AND version = ?;
```

- 0 行（被接管/已取消）：静默丢弃，正常返回（仅此处允许静默）。
- 1 行：调用 `reconcileBatchStateLocked`。
- 可重试失败：item → `queued`、`next_retry_at` = 指数退避+抖动（不增计数）；不可重试或 `attempt_count = 3`：→ `terminal_failed`，然后 reconcile。

### Reaper（sweep 的一部分，batch-first）

`processing` item 且 `lease_expires_at < now()` 且 `attempt_count >= 3`：逐批锁 batch（`FOR UPDATE SKIP LOCKED`，一次只持一个 batch 锁）→ item 更新为 `status='terminal_failed'`、`error_code='LEASE_EXHAUSTED'`、**`lease_token=NULL`、`lease_expires_at=NULL`**（否则违反"非 processing 不残留 lease"的 CHECK）、`version+1`、`updated_at=now()` → reconcile。覆盖"第三次 lease 也过期，无人再领取"的终态化死角。

### Lease 与超时

端到端 OCR hard deadline 240s（两阶段 provider 上界 120s + 对象读取/解析/落库裕量），worker 层强制中止；lease 300s > deadline，接管时原持有者必已放弃。300s 为首发参数，按 P99 调整；不够先调大 lease，heartbeat 留作升级路径。事务设置合理 `lock_timeout` / `statement_timeout`。测试覆盖 lease 边界竞态（299/300/301 秒提交与接管交错）。

### 通知（事件代际，诚实保证）

- outbox 唯一键 `(batch_id, event_type, review_generation)`，与状态转换同事务写入：数据库层每个 generation 恰好一条，不漏不重。
- 投递器发送前重读 batch 做 **best-effort supersede**（状态已变/generation 已推进则标记 superseded 不发）；但发送与用户操作之间存在不可消除的 TOCTOU，且不得跨网络调用持锁——因此通知文案不断言具体状态，统一为「批次状态有更新，点击查看」。
- 外部投递 at-least-once；下游以 `(batch_id, generation)` 幂等。

## 七、Cancel 与过期

**Cancel**（用户触发，单事务，无中间态）：

1. 锁 batch；接受 `collecting / processing / ready_for_review` → `cancelled`。
2. 同事务：`{awaiting_upload, uploaded, queued, processing, extracted, terminal_failed}` 的 items → `excluded`，bump version、清 lease，衍生图逐个写 cleanup outbox。
3. 在途 worker 稍后提交 CAS 0 行，静默丢弃。
4. cancel 与 confirm 靠同一把 batch 锁串行：confirm 先赢则联系人保留、不回滚；UI 文案明确「取消只停止未处理项，已确认的联系人保留」。

**过期 sweep**：`collecting` 超 24h；**已 finalize 的 `processing` / `ready_for_review`** 超 `expires_at` → `expired`，item 处置与 cancel 相同（processing item 一并 fence）。sweep 逐批处理，`FOR UPDATE SKIP LOCKED`，一次只持一个 batch 锁。

## 八、存储与清理

- 存储走适配器接口（put / get / delete）。**P4 上线门槛：API 与 worker 进程共享同一持久文件系统**（同主机或同一挂载卷、同一根路径）——"单实例"不够精确，一个 web 容器 + 一个 worker 容器各自本地盘即为坏档。不满足则必须先完成共享对象存储实现。
- 对象 key 用 UUID，不含文件名或联系人信息。
- cleanup outbox 统一清理入口：确认 / 跳过 / 取消 / 过期 / 换图淘汰的旧对象；删除失败自动重试。
- **一个** reconciliation 定时 sweep 合并：孤儿对象（双向）、reaper（§六）、过期批次、停滞批次（`updated_at` 超 1h 无变化 → 报警并记 `status_reason`）。
- 数据库与对象存储不假装跨系统事务：先写对象后 DB + cleanup outbox + sweep = 最终一致。

## 九、前端体验

- 上传阶段每张：准备中 / 上传中 / 已上传 / 图片无效 / 已排除；批次级总进度。
- 处理阶段每张：排队中（含等待重试，附下次重试时间）/ 识别中 / 已识别 / 识别失败。
- 复核页失败项四选一：重试 OCR / 替换图片 / 手工录入 / 跳过。
- 刷新恢复：`GET /batches/{id}` 全量返回（≤100 items）；进行中每 3 秒轮询 `?view=summary`（单条 SQL 派生计数）。无 cursor / SSE。
- 错误展示明确原因 + 下一步动作；页面展示批次 ID。
- 衍生图读取 URL 短期有效并绑定用户。

## 十、安全与可观测性

红线：

- 不记录原图、base64、OCR 全文或联系人字段；日志只含 batch/item ID、阶段、错误码、attempt、trace ID。
- 对象存储服务端加密；防伪造 MIME、解码器级像素限制、压缩炸弹、路径穿越。
- 确认前联系人写入恒为 0，确认后恰好为 1（发布门槛测试项）。

指标 5 项 + 报警 2 条：

```text
指标：上传成功率 / OCR 成功率 / OCR P50·P95 延迟 / 单项 attempt 分布 / 孤儿对象数
报警：批次停滞超 1 小时；provider 错误率突增
```

索引与约束：`(batch_id, status)`、`(status, next_retry_at)`、部分索引 `lease_expires_at WHERE status='processing'`、`UNIQUE(batch_id, seq)`、`UNIQUE(actor_id, idempotency_key)`、outbox `UNIQUE(batch_id, event_type, review_generation)`。

## 十一、实施阶段（4 + 1）

| 阶段 | 工作 | 验收门槛 |
|---|---|---|
| P1 | 状态机、repository 唯一事务入口、迁移（CHECK/索引/唯一键）、`reconcileBatchStateLocked` | 全部转换、CAS、锁序测试通过；"双 worker 并发完成最后两项"必有一方完成转换；"全排除 finalize"被拒绝；cancel/confirm/worker submit 三方交错测试通过 |
| P2 | 原子创建批次、逐张上传、同步标准化、并发准入、换图端点、拍摄引导页 | 17 张 29 MiB HEIC 全部上传成功；损坏图当场 `IMAGE_INVALID`；不同 digest 上传 409；真实 HEIC 峰值 RSS / CPU / P95·P99 实测过关 |
| P3 | finalize、worker 领取（CTE）/提交/重试、reaper、通知代际 | 重复 finalize 幂等（含并发 finalize 锁内幂等分支）；"锁外检查后最后一项被并发排除"返回 `EMPTY_BATCH` 而非入队；过期批次在 sweep 前任何入口均拒绝/不授予新 lease；双 worker 无重复结果；崩溃 ≤5 分钟接管且计次；毒图恰好 3 次后 `terminal_failed`（含 reaper 路径）；并发完成恰好一条 outbox；lease 边界竞态通过 |
| P4 | 复核操作（确认事务含联系人插入）、cancel、过期 sweep、cleanup、feature flag 灰度 | 刷新/断网可恢复；确认重试联系人恰好 1 个；用户事务失败全回滚 409；取消/确认/跳过/过期后图片删净；**最小可发布闭环（API 与 worker 共享持久文件系统的部署）** |
| P5（多实例部署前必做） | 共享对象存储实现、压测与故障注入、指标看板 | 多实例拓扑下全部发布标准复测通过 |

旧批次继续用现有读取和复核接口；新旧批次以 `ingest_version` 区分，不迁移在途批次。

## 十二、发布标准

P4 灰度前必须证明：

- 17 张真实 HEIC 完成上传和识别；单张失败不影响其余。
- 刷新、断网、重复请求不产生重复 items；重复 finalize / 同 key 重复创建幂等；同 key 不同 manifest 409。
- 两个以上 worker 不提交重复结果；最后多项并发完成时批次必然转入 `ready_for_review` 且每个 generation 恰好一条通知（含复核回转）。
- worker 崩溃 ≤5 分钟被接管；毒图恰好 3 次尝试后终态化，包括"第三次 lease 过期无人领取"由 reaper 收尾。
- 全部排除的批次无法 finalize；任何路径到达收敛点批次都不会卡在 `processing`。
- 确认前联系人写入恒为 0，确认后恰好为 1（含确认请求重试）；用户事务失败无部分提交。
- 已 finalize 批次超 7 天必然过期，包括停留在 `processing` 的情形。
- 取消、确认、跳过、过期、换图后旧衍生图最终删净；sweep 无孤儿。
- 100 张满批不导致请求体、内存或数据库失控。
- 现有复核、重复联系人检测与联系人创建行为保持兼容。
