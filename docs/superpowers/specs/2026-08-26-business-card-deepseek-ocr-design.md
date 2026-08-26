# 名片识别：DeepSeek 两阶段引擎 + HEIC 进口 设计文档

日期：2026-08-26
状态：已定稿（用户批准）
作用域：`repos/orbits`

## 背景与目标

名片识别链路（`/app/contacts/new` 名片扫描 → 云端 OCR → 逐字段复核 → 确认入库）已经完整建成，但当前唯一的 live OCR provider 是 Gemini（`features/acquisition/gemini-business-card-ocr-provider.ts`），而本环境没有 `GEMINI_API_KEY`，可用性检查返回 `ocr_provider_unconfigured`，功能整体禁用。

本设计把识别引擎切换到 DeepSeek（环境已有 `DEEPSEEK_API_KEY`，仓库已在 `https://api.deepseek.com/chat/completions` 上运行 agent），并让管线接受 iPhone 实拍的 HEIC 图片。

**用户已拍板的决定：**

1. 识别架构用**两阶段**：`deepseek-v4-flash-vision-exp` 负责读卡（忠实转录），`deepseek-v4-flash` 负责把转录文本结构化成 JSON schema。
2. **服务端支持 HEIC 转码**，产品直接接受 HEIC 上传，不只是转测试文件。
3. UI、复核流、草稿管线、确认入库、查重全部不动。

**验收标准：** 用 `docs/designs/random_meishi.heic` 和 `docs/designs/arranged_meishi.heic` 两张真实名片，端到端走通 上传 → 识别 → 复核 → 确认 → `contacts` 入库。

## 不变量（沿用现有设计，不得破坏）

- Provider 契约 `BusinessCardCloudOcrProvider`（`business-card-cloud-ocr.ts`）零改动；模型侧 MIME 白名单保持 JPEG/PNG/WebP。
- 识别结果永远是 `pending_confirmation` 草稿，`contactWriteExecuted=false`；确认前零联系人写入。
- 原图、base64、provider 原始响应不落库，只存 SHA-256 摘要。
- 复核问题由代码的确定性规则生成（`reviewIssuesForBusinessCard`），不靠模型。
- 缺密钥、超时、结构无效、provider 失败都显式报错，不回退 fixture。

## 组件 1：DeepSeek OCR provider（新文件）

`features/acquisition/deepseek-business-card-ocr-provider.ts`，导出 `createConfiguredDeepseekBusinessCardOcrProvider(options)`，签名风格与 Gemini 版一致（`env`/`fetchImplementation`/`nowMs`/`timeoutMs` 可注入）。无 `DEEPSEEK_API_KEY` 时返回 `null`。

两阶段都 POST `https://api.deepseek.com/chat/completions`（OpenAI 兼容）：

- **阶段 A · 读卡**：模型 `ORBIT_BUSINESS_CARD_OCR_VISION_MODEL` ?? `deepseek-v4-flash-vision-exp`。消息内容为图片（base64 data URL，`image_url` 格式）+ 转录提示词：只转录卡面可见文字、保留原生/罗马字姓名、办公点与电话标签、原文措辞；禁止编造。输出为纯文本转录。
- **阶段 B · 结构化**：模型 `ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL` ?? `deepseek-v4-flash`。输入为阶段 A 转录文本，`response_format: {type: "json_object"}`，提示词内嵌现有 `BUSINESS_CARD_EXTRACTION_JSON_SCHEMA`。输出 JSON 经与 Gemini 版相同的严格逐字段校验（复用/提取 `structuredExtraction` 校验逻辑为共享函数，两个 provider 共用）。

错误与超时：

- 每阶段 20s 超时（`DEFAULT_TIMEOUT_MS` 同现值，超时 → `PROVIDER_TIMEOUT`）。
- 非 2xx → `PROVIDER_REQUEST_FAILED`；阶段 A 转录为空、阶段 B JSON 解析或校验失败 → `INVALID_STRUCTURED_OUTPUT`。错误类型沿用 `BusinessCardCloudOcrProviderError`（移至共享位置或在新文件中等价定义，保持 code 集合不变）。
- usage：两次调用 input/output token 求和，`latencyMs` 为两阶段总耗时。`model` 字段报告为 `"<vision-model>+<text-model>"`，`providerName` 为 `"deepseek-chat-completions"`。

## 组件 2：接线与门禁（2 处修改）

- `features/acquisition/service-factory.ts`（现 117 行附近）：`cloudOcrProvider` 改为 **DeepSeek 优先、Gemini 兜底**——`createConfiguredDeepseekBusinessCardOcrProvider() ?? createConfiguredGeminiBusinessCardOcrProvider()`。Gemini provider 文件原样保留。
- `features/acquisition/business-card-capture-availability.ts`：`ocrProviderConfigured` 增加 `DEEPSEEK_API_KEY` 判断（优先级：DEEPSEEK > GEMINI > GOOGLE，仅影响布尔值）。

## 组件 3：HEIC 进口转码（新文件）

`features/acquisition/business-card-image-normalization.ts`：

- 定义 upload 侧接受列表 = 现有三种 + `image/heic` + `image/heif`（以及文件扩展名 `.heic/.heif` 兜底，因浏览器对 HEIC 的 `File.type` 可能为空）。
- HEIC/HEIF 输入 → 解码并转 JPEG（质量 ~90）→ 以 `image/jpeg` 进入现有管线；其余类型原样透传。SHA-256 摘要按**上传原始字节**计算，10MiB 上限也按上传原图计。
- 解码实现：优先用已有依赖 sharp（0.34.5）；**已知风险**：sharp 预编译 libvips 可能不含 HEVC 解码（专利原因），实现时用两张测试图当场验证，不行则补纯 JS 的 `heic-convert` 依赖。转码放在 scan API handler 之后、live scan service 之前的边界，provider 永远只见 JPEG/PNG/WebP。
- 前端 `business-card-capture-workspace.tsx` 的 file input `accept` 补 `.heic,.heif,image/heic,image/heif`；不改其余 UI。

## 组件 4：测试与验证

- **单测**（mock fetch，照 Gemini provider 测试风格）：
  - 新 provider：两阶段成功路径、阶段 A 空转录、阶段 B 无效 JSON、超时、非 2xx、缺 key 返回 null、model env 覆盖。
  - 工厂选择：DeepSeek 优先/Gemini 兜底/都缺时的行为。
  - availability：`DEEPSEEK_API_KEY` 使 `ocrProviderConfigured=true`。
  - HEIC 转码：HEIC→JPEG 输出、非 HEIC 透传、损坏文件报错（用小尺寸 fixture，不提交 3MB 测试原图）。
- **真实评估**：`scripts/evaluate-business-card-ocr.ts` 支持 provider 切换（DeepSeek/Gemini），成本单价常量参数化（现值为 Gemini 定价），对两张 HEIC 测试卡跑真实识别，输出脱敏评估记录供人工核对识别质量。
- **端到端**：live 模式 dev server，浏览器实走 上传 → 识别 → 复核 → 确认 → `contacts` 入库 + 查重；对照既有测试失败基线，不引入新失败。
- **流程**：每个被改符号先跑 GitNexus `impact`，提交前 `detect_changes()`。

## 明确不做

- 不改复核规则、草稿契约、确认写入、查重逻辑。
- 不做批量识别、离线识别、名片正反面合并。
- 不存原图（包括转码后的 JPEG）。
- 不删除 Gemini provider。
