# W3 本人目标与公开活动匹配：服务层交付记录

日期：2026-09-17。基线 `23646028281f14b2e528e6aa5082ca0d47a351fc`；主任务已接收 R 领域交付，并在其集成 HEAD `66087fff853f0133cbf1f996e39b1e03bd23bb7c` 独立复验84/84、完整typecheck及关系图门禁。

状态：初版69c9adcc完成域内113项测试，但主任务独立review发现混排大小写漏匹配，初版未获主验；下方记录新增量修复及域内复验，仍待主任务独立验收。原 Luna max 编码、Astra父代理复核。仅服务层；首页、Agent UI及其他W5页面没有接线，不把服务测试称为真实首页推荐完成。

## 冻结范围与事实边界

按 `RECOMMENDATION-DESIGN.md`：既有 `event-recommendation-tool.ts` 只新增纯词法匹配导出，不改原入口函数体、默认行为、owned合并、直接查询或closestAvailable。新增 `public-goal-recommendations.ts`、`public-goal-recommendations-runtime.ts` 和对应两个 services 测试。没有API/shared契约/schema、profile后端、存储或UI修改。

已确认profile owner为 canonical accountId，runtime显式选择既有live profile实现，只取本人 relationshipGoal。公开发布权威来自既有canonical catalogue，publicCode单独不是授权；先排除本人主办与rsvped，再对真实title/description匹配并选前三。错误owner、冲突重复ID、错actor/越界event/非法status的membership失败关闭，不冒充no_match。

R遗留的历史raw/account报名冲突和iOS回执身份两个发布门没有解除。此服务按已确认canonical身份契约工作，不读任意raw别名，不迁移历史数据。主任务负责后续兼容策略，W5负责界面接线。

## CRITICAL 影响披露与消费者核对

编辑前精确impact：tokensFor LOW（1 direct、2 impacted），textMatchesToken LOW（1 direct、3 impacted）。同文件 createEventsRecommendationTool **CRITICAL**（1 direct、11 impacted、1 process），其 riskSharedAxes=LOW 不降低 CRITICAL。主任务和用户在编码前均已收到披露。原入口只读保留，新导出不能引入网络、模型调用或循环依赖。

| 图谱消费者 | 实际调用/验证边界 |
| --- | --- |
| createOrbitAgentLiveArtifactTaskService | 构造旧tool后注入event artifact service；原tool直接capability测试及自有PG默认automation完整链 |
| createLiveOrbitAgentRuntime / createOrbitAgentConversationServiceForActor / live factory | 既有Gemini测试注入fake provider，self-profile/runtime与query-reply测试核对组合边界 |
| createOrbitAgentArtifactTaskServiceForActor | 自有PG默认automation执行实际经过此factory及live composition，未注入execute绕过 |
| `/api/ai/conversations` POST | conversation mock真实route与fake-provider live conversation回归 |
| `/api/ai/conversations/[id]` POST（图谱受影响process） | conversation-mock真实by-id route的traceable envelope回归 |
| dev tracePlanner / createLiveOrbitAgentTrace | fake-provider Gemini trace和self-profile trace测试；不把dev路由当产品端到端 |
| executeWithOrbitAgent / createLiveOrbitAgentConversationService | 下面的真实默认automation读本地PG探针及fake-provider conversation测试 |

这些是原消费者行为和读取链验证，不表示它们已经改为调用新严格推荐服务。图谱候选/流程预算存在既有裁剪，未返回的调用不能视为不存在；新的符号与动态调用继续用源码补证。

## 实施前基线验证

`env -i`、TZ=Asia/Tokyo，额外预加载 `/tmp/orbit-w3-offline-regression-guard.mjs` 拒绝所有未注入的 global fetch；8文件 **88/88通过、0skip**，guard未发现未注入网络调用。日志 `/tmp/orbit-w3-recommendation-consumer-baseline.log`。文件为：

- `tests/capabilities/event-crud-and-import-live-store.test.ts`
- `tests/capabilities/orbit-agent-gemini-live.test.ts`
- `tests/capabilities/orbit-agent-conversation-mock.test.ts`
- `tests/capabilities/agent-automations.test.ts`
- `tests/capabilities/orbit-agent-self-profile-tool.test.ts`
- `tests/capabilities/orbit-agent-self-profile-trace.test.ts`
- `tests/capabilities/orbit-ai-query-reply.test.ts`
- `tests/capabilities/orbit-ai-live-service-decoupling.test.ts`

原automation suite注入execute，不能单独证明默认执行链。因此另用 `/tmp/orbit-w3-recommendation-automation-probe.ts` 在自有PG `127.0.0.1:55463/orbit_web_w3_20260917`、合成workspace下验证：内存automation service → 默认runAgentAutomation（未注入execute）→真实live artifact factory/composition→旧recommendation tool→本地公开目录。结果success、runCount=1、sourceModules=[orbit-ai,events]、evidence:small-staging:event，摘要“已有1个活动可复核”。日志 `/tmp/orbit-w3-recommendation-automation-baseline.log`。automation及run记录仅在独立memory store，未写持久调度、未发消息、无云/付费模型/发布。

## 新服务实证与复验

首次RED `/tmp/orbit-w3-recommendations-red.log` 是新增服务模块尚不存在导致 MODULE_NOT_FOUND，仅证明能力缺失，不宣称复现旧推荐工具的语义缺陷。实施中发现排序fixture的结束时间早于开始时间、查询缺少排序期望所依赖的词，已交编码代理修正事实而非放宽断言。

Astra独立调用新真实runtime，读取自有PG中既有合成participant B的live profile，通过既有profile service依次设置空目标、明确中文目标和无关目标；实际结果分别是 needs_goal、success、no_match。成功项字面断言为 event `10000000-0000-4000-8000-000000000001`、publicCode `SMALL-STAGING`、matchedTokens `[小型测试交流会]`，来源 `evidence:small-staging:event`。profile/catalogue/account membership三条读取链均为真实配置实现，未注入替身。原relationshipGoal已在finally通过同一profile service恢复并读回核对。日志 `/tmp/orbit-w3-public-goal-runtime-probe.log`，脚本 `/tmp/orbit-w3-public-goal-runtime-probe.ts`。该本地seed的profile/account ID相同；不同ID的转发边界由R真实身份图测试及本批runtime测试负责，不以此探针证明迁移或raw兼容。

纯导出加入后，原8文件消费者再次 **88/88、0skip**，日志 `/tmp/orbit-w3-recommendation-consumer-final.log`；真实默认automation本地PG探针再次success、runCount=1，日志 `/tmp/orbit-w3-recommendation-automation-final.log`。父代理还以逐字节比较确认，删除新增7行导出后，旧tool文件与基线HEAD完全相同。

既有 `tests/services/event-core-public-catalogue-postgres.test.ts` 在自有PG上 **5/5、0skip**，日志 `/tmp/orbit-w3-recommendation-catalogue-final.log`，验证公开目录oracle、非公开活动隐藏、重复publicCode/非法来源和缺人数摘要失败边界。公开身份来自configured canonical catalogue，不能由存在publicCode反推授权。snapshot的organizerIds/publicCodes是单值map，单个snapshot不能表达同ID的两个owner；真实上游 orderedPublicEvents 在生成map前拒绝重复eventId，新服务另外拒绝快照里同ID事实冲突及重复publicCode，不制造不可表示的fixture证明。

新增两文件测试由父代理独立运行 **20/20、0skip**，日志 `/tmp/orbit-w3-recommendation-parent-focused-final.log`。字面断言覆盖本人目标与三种空/失败状态、真实标题/描述词法边界、过去/恰好now/取消活动、本人主办和rsvped先排除、cancelled membership保留、先排除再补满前三、分数/时间/ID排序、错误owner/报名actor/event/status、冲突重复及provider失败。新测试还直接调用真实canonical catalogue，确认同ID不同owner/publicCode及不同ID重复code均在map投影前失败。runtime测试核对explicit live和canonical account参数传递；不把调用参数测试冒称完整认证链测试。

实际无provider探针 `/tmp/orbit-w3-public-goal-no-provider-probe.log` 在清空数据库配置的环境调用真实runtime，结果严格为 unavailable/items=[]，未回退到mock profile。连同20项新测试、88项消费者回归和5项真实PG目录测试，本批父验收共 **113/113、0skip**，另有三个独立配置运行探针（新runtime实际PG、无provider、默认automation实际PG）。

以上全部使用env-i；PG动作固定本地目标，父验收预加载禁止未注入fetch的guard。未请求云、付费模型、OCR、消息或部署。父代理完整 `tsc --noEmit --incremental false -p tsconfig.json` exit=0，日志 `/tmp/orbit-w3-recommendation-parent-typecheck-final.log`；`git diff --check` 通过。

## 接线约定与限制

Web服务入口为 `createConfiguredPublicGoalRecommendationsRuntime({now?}).recommend({accountId})`。调用方必须先经现有认证解析器得到canonical accountId；返回四种state及最小items，页面需保留“浏览全部活动”。不把matchedTokens数量渲染为百分比、不打AI标签，理由仅能复述实际命中的目标词。连续中日文仍是既有字串匹配，可能漏掉同义表达；不声称语义理解。

本批没有API、共享DTO、schema、身份解析器或App变更。R历史raw/account记录与iOS ACK身份发布门仍由主任务跟踪，未被推荐服务测试解除。

## 完整变更范围门禁

最终范围为5个产品/测试文件、本文和原始JSON，共7文件。增量图谱首次返回208/208，但漏掉event-recommendation-tool.ts新增纯导出所在路径，因此未接受该结果；按主任务已确认规则进行一次有界 `--force --index-only --skip-fts` 重建（日志 `/tmp/orbit-w3-recommendation-index-force.log`），之后raw为 **236/236 symbols、7 changed files、0 reported affected processes、risk low**。逐路径校验没有缺失/意外路径、没有空ID；error/partial/truncated字段原始结果均缺省，未伪造false。

完整原始结果存于 `RECOMMENDATION-DETECT-CHANGES.json`，SHA-256 `ee3ab3f376179339e88f88c3393599bc0b04f84b15ada46c86168f68402ae011`。JSON自身是非执行证据文件，单独以git路径、JSON有效性和hash计入第7文件，不要求生成业务符号。所有产品、测试及Markdown文件均有图谱符号覆盖。验证脚本 `/tmp/orbit-w3-validate-recommendation-detect.py`，父验收文件hash清单 `/tmp/orbit-w3-recommendation-parent-tested-shas.txt`。

重建记录109032 nodes、245482 edges、2072 clusters、801 flows。FTS因既有UTF-8问题采用批准的skip-fts；流程生成器仍报告9541候选入口未纳入、8777分支callee省略、61预算截断。故0 reported affected processes不等于没有调用方；同文件旧入口CRITICAL影响及上面的实际消费者回归仍有效，不用增量风险或未返回流程降低风险。

## 69c9adcc 后续修复：混排文本大小写

主任务用真实helper发现 `matchedTokensForText("AI交流会", "AI交流会")` 仅返回 `["ai"]`，相同目标对小写文本却返回 `["ai交流会", "ai"]`。旧eventText在比较前调用toLowerCase；新增导出直接传入原文，导致混合CJK的token走includes时大小写敏感，进而改变命中数及排序。父代理独立复现日志 `/tmp/orbit-w3-recommendation-case-parent-before.log`。这是初版真实缺陷，前面的113项通过没有覆盖该输入，不能作为主验结论。

编辑前先刷新69c9对应索引，再精确impact：matchedTokensForText为LOW，direct=1、impacted=2（recommendWithDependencies及recommend）；原createEventsRecommendationTool仍CRITICAL，direct=1、impacted=11、process=1，包含会话POST。风险在编辑前向主任务/用户披露；日志 `/tmp/orbit-w3-recommendation-case-matchedTokensForText-impact.log` 和 `/tmp/orbit-w3-recommendation-case-createEventsRecommendationTool-impact.log`。

同一Luna先添加两个字面回归；RED exit=1、16通过/2失败，分别证明完整混排token缺失及相同时间事件顺序从应有a,b变为b,a，日志 `/tmp/orbit-w3-recommendation-case-red.log`。随后仅在新export内增加 `text.toLowerCase()` 比较层，保留title/description原文；GREEN22/22日志 `/tmp/orbit-w3-recommendation-case-green.log`。父代理逐字节核验helper以外旧文件内容与69c9完全一致，没有修改tokensFor/textMatchesToken/旧recommend，也没有修改严格服务或runtime。

父代理env-i+禁止未注入fetch的guard独立运行原8消费者文件88项、新两文件22项，共 **110/110、0skip**，日志 `/tmp/orbit-w3-recommendation-case-parent-final.log`。完整typecheck exit=0，日志 `/tmp/orbit-w3-recommendation-case-parent-typecheck.log`。额外实际导出探针对文本/目标不同大小写、中日文混排、纯CJK子串、AI不命中Kansai、stopwords均作字面断言并通过，日志 `/tmp/orbit-w3-recommendation-case-parent-probe.log`。本增量无数据库、模型或网络调用，未重跑前批PG探针冒充新增证据。仅helper、既有service测试和本文改变；初批raw JSON保持历史内容，新增量完整raw另存临时验收产物并在交接中提供路径及hash。

本增量图谱门禁如实保留缺项：增量索引返回3files/0symbols，未放行；一次有界force重建后返回 **4/4 symbols、3files、0 reported processes、risk low**，helper和本文有符号，但新增匿名test回调所在测试路径仍未命中。error/partial/truncated字段均缺省，无空ID，不能据此声称全覆盖。完整raw `/tmp/orbit-w3-recommendation-case-DETECT-CHANGES.json`，SHA-256 `9458e910229259e4e96b57a0d9f235203357f6c5982e659a64ea59dda606b5bc`。重建日志 `/tmp/orbit-w3-recommendation-case-index-force.log`，109034 nodes/245484 edges/2072 clusters/801 flows，FTS和流程预算限制继续适用。

主任务确认这与其W1匿名回调同类，明确批准通过Cypher实体/范围证据、完整diff与实际测试补核，不要求为图谱覆盖改测试形态，也不允许伪造File symbol。实际Cypher查得该test文件的File实体存在（startLine/endLine为null），总计80个实体、15个Function；git唯一新增hunk为1基203–240行，即0基闭区间[202,239]，与全部实体start/end ranges没有交集。完整实体数据 `/tmp/orbit-w3-case-test-entities.json`，范围核对 `/tmp/orbit-w3-case-test-graph-range-proof.json`，完整diff `/tmp/orbit-w3-case-test-full.diff`。后两者SHA-256分别为 `823f8d91b59debed78b13f171f36ef8712680e39a095b77ffb9de3b88139c3a3`、`daf18cce7b23caa3bb9d8fb45fb29b27ad3cf9666756d8c853d04b52fd6a27b0`。保留实际missing path并由主任务独立复核该明确例外；没有改测试形态，没有再做force循环，没有修改图谱工具或依赖。
