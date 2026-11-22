**结论：主要问题是“正确性契约和校验闭环没有建立”，再叠加一次生成承担过多职责。继续修改提示词、放宽规则并跑整轮，既难收敛，也可能把错误内容判为成功。**

第 5 轮只能证明“通过了当时的自动检查”。那一轮放宽过姓名繁简变体，也没有记录人工核验三语语义，因此不能视为满足全部硬要求的基准。

本次未改文件、未读取禁区或原始失败输出、未调用付费模型。我用允许源码及虚构模型回复做了纯内存复现，确认了下述多项漏判和误判。行号对应当前工作区。

**1．架构根因是：程序没有牢牢持有事实、身份和业务约束，却试图用格式及字符检查证明内容正确。**

现有的任务持久化、lease、局部重试和完整生成后发布的门禁，方向正确。问题主要集中在它们内部的生成与验收过程。

- 选人、排序、解释、三语表达及引用混在一起，一处错误就重做较大单元。
- “schema 合格”“语言字符合格”“事实正确”“属于正确的人”“三语等义”没有明确分层。
- 修复会修改内容，却没有重新验证全部约束。
- 校准主要观察校验器是否满意，尚未建立独立的业务正确性标准。

当前 70 人至少需要 **35 次推荐＋35 次分组特征＋24 次桌内容＝94 次模型调用**，尚未计入修复和重试。仅作数学示意：假设每次独立首过率为 99%，整场全部首过也只有 `0.99^94≈38.9%`。实际错误还可能相关，不能靠同样请求重发三次消除规则性错误。

以下是优先级最高的代码发现。

**① 内容可以挂错人，三语也可以指向不同的人——已复现。**

推荐阶段把整批所有 source 和候选人放进同一个占位符映射；填充时只检查 key 是否存在，没有检查它是否属于当前推荐关系。[ai-provider.ts:1306](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1306)、[ai-provider.ts:711](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:711)

例如当前条目选中 `S1C1`，日中理由引用 `{S1C1}`，英文引用 `{S1C2}`，代码仍返回成功。类似地，`{M1}` 配上 `{M2:company}`，可以组成错误的任职关系，两个占位符却都合法。

逐句 `{ja,zh,en}` 只锁住了条数和位置，不能锁住人物、事实、否定、数值或合作方向。现有测试也明确接受了“中文寻找医疗合作方，英文寻找融资伙伴”的修复结果。[event-operations-trilingual.test.ts:95](/Users/li/work/orbit/repos/orbits/tests/capabilities/event-operations-trilingual.test.ts:95)

**② 修复不是保持原意的可靠变换；修复后存在校验漏洞——已复现。**

当前顺序是：

`填名 → 检查中文改名 → 修复日英 → 拆分 → 最后修复中文 → 合并`

最后一次中文修复完成后，没有重新检查姓名、占位符和三语语义一致性。[ai-provider.ts:1358](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1358)、[ai-provider.ts:1373](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1373)

具体问题：

- 中文修复的 `sameShape` 没有比较 `score`；改分数也能通过。[ai-provider.ts:1390](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1390)
- 中文修复可以重新把原名改成简体、留下 `{S1C1}`，仍被接受。
- 日英修复后只重复语言检查，没再次检查未解析占位符。英文修复返回 `Meet {S1C1} about funding.`，代码返回成功。[ai-provider.ts:1292](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1292)
- 桌内容的中文修复主要比较成员和桌号，同样没有事实及跨语义复验。[ai-provider.ts:1489](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1489)

提示词中的“保留数字、不要改变事实”没有对应的程序保证。

**③ 推荐去重不会凭空创造新人，但会把不足 4 人的结果放行——已复现。**

当前先去重、保留第一次，再重排名次。[ai-provider.ts:1343](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1343)

可是提示词要求的是“**至多** 4 人”，领域校验也只拒绝“超过 4 人”，不拒绝不足 4 人。[ai-provider.ts:1322](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1322)、[recommendation-validation.ts:66](/Users/li/work/orbit/repos/orbits/features/events/event-operations/recommendation-validation.ts:66)

我复现了：候选人足够时，输出 `[A,B,C,C]`，最后只剩 3 人，provider 和领域校验都通过。

因此，记录中的“不编造任何内容”只说明没有增加新人，不能说明满足原业务契约。若要求恰好 4 人，重复应导致该选人单元失败，不能通过删除重复项降低交付数量。

另外，这段去重发生在结构检查之前；数组包含 `null` 时会直接访问 `item.targetCandidateKey` 抛异常，绕开原本的结构诊断。[ai-provider.ts:1348](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1348)

**④ 语言及姓名校验同时存在误判和漏判。**

| 规则 | 问题与证据 |
|---|---|
| 日文长度≥8、没有假名就失败 | 合法标题“医療業界資金調達”被拒绝，已复现；短中文、短英文又可能通过。[ai-provider.ts:766](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:766) |
| 中文 Latin 白名单＋大写缩写 | `HELLO WORLD` 整句英文被接受；`資金調達について話しましょう。` 整句日文也被接受；合理术语 `iPS` 被拒绝，均已复现。[ai-provider.ts:434](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:434)、[ai-provider.ts:480](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:480) |
| 英文删除已知专名后查汉字/假名 | 不能发现罗马字化姓名、Latin 公司名缩写，以及其他使用 Latin 字母的语言。罗马字化放行已复现。[ai-provider.ts:771](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:771) |
| “改名”检查 | 仅寻找≥3 字、恰好一处汉字替换的近似字符串。两字名、截名、空格变化、多个字变化、假名变化等不能完整覆盖；也会误伤普通词句。[ai-provider.ts:737](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:737) |

最后一种误判的复现是：公司登记为“未来科技”，正文“欢迎讨论未来科学。”被判定为改写公司名。

这些规则适合提供诊断信号，不适合作为语言和实体正确性的证明。

**⑤ “模型看不到姓名、公司名”在当前实现中不成立。**

`omitNames` 只删除了 `displayName`，保留了 `company`，也没有处理自由文本中的名字；桌内容同样保留公司字段。日英修复还会直接获得完整专名列表。[ai-provider.ts:1044](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1044)、[ai-provider.ts:1411](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1411)、[ai-provider.ts:1275](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1275)

而且代码没有强制“专名只能来自占位符”。模型直接输出名字、缩写或罗马字，仍可能通过。

占位符替换本身能原样取得登记字段，但不能证明模型引用了正确的人，也不能阻止正文另写一个名字。

**⑥ 重试、并发与记录中的判断存在差距。**

- “三语校验失败一律可重试”不准确。provider 返回的部分失败可重试，但引擎自己的 schema 异常默认不可重试，例如桌号错误、座位重复。[engine.ts:798](/Users/li/work/orbit/repos/orbits/features/events/event-operations/engine.ts:798)、[engine.ts:1123](/Users/li/work/orbit/repos/orbits/features/events/event-operations/engine.ts:1123)
- 一次 task attempt 内可包含生成、日英修复、中文修复三个 HTTP 请求。“最多尝试三次”不等于最多调用三次模型。
- 若校准脚本复用当前引擎，配置并发 40 仍会被钳到 **32**，不能据此认定 35 个推荐任务同时发出。[engine.ts:1607](/Users/li/work/orbit/repos/orbits/features/events/event-operations/engine.ts:1607)
- 日英修复请求自身失败时，没有合并首次生成的 usage，失败成本统计可能缺失。[ai-provider.ts:1278](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1278)

**⑦ 还有两项影响业务准确性的设计缺口。**

首先，候选检索靠原文 token 精确交集，4 人推荐只保留约 16 人候选。“資金調達／融资／fundraising”不会自然对齐，优秀候选可能在模型判断之前就被排除。这是召回风险，不能断言它导致了本次格式失败。[candidate-retrieval.ts:9](/Users/li/work/orbit/repos/orbits/features/events/event-operations/candidate-retrieval.ts:9)、[candidate-retrieval.ts:126](/Users/li/work/orbit/repos/orbits/features/events/event-operations/candidate-retrieval.ts:126)

其次，输入虽然有 `evidenceIds`，模型使用的 compact profile 没有携带它们；目前没有逐项事实归属和理由证据链。[contract.ts:32](/Users/li/work/orbit/repos/orbits/features/events/event-operations/contract.ts:32)、[ai-provider.ts:1011](/Users/li/work/orbit/repos/orbits/features/events/event-operations/ai-provider.ts:1011)

关于 **fallback**，需要准确区分：

- 未发现生成失败后直接拿中文替换日英的实现；有限模型修复本身也不等于 fallback。
- 去重后不足 4 人仍成功，属于业务契约降级。
- 读取层确实在缺少 `i18n` 时返回原字段，这是旧结果兼容逻辑；发布门禁没有显式要求新三语版本必须完整。[text-language.ts:22](/Users/li/work/orbit/repos/orbits/features/events/event-operations/text-language.ts:22)、[engine.ts:1529](/Users/li/work/orbit/repos/orbits/features/events/event-operations/engine.ts:1529)

后者是防线缺口，不能据此断言本次校准实际发生了语言 fallback。

对照记录第 5 节，作者的判断可以这样修正：

| 原判断 | 审阅意见 |
|---|---|
| 逐句配对、短键、成员行有效 | 正确，降低了结构复杂度；“样本中未再出现”应与“已经消除”区分。 |
| 一次输出承担太多 | 正确；还遗漏了事实依据、内容归属和修复后的完整复验。 |
| 翻译要求＋一次修复消除了英文混入 | 过强。字符检查不能证明英文或译意正确，修复还可能引入新错误。 |
| 占位符消除了名字问题 | 不完整，存在上述暴露专名、错指人物及绕过占位符的问题。 |
| 校验规则没用真实数据校准 | 正确，但需要独立人工标签，不能仅根据失败样本扩大白名单。 |
| 拆翻译只增加约10–20秒 | 尚无数据支持；还受调用数、排队、输出长度和重试影响。 |
| DeepSeek 没有严格 schema | 对当前适配器成立，不能概括为厂商当前没有该能力。 |

最后一点需要更新：本次查阅的官方文档已列出 **Responses `json_schema`** 和 **Beta strict function calling**。但你们当前适配器确实只发送 `json_object`；换成 OpenAI/Gemini 分支也不会自动开启严格 schema。[DeepSeek Responses 文档](https://api-docs.deepseek.com/api/create-response/)、[strict 工具调用文档](https://api-docs.deepseek.com/guides/tool_calls/)、[gemini-provider.ts:1199](/Users/li/work/orbit/repos/orbits/features/orbit-ai/gemini-provider.ts:1199)

**2．通行做法是把可确定验证的约束交给程序，把开放语义问题交给经过评测的模型与人工标准。**

有官方工程指导支持、较通行的做法包括：

- 使用真正的结构约束，并继续做客户端业务校验；普通 function calling 不自动等于 strict。
- 只让模型输出未知内容，程序持有 ID、数量、座位、已知数字和实体绑定。
- 输出小而扁平，限制理由条数和篇幅，减少重复字段及不必要的生成。
- 使用真实任务分布的评测集，覆盖边缘情况，用人工标注校准自动评分。
- 按整体耗时衡量性能，减少输出、并行独立工作，并记录重试成本。[OpenAI 延迟优化指导](https://developers.openai.com/api/docs/guides/latency-optimization.md)、[评测最佳实践](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

**严格 schema 不能保证语义正确。** 官方文档也明确要求处理符合 schema 但语义错误的输出；部分约束仍需应用代码检查。[Gemini Structured Outputs](https://aistudio.google.com/docs/structured-output)、[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

对这个产品，我推荐“单语基稿→翻译”，这是结合当前证据的工程判断，不是所有成熟产品统一遵循的标准。它的价值是：三语共享一个不可变的内容版本，翻译步骤不能重新选人、改事实或调整推荐关系。

语义校验应使用明确的判定任务：事实是否受资料支持、需求/供给是否写反、人物是否对应、数字和否定是否保留、译文是否新增或遗漏。独立 LLM 审核可以承担在线检查；双语人员负责离线标准和抽检。回译、相似度或同模型自评，单独使用都不足以证明等义。

如果实际接口确实不支持结构约束，小 JSON、程序校验、有界局部重生可以降低失败率，但不能伪装成严格解码。

**3．推荐采用一个目标方案：身份与事实由程序持有，Flash 分阶段生成和翻译，Pro 独立审核，最后完整发布。**

暂不建议仅凭这份记录更换生成底模。先改接入方式和职责划分；翻译继续用 Flash，审核使用独立的 Pro 调用。日志尚未证明 Flash 的日英翻译能力不够，也没有证明另一厂商在这个任务上更好。

目标接口选 DeepSeek Responses 的 `json_schema`，先通过小型能力探针。当前 adapter 需要相应适配，不能只改 endpoint。

**第一步：程序冻结快照、身份表和事实锚点。**

```json
{
  "people": [
    {"key":"P1","facts":[{"id":"F1","field":"needs[0]","raw":"資金調達"}]}
  ],
  "entities": {
    "P1":{"name":"登记原名","company":"登记公司名"}
  }
}
```

`entities` 由程序保管；模型获得业务事实及其 owner。自由文本中的可识别专名也需要实体化处理。这里不允许补资料、猜公司或造名字。

**第二步：模型只做推荐判断，输出目标及证据。**

```json
{
  "edges":[
    {"from":"P1","to":"P9","kind":"need_offer","evidence":["F1","F9"]}
  ],
  "features":[
    {"person":"P1","topics":["fundraising"],"affinity":["P9"]}
  ]
}
```

每人恰好 4 个不同目标；程序检查候选范围、自荐、重复、事实 owner、语言可交流等约束。排序位置由程序生成 rank。证据引用存在，并不代表推理正确，后续仍要审核。

分组特征从这里取得，避免再把完整三语推荐送入模型抽一次特征。

**第三步：生成中文基稿并审核，冻结后由程序分桌、生成桌稿。**

```json
{
  "texts":[
    {
      "id":"R1.reason",
      "text":"{self}希望融资，{peer}提供融资顾问服务。",
      "evidence":["F1","F9"]
    }
  ]
}
```

`self/peer` 绑定当前已经确定的关系，不允许引用整批任意人员。桌稿也使用有作用域的成员引用。桌号、成员和座位由程序生成。

Pro 检查推荐判断、事实归属和中文基稿。全部推荐判断通过后，程序确定两轮分桌；桌稿接受同样的事实审核。每条推荐先固定为一句理由、两个问题、一个提示，控制篇幅。

**第四步：只翻译冻结文本，日英分别并行。**

```json
{
  "lang":"en",
  "texts":[
    {"id":"R1.reason","text":"{self} seeks funding, and {peer} offers fundraising advice."}
  ]
}
```

翻译不返回目标、rank、score、成员或座位。程序检查文本 ID 集合、占位符及数值；每条译文必须对应同一基稿版本。

**第五步：独立检查三语等义。**

```json
{
  "issues":[
    {"id":"R1.reason","code":"MEANING_CHANGED"}
  ]
}
```

Pro 对照基稿检查日英译文，返回具体条目和错误类型；无法判断也不放行。修复仅重生失败文本，随后重新检查。基稿改变必须使旧译文失效，不能继续拼接。

**第六步：程序填实体、检查整场契约，再原子发布。**

专名占位符到最后才解析，保留实体来源，而非先填名再用字符串删除猜测哪些是专名。最终检查：

- 70 人，每人恰好 4 个不同推荐；
- 两轮成员覆盖、桌容量和座位正确；
- 所有文本三语齐全，使用相同版本；
- 没有未解析占位符；
- 全部业务校验与语义审核通过。

“英文无中日文”应明确为**普通正文无中日文残留，登记专名按原样显示**，否则与汉字姓名原样的要求直接冲突。

失败处理统一为：网络暂时失败按退避和抖动重试；内容失败局部重生；配置/schema 不支持直接失败；达到整场时间、费用或调用预算则不发布。不得补人、减少数量、拿其他语言替代，或复用不同快照的产物。

70 人按每批 6 人估算：

| 工作 | 基线调用数 |
|---|---:|
| 推荐判断 | 12 |
| 中文推荐稿＋24份桌稿 | 36 |
| 中文及判断审核 | 36 |
| 日英翻译 | 72 |
| 译意审核 | 36 |
| **合计** | **192** |

其中约 120 次 Flash、72 次 Pro。调用数增加，换来职责收缩与明确的验收；不能仅凭拆分就断言更快。

容量预算可先按以下假设测量：

- 有效并发 16–24、输出受控、排队很少时，无重试约 **90–180 秒**；这不是已经验证的 SLA。
- 假设 Flash 输入 0.3–0.8M、输出 0.14–0.25M token；Pro 输入 0.3–0.6M、输出 0.01–0.025M，按官方峰时无缓存价格，约 **$0.7–$1.5/场**，可先以 $2 为测量预算。[DeepSeek 定价](https://api-docs.deepseek.com/quick_start/pricing/)
- 每单元最多三次尝试，同时限制整场额外调用数，例如 20 次；预算耗尽就失败，不能无限修复。

“一次性”应落实为一次用户操作、内部流水线完成、一次完整发布。自由生成加模型审核无法数学保证永远零错；它能严格保证结构化实体槽位和程序约束，并把语义错误风险控制在经过验证的水平。如果要求任何开放文案都绝对零错，则必须收缩到经审核的受控表达或引入人工批准。

**4．最先做这三件事，收益最高。**

1. **先建立离线回放和独立标签。**  
   由数据持有人把已存失败输出脱敏，形成明确允许使用的夹具；同时收集合格输出，标记“真实错误／校验误判／无法判断”。本次没有读取这些文件。先零模型费用回放，确认校验器不会把错人、改名、语义改变、缺人、修复残留占位符放行。

2. **先修正确性契约及最终复验。**  
   明确恰好 4 人、实体作用域、修复可改字段、不可变数字、三语版本和新发布必须完整。把上述已复现漏洞变为负例，尤其要改掉目前接受医疗合作方与融资伙伴不一致的测试。

3. **用小样本验证新接口和拆分流程，再跑整场。**  
   先做结构化能力探针，再用例如 12 人、两轮分桌的小样本，对照当前流程测准确率、误拒率、修复率、token 和耗时。保留未参与调参的样本；通过后才扩大到 70 人。

回归集至少覆盖姓名空格、繁简、假名、罗马字、缺公司、专业缩写、跨语言资料、需求供给颠倒、数字/否定变化、重复候选、错误人物引用和修复后的二次破坏。

通过率要按**整场业务正确**统计，同时报告首过率、有限重试后成功率和误放率。建议门槛是已知严重错误零放行、代表性评测中有限预算整场成功率达到目标，并报告样本量和置信区间。作为尺度参考，约 300 个独立整场样本零失败，才足以在约 95% 置信水平把失败率上界压到 1%；同一名单反复调参通过一次没有这种证明力。

可观测性应补齐每次 HTTP 调用的阶段、attempt、实际模型版本、schema/prompt 版本、usage、延迟、错误字段 ID，以及修复前后的不变量差异。并发需要跨活动、跨 worker 限制；当前生产默认是每场 16、同时两场，不能把单场配置当作全局限流。[cloud-worker.ts:280](/Users/li/work/orbit/repos/orbits/features/events/event-operations/cloud-worker.ts:280)

**5．以下事项仍需实测，不能从现有材料下结论。**

- 原始失败输出未读取，因此不能独立验证各轮失败归因，也不能确定表内调用数是否包含修复 HTTP 请求。
- 本机校准脚本未审阅。90 秒在 cloud worker 中明确传入；无参数创建 configured provider 时，adapter 默认是 20 秒。实际校准使用哪个值无法确认。[gemini-provider.ts:270](/Users/li/work/orbit/repos/orbits/features/orbit-ai/gemini-provider.ts:270)
- 官方结构化接口对实际账号、模型和所需 schema 的支持，需要探针确认，不能把文档声明当作已完成接入验证。
- 官方目前说明旧 `deepseek-v4-flash` 名称已路由至 V4.1 Flash；代码却记录配置模型名，不能据此确认实跑版本。[官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/)、[gemini-provider.ts:1453](/Users/li/work/orbit/repos/orbits/features/orbit-ai/gemini-provider.ts:1453)
- Flash 翻译质量、Pro 审核的误放与误拒、跨模型错误相关性，以及候选检索的跨语言召回率，都需要人工标注集验证。
- 192 次短调用的实际耗时、生产排队及 P95 未知；原校准使用内存存储，不能直接代表生产性能。
- 本次确认了引擎层发布门禁，未验证数据库事务实现及白名单之外的跨端展示链路。