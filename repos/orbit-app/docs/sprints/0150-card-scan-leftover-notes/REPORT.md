# Sprint 0150 报告 — 名片上没归类的有用信息放进备注

## 1. 结论

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 识别结果带 otherText 时进入备注；重复字段、无意义碎片被过滤 | 通过 | 服务器过滤、两个提供方解析、worker 入库到草稿备注的测试（第 3 节） |
| 02 正反面合并去重；旧数据不受影响 | 通过 | App 与服务器（Web 核对页）备注测试 |
| 03 两端全量与类型检查无新增失败 | 通过 | 第 4 节 |

提交：`ae4a5d916`（服务器 + 契约/API Schema 及 App 副本），`3135ced15`（App 备注）。

## 2. 改了什么

服务器（repos/orbits）：
- 新文件 `features/acquisition/business-card-other-text.ts`：
  - 两个提供方共用的提示语 `BUSINESS_CARD_OTHER_TEXT_INSTRUCTION`：把不属于任何栏位、但有意义的印刷行（口号、业务范围、服务列表、资格说明等）原样放进 otherText，不重复已填栏位，不放标签、页码、装饰符号、单独的数字。
  - `filterBusinessCardOtherText`：确定性过滤。比较前统一全半角、大小写，去掉空白和标点符号（电话因此只剩数字）。规则：被某个已识别字段包含的行去掉；去掉其中所有已识别字段和栏目标签（TEL、FAX、E-mail、www、手机、携帯、代表 等，加上名片自己印的标签）后剩不到 2 个文字的行去掉；有效字符少于 2 个、或一个文字都没有（纯数字/符号、页码）的行去掉；规范化后相同的只留第一条；最多 10 行，每行截到 200 字。行首的「■・●-」等项目符号和 markdown 的 `**` 去掉。
  - `businessCardTranscriptLines`：把转写全文拆成候选行。
- `business-card-cloud-ocr.ts`：类型加可选 `otherText`；`normalizeBusinessCardExtraction` 结束时再过滤一次，没有内容就不带这个键（旧数据输出完全不变）。
- `business-card-ocr-validation.ts`：JSON schema 加 `otherText`（字符串数组，列入 required）；解析时格式不对只丢掉这一栏，不让整张名片失败；同样过滤后为空就不带键。
- `deepseek-business-card-ocr-provider.ts`：结构化提示语加上面那句；模型没给出可用的 otherText 时，用转写全文兜底（同一套过滤，去掉已归入栏位的行）。
- `gemini-business-card-ocr-provider.ts`：提示语加上面那句，schema 随共享 schema 一起变。
- `shared/contract/business-card-batch.ts`、`shared/api-schema/business-card-batch.ts`：加可选 `otherText`，API Schema 里格式不对只丢这一栏。App 两份副本逐字相同。
- 存储：识别结果本来就整段以 JSON 存在 `bc_ingest_items.extraction`，`otherText` 跟着存进去，没有数据库迁移；读出时 repository 原样保留这个键。提取结构版本号保持 3（字段可选，旧行照常读）。
- `business-card-notes-aggregation.ts`：`aggregateBusinessCardNotes` 在原备注后面追加「名片上的其他信息」一段；新导出 `businessCardOtherTextSection`，多面合并（正面在前）、规范化去重，已经出现在备注里的行不重复。
- Web 核对页 `app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model.ts` `notesForCard`：各面备注照旧按「正面 · 文件名」分段写，但 otherText 不按面写，而是正反面合并成最后一段「名片上的其他信息」，同时排除已在各面备注和邮箱/电话/地址固定栏里的行。

App（repos/orbit-app）：
- `src/view-models/business-card-batch.ts`：单面 `businessCardReviewFields` 和正反面合并 `reconcileBusinessCardReviewCard` 都在备注末尾追加这一段；正反面合并、规范化去重，已在备注或姓名/公司/职位/邮箱/电话栏里的行不重复。核对页备注本来就可编辑，用户能删改。
- 标题文案放进词典 `businessCard.otherTextHeading`（中「名片上的其他信息」、日「名刺に記載のその他の情報」、英「Other text on the card」）。App 规定新代码不能写死文字（no-hardcoded-copy 测试，允许名单只能减不能加），所以按当前语言取词典。

## 3. 测试

新增或扩展（都用测试替身，不调用真实接口）：
- `tests/capabilities/business-card-other-text.test.ts`（5 条）：日文名片（口号、服务列表保留；公司、部门职位、姓名、罗马字、带标签的电话/传真（含全角）、邮箱、网址、地址片段、邮编、已识别的资格都去掉）；中文名片（资格、业务范围、口号保留；页码「1/2」「- 2 -」「P.3」、符号、纯数字、单字母、已识别手机和地址去掉）；全角去重、10 行 × 200 字上限；转写拆行；解析与规范化过滤、旧数据不带键、格式不对只丢这一栏。
- `deepseek-business-card-ocr-provider.test.ts`（+3）：提示语和 schema 里有 otherText、模型给的被过滤；模型没给时用转写全文兜底；转写全部已归入栏位时不带键。
- `business-card-cloud-ocr.test.ts`（+1）：Gemini 提示语、schema（含 required）有 otherText，返回值被过滤。
- `business-card-notes-aggregation.test.ts`（+1）、`tests/pages/ingest-v2-route-view-model.test.ts`（+1）：服务器备注追加、正反面合并去重、旧数据不变。
- `business-card-ingest-v2-worker.test.ts`（+1，真实 Postgres）：存图并上传 → 定稿 → 假识别返回带重复和碎片的 otherText → worker 跑一轮 → 数据库里存的是过滤后的两行 → getBatch 读回 → Web 草稿备注以「名片上的其他信息」结尾。
- App `tests/business-card-two-sided-view-model.test.ts`（+2）：正反面合并去重并排除已在栏位里的邮箱；单面追加；旧数据备注不变；API Schema 保留/丢弃 otherText。

过滤模块是先写好的，接入前先跑了解析测试确认失败（解析结果里没有 otherText），再接入；App 合并测试也是先失败再实现。

## 4. 全量

- orbits 类型检查：通过。
- orbits 全量（`npm test`，en_US）：8080 条，通过 6956，失败 22，跳过 1102。22 条与基线已知失败同名同类（/app/agent 页面、联系人页与引导读取、Web 消息、通知、AI 额度、manifest/运行证据、非 .btn 按钮计数、契约快照、周视图基线），没有新增。
- 名片相关测试连本地临时库（`orbit_test_s0150`，跑完已删）：worker、repository、v2 路由、全部 business-card-*、deepseek、Web 核对页、completion-runtime，258 条全过。
- App 类型检查：通过。
- App 全量：3450 条，通过 3445，失败 3，跳过 2。3 条是已知的 api-schema-sync（calendar-external-events、event-discover、network-analysis-view）、contract-sync、route-parity，与名片无关。名片两份副本与服务器逐字相同。

## 5. 判断与说明

- DeepSeek 兜底只在模型没给出可用 otherText 时启用，而不是总把转写全文并进来：转写里可能有模型的开场白或重复行，这样噪声少。
- 去重用「去掉已识别字段和栏目标签后剩不到 2 个文字」而不是只看包含关系：像「TEL(本社) 03-…」这种带标签的行能去掉，而「架空不動産株式会社は…」这种含公司名的口号仍会保留。
- Web 核对页的备注标签本来就是写死的中文，所以服务器标题也用中文；App 按语言取词典，中文与服务器一致，日文/英文界面显示对应译文。
- 契约快照测试（contract-snapshot）在基线上就报「快照未更新」，属已知失败；没有执行 `--write`，避免把别人的契约改动一起写进快照。
- 没有改登记表。

## 6. 没验证的

- 没有调用真实 DeepSeek/Gemini，模型是否会按提示语填 otherText、填得好不好，只能上线后看真实名片。
- 没有做手机上或网页上的截图验证；备注区域本身没改，只是内容多了一段。
