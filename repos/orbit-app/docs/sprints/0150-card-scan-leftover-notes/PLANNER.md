# Sprint 0150 — 名片上没归类的有用信息放进备注

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态以[登记表](../README.md#sprint-登记表)为准。
**原需求:** 用户 2026-11-02 需求 5；协调者自主决定。
**单一目标:** 识别结果中未归类的有意义文字进入联系人草稿备注。
**基线:** 0149 合入后的 `chat-agent`。

## 已确认的事实

- 服务器 `features/acquisition/business-card-ingest-v2/worker.ts:197-222`；DeepSeek 两步（先转写全文、再结构化），Gemini 一步；结构见 `shared/contract/business-card-batch.ts:16-38`。
- 转写全文只用于提示核对问题（`worker.ts:220`），不保存；结构外的文字丢失。
- 结构化附加信息已合并进备注：App `src/view-models/business-card-batch.ts:35-51,86`，服务器 `features/acquisition/business-card-notes-aggregation.ts`；核对页备注可编辑（`ScanBatchScreen.tsx:1086`）。

## 决定（协调者）

- 结构里加可选 `otherText: string[]`：两个识别提供方都要求模型把不属于任何栏位、但有意义的文字放进这里（提示词与 JSON schema 同步改）；DeepSeek 另外用转写全文做兜底：去掉已归入栏位的内容后剩下的行。
- 确定性过滤写在代码里：去掉与已识别字段重复（规范化后包含关系）、过短（少于 2 个有效字符）、纯数字/符号的行；最多保留 10 行、每行 200 字。
- 存进识别结果；备注合并时追加「名片上的其他信息」一段，正反面去重。旧数据没有该字段时行为不变。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0150-01 | 识别结果带 otherText 时进入备注；与已识别字段重复、无意义碎片被过滤 | 服务器测试（替身提供方） |
| SC-0150-02 | 正反面合并去重；旧数据不受影响 | App 与服务器测试 |
| SC-0150-03 | 两端全量与类型检查无新增失败 | 命令与计数 |
