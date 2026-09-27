# Sprint W0013 — 执行总结

## 目标实现情况

- 本轮要实现：批量扫名片时，AI 在现有识别调用里顺便给出一级／二级行业；审阅页可改；确认后写入联系人。
- 已验证能做到：
  - DeepSeek（两段式的文本整理步骤）与 Gemini（单次调用）都输出行业；只接受行业分类内、一二级匹配的 id，分类外／不匹配／判断不出时为 null，其他字段不受影响；调用次数不变（DeepSeek 2 次、Gemini 1 次）（SC-01、SC-02）。
  - 提取结构版本 1 → 2；旧 JSON 没有行业字段时读成 null，旧批次照常打开和确认（SC-02）。
  - 审阅页新增「行业」一行（一级 › 二级，两个下拉，标「已识别／已修改／未识别到」），可改可清空；**正反面给出不同行业时不预选，标「请核对」**，给出两个候选和「都不对，留空」，并挡住自动导入与「完全一致自动并入」两条路径（SC-03，Codex review 后补）。
  - 在行业下拉、选项、组合框里按回车不再触发「确认整张名片」（Codex review 后补）。
  - 确认新建联系人写入行业；合并到已有联系人只补空字段、不覆盖；一二级不匹配的请求返回 400（SC-04）。
  - App 端契约已同步（`npm run sync:contract`），App 类型检查与全量测试无新增失败（SC-05 跨端部分）。
- 仍未实现或未验证：
  - **真实名片识别没有跑**：仓库里唯一的图片是 96×64 的测试夹具 `business-card-tiny.heic`，不是真名片；没有可用的真实样本，也不应擅自用用户上传过的名片。
  - **token 成本只有估算**：行业说明约 1325 字符，估计每张名片 input 增加约 500–560 token（按本地库已记录的 31 次真实识别平均 input 1136 token 计，约 +45–50%），output 约 +20 token。下一批真实识别后可用 `select usage from bc_ingest_items where extraction_schema_version = 2` 核实。
  - 审阅页的真实浏览器检查没做（需要一批真实上传的名片）。
  - 用户手动点「照原样确认」时，冲突的行业以 null 提交（不写行业），不额外拦截。

## 运行记录

- 原需求：RW-11（补行业部分）；决定 D5
- 结果：completed（真实识别与审阅页浏览器检查缺样本，见上）
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 分支：`sprint/W0013-card-industry`；Web 功能 SHA `04fb477e`；App 同步 SHA `f15a6870`
- push：未执行

## 改了什么

| 功能 | 文件 |
| --- | --- |
| 行业分类提示块（从 `shared/domain/industries.ts` 生成） | `features/acquisition/business-card-industry-prompt.ts`（新） |
| 两条 provider 与解析校验 | `deepseek-business-card-ocr-provider.ts`、Gemini provider、`business-card-ocr-validation.ts`、`business-card-cloud-ocr.ts` |
| 共享契约与运行时 schema | `shared/contract/business-card-batch.ts`、`shared/api-schema/business-card-batch.ts`、`shared/domain/industries.ts`（`sanitizeIndustryPair`） |
| 版本与旧数据兼容 | `business-card-ingest-v2/contract.ts`（版本 2）、`repository.ts`（`mapItem` 补 null） |
| 确认写入 | `contact-write-contract.ts`、`live-contact-write-service.ts`、`business-card-contact-match.ts`、v2 `handlers.ts` |
| 审阅页 | `ingest-v2-route-view-model.ts`、`card-batch-ui.tsx`、`card-batch-model.ts`、`use-card-batch.ts`、`card-batch-styles.ts` |
| App 契约同步（协调者） | `repos/orbit-app/src/api/contract/business-card-batch.ts`、`src/api/domain/industries.ts`、`src/api/schema/business-card-batch.ts`；`src/view-models/business-card-batch.ts` 收窄冲突字段类型 |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0013-01 | pass | `tests/capabilities/business-card-industry-extraction.test.ts`（两条 provider × 合法／分类外／二级不属于一级／缺失） |
| SC-W0013-02 | pass | 同文件的请求次数断言；`tests/api/business-card-ingest-v2-routes.test.ts` 的 v1 卡回读与确认（本地库，未 skip） |
| SC-W0013-03 | pass | `ingest-v2-route-view-model.test.ts`、`app-card-batch-industry-field.test.tsx`（含冲突与回车）、`app-card-batch-model.test.ts` |
| SC-W0013-04 | pass | `business-card-contact-write.test.ts`、`business-card-contact-match.test.ts`、路由数据库用例（新建、合并已有／空、v1 合并、不匹配 400） |
| SC-W0013-05 | 部分 | Web 定向集 269 条 268 pass（唯一失败 `business-card-batch-schema.test.ts` 写死了另一台机器的库地址，环境问题）；`tsc` 0；Web 全量 5210 条 42 失败，与上一基线**新增 0**；App 同步后 `typecheck` 仅剩同步前已有的 `render.tsx` 1 条，App 全量 82 → 80 失败、新增 1 条经单独连跑 3 次 19/19 通过判为不稳定；**真实 3 张名片未跑（无样本）** |

## App 端同步说明

- 这次同步同时带过去了更早 Web 提交 `c9f465ca`（名片地址字段）的契约改动，App 当时没同步；因此 App 的两处类型用法需要收窄为「两边都有的字段」（`BusinessCardConflictField`），不改运行行为。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| SC-05 门禁未满足 | 采纳为合并门禁 | 协调者完成 App 同步与 App 测试、Web 全量对照；真实识别缺样本如实记录 |
| 正反面不同行业被静默选用并可能自动入库 | 采纳 | 冲突不预选、标「请核对」，挡住自动导入与自动并入 |
| 行业下拉按回车触发确认 | 采纳 | 回车快捷键跳过 select／option／combobox／listbox |

## GitNexus

- staged detect-changes：26 文件、67 符号、565 流程，**risk critical**（共享契约与识别入口扇出）；Web 与 App 全量对照新增失败均为 0。

- LOW：`parseBusinessCardStructuredExtraction`、`businessCardStructuringPrompt`、`buildConfirmationPayload`；MEDIUM：`mapItem`。
- CRITICAL：`normalizeBusinessCardExtraction`、两个 provider 工厂（来自 Next 路由扇出；直接调用方 1–5 个，签名与既有输出字段不变，只新增可选字段）。
- UNKNOWN（索引缺失）：`initialCardDraft`、`reconcileCardDraft`、`mergeCardIntoContact` 等，已用 grep 补查调用方。

## 交接

- 给 W0010：联系人行业字段在识别时即可补上；规则层可直接使用。
- 费用：0 次真实付费调用（样本缺失）。
- 建议：若 input 增加 45–50% 不可接受，可把行业分类块再压缩（例如只列一级、二级由第二步补全）——需要用户决定。
