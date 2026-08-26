# 名片批量导入：多图/PDF 上传 + 后台处理 + 逐张确认 设计文档

日期：2026-08-26
状态：已定稿（用户批准，含隐私放宽条款）
作用域：`repos/orbits`
前置：单张识别链路已上线（见 `2026-08-26-business-card-deepseek-ocr-design.md`），DeepSeek 两阶段 provider、HEIC 转码、复核确认、查重写入均可复用。

## 背景与目标

用户存量名片 100–5000 张。现有采集是严格单张流程（传一张、等识别、复核、再传下一张），无法承载批量导入。本设计新增：

1. **批量上传**：一次混合上传多张单卡图片（JPEG/PNG/WebP/HEIC）和/或多个 PDF（每页一张名片），单批合计 ≤ 500 项。
2. **后台自动处理**：上传完成即由服务端 worker 处理，用户可关页面/切设备；重新打开批次页自动恢复当前进度。
3. **批量确认**：全批处理完成后，逐张确认+手动修改；重点字段固定格子，其余抽取信息按原标签整合进备注，**零信息丢失**。

**用户已拍板的决定：**

- 单批上限 500 项（图片张数 + PDF 页数合计）；5000 张分批传。
- 重复联系人（邮箱或 姓名+组织 命中现有联系人）：确认时提示，默认跳过，可选仍创建；真合并走现有「重复合并建议」功能。
- 确认入口在**全批处理完成后**开启（处理中可看已完成卡的只读预览）。
- **隐私放宽（用户明示批准）**：批量模式下，转码后的卡图保留在服务器本地目录，直至该卡「确认或跳过」后立即删除；批次 7 天未完成自动整体清理。单张即扫流程维持原有「原图不落盘」不变量不变。界面须明示「卡图保留至你完成确认」。

**验收标准：** 用 `docs/designs/` 两张 HEIC + 一个多页 PDF 实测：上传 → 关闭页面 → 重开恢复进度 → 全部完成收到站内通知 → 逐张确认（覆盖一张失败重试、一张重复跳过、备注聚合核对）→ 名片夹中联系人与备注齐全。

## 沿用的不变量

- 识别引擎复用 `BusinessCardCloudOcrProvider`（DeepSeek 两阶段）与 `business-card-image-normalization`（HEIC 转码 + 3072px 上限），零改动。
- 确认前零联系人写入；复核问题由 `reviewIssuesForBusinessCard` 确定性规则生成。
- 每卡记录 SHA-256 证据摘要（按上传原始字节）与 token 用量 provenance。
- 显式失败不静默回退；单卡失败不影响批内其他卡。

## 组件 1：数据模型（live store 两个新 collection）

`businessCardBatches`（批次，actor-scoped）：

- `id`、`actorId`、`status: "processing" | "ready_for_review" | "completed"`、`totalItems`、`processedItems`、`failedItems`、`confirmedItems`、`skippedItems`、`sourceSummary`（文件名列表 + 每文件页数）、`createdAt`/`updatedAt`、`expiresAt`（创建 + 7 天）。
- 上传 API 在同一请求内完成收文件、PDF 拆页、转码与 item 落库，成功即返回 `processing` 状态批次；不存在半开的 "uploading" 持久态（请求失败 = 整批不创建）。

`businessCardBatchItems`（每卡）：

- `id`、`batchId`、`actorId`、`seq`（批内序号，含来源文件名+页码）、`status: "pending" | "processing" | "extracted" | "failed" | "confirmed" | "skipped"`、`imagePath`（本地转码图路径）、`imageDigest`（原始字节 SHA-256）、`uploadMimeType`、`extraction`（规范化后的结构化抽取）、`reviewIssues`、`usage`（token/延迟）、`error`（失败原因码）、`attempts`、`leaseOwner`/`leasedAt`、`confirmedContactId`。
- lease 语义照抄 `features/notifications/delivery-service.ts` 的 claim/lease 模式（含过期 lease 回收）。

图片存储：`ORBIT_BATCH_UPLOAD_DIR`（默认 `.orbit-batch-uploads/`，加入 `.gitignore`）下按 `<batchId>/<itemId>.jpg` 存**转码后 JPEG**（原始 HEIC/PDF 不保留）。删除时机：item 确认/跳过即删单图；批次 completed 或过期清理时删整个批次目录。

## 组件 2：上传 API 与 PDF 拆页

`POST /api/contact-drafts/business-card/batches`（multipart，authenticated actor）：

- 接受多 `files[]`：图片沿用 `BUSINESS_CARD_UPLOAD_MIME_TYPES`（≤10MiB/张）；`application/pdf` ≤50MB/个。
- PDF 拆页：`pdfjs-dist` + `@napi-rs/canvas`（新依赖，均为宽松许可）逐页渲染为 JPEG（长边 3072px，对齐现有归一化上限），一页一 item；加密/损坏 PDF 整文件报错但不阻断同批其他文件（响应中列出被拒文件及原因）。
- 合计 >500 项：整批拒绝（HTTP 400，错误码 `BUSINESS_CARD_BATCH_TOO_LARGE`），不做部分接收，让用户自行拆分。
- 成功响应：批次 id + 每文件的接收/拒绝明细。

`GET /api/contact-drafts/business-card/batches`：当前 actor 的批次列表（供导入中心入口）。
`GET /api/contact-drafts/business-card/batches/[id]`：批次详情 + 全部 item 状态（进度页轮询用；`extraction` 仅在 `ready_for_review` 后随确认接口下发，轮询响应只带状态计数与缩略状态，控制响应体积）。
`GET /api/contact-drafts/business-card/batches/[id]/items/[itemId]/image`：确认界面取卡图（actor 校验，`Cache-Control: private`）。

## 组件 3：后台 worker

`scripts/run-business-card-batch-worker.ts`（照 `run-notification-delivery-worker.ts` 模式）：

- 循环 claim `pending` item（lease 30s，过期回收），并发 3；每 item：读 `imagePath` → 现有 DeepSeek provider 两阶段识别 → 规范化 + 复核规则 → 写 `extracted`（含 extraction/reviewIssues/usage）。
- 失败自动重试 1 次（`attempts` 计数）；仍失败写 `failed` + 错误码（超时/结构无效/请求失败）。
- 每次 item 落定后更新批次计数；`processedItems + failedItems === totalItems` 时批次置 `ready_for_review`，并通过现有 notifications 体系写一条站内通知（「批次 N 张已识别完成，待确认」）。
- 过期清理：worker 每轮顺带把 `expiresAt` 已过的批次置 `completed`、删除图片目录。
- `launch.json` 增加 worker 配置；worker 未运行时批次停在 processing——进度页显示「处理服务未运行」提示（通过批次 `updatedAt` 距今 >60s 且无 item 在 processing 判定）。

## 组件 4：进度页与批次入口

- 路由 `/app/contacts/new/batch/[id]`：服务端组件拉初始状态，客户端每 3s 轮询详情 API；展示 已处理/失败/总数 进度、逐卡状态网格（含缩略图，来自 image API）、失败卡的错误说明。任意时刻关闭/重开/换设备，凭 URL 恢复。
- `ready_for_review` 后页面切换为确认模式（组件 5）。
- 导入中心 `/app/contacts/new`：「名片扫描」来源卡旁新增「批量导入」入口（多选文件对话框，file input `multiple` + accept 含 `.pdf`）；下方列出进行中/待确认批次（来自列表 API）。桌面与移动布局都要接。

## 组件 5：逐张确认与备注聚合

确认界面（批次页内，一张一屏，确认/跳过后自动跳下一张未处理卡，支持中途离开再回来继续）：

- 左侧：该卡转码图（可缩放）；右侧固定格子（全部可编辑，预填抽取值）：**姓名、公司、职位、邮箱、电话、认识场景**——字段集与现有单张复核一致。
- **备注聚合（零丢失规则）**：`features/acquisition/business-card-notes-aggregation.ts` 纯函数
  `aggregateBusinessCardNotes(extraction, chosen: {email, phone}): string` ——
  把未进入固定格子的全部字段按原标签逐行输出：未选中的其余邮箱/电话/传真（含办公点标签）、部门、全部地址、认证、网站、日文原名/罗马字对照（当与姓名格子不同时）、`detectedLanguages` 不输出（属元数据）。**不变量：固定格子取值 ∪ 备注内容 ⊇ 规范化抽取的全部非空字段值**，用属性测试守护。聚合结果预填「备注」输入框，用户可改。
- 失败卡：显示错误原因 + 「重试」（重新置 `pending` 交 worker）与「跳过」。
- 确认提交：扩展现有 `POST /api/contacts/business-card/confirm` 与 `ConfirmBusinessCardContactInput`，新增 `notes?: string`；`ContactDTO` 新增可选 `notes?: string`（稀疏容忍，schema 已按可选字段设计）；live 写入服务透传；联系人详情页新增「备注」展示区。查重逻辑不变：返回 `duplicate_review` 时界面提示「与现有联系人重复」，默认「跳过此卡」，可选「仍然创建」。
- item 确认成功 → 状态 `confirmed` + `confirmedContactId` + **删除该卡图片**；跳过同理删图。全部 item 落定（confirmed/skipped/failed 且用户点「完成批次」）→ 批次 `completed`、清目录。

## 明确不做（v1）

- 名片正反面合并（两张图会生成两个待确认卡，用户可跳过背面）。
- 一页多卡的 PDF/合照拆分（沿用单卡契约；多卡图仍走"取最完整一张"的既有行为）。
- 字段级合并更新现有联系人（走既有重复合并建议）。
- 批量一键全部确认（逐张确认是有意的产品决定，防止未复核数据入库）。
- 谷时定价调度（worker 即时处理；成本优化后续再说）。

## 测试要求

- 契约/存储：批次与 item 状态机、lease 认领与过期回收、500 上限拒绝、7 天过期清理（时钟注入）。
- PDF 拆页：多页 PDF fixture → N 个 item；损坏 PDF 单文件拒绝不阻断整批。
- 备注聚合：属性测试（随机字段组合断言零丢失不变量）+ 代表性快照用例。
- 确认写入：notes 透传落库、duplicate_review 分支、确认/跳过即删图（文件系统断言）。
- 页面：进度轮询状态渲染、worker 停摆提示、确认模式切换。
- 端到端：按验收标准全流程实测（含关页恢复）。
