# Agent 行为控制架构调研:如何取代"巨型 system prompt 堆规则"

调研背景:orbit AI 的 planner `systemInstruction()` 已堆积 30+ 条自然语言规则,出现规则互相干扰、加新规则导致旧行为回归、无法单条测试、无可观测性。
方法:5 路检索 → 25 个来源 → 每条论断 3 票对抗核实(108 个子代理)。标注 `[3-0]` 为全票通过;被否决的论断列在末尾,**不作为结论引用**。

---

## 一、TL;DR

业界共识**不是"把规则写得更好",而是"把行为策略从 system prompt 里搬出来,变成可单独定义、单独测试、代码层强制执行的对象"**。

但有一个关键的能力不对称,直接决定了这个项目该怎么改:

> **这些机制在 deny 侧(拒答、硬边界)是代码层确定的,在 allow 侧(该路由到哪、该调哪个工具)仍然是模型的概率决策。**

也就是说:我刚加的"服务范围拒答"完全可以下沉成代码层 guardrail;但"意图路由"这类规则搬不走,只能靠 eval 兜底。

---

## 二、核心发现

### 1. 堆叠边界情况是 Anthropic 明确点名的反模式 [3-0]

> "teams often stuff a laundry list of edge cases into a prompt in an attempt to articulate every possible rule the LLM should follow" —— **"we do not recommend this"**

正确目标是 **right altitude**:既不硬编码脆弱的 if-else 逻辑(fragility + maintenance complexity),也不给含糊无信号的泛化指导。解药是**少量多样的典范示例(canonical examples)+ 强启发式**。

⚠️ 重要限定:原文把"欠规范"列为对等的失败模式,并明确说 *minimal does not necessarily mean short*。它反对的是**枚举式规则覆盖边界情况这一形态**,不是规则数量本身。
来源:https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (2025-09-29)

### 2. 指令遵循确实随规模衰减,但本项目的痛点不是长度 [3-0]

- **Context rot**:token 数增加 → 上下文召回准确率下降,所有模型都有,只是速率不同(Chroma 受控研究,18 个前沿模型)
- **IFScale**(arXiv 2507.11538,20 个模型/7 家供应商):指令数量维度存在 threshold/linear/exponential 三类衰减,以及 **primacy effect**——靠前的指令更被遵守,错误形态从"执行错"变成"整条遗漏"

⚠️ **必须带的限定**:Chroma 的陡峭衰减发生在 100k–500k token 区间,而本项目 30 条规则约 2–4k token,**远不在那个区间**。所以痛点应归因于**指令密度、位置偏差、规则互相干扰**,而非上下文长度。
(调研中"500 条指令下遵守率 68%"这一具体数字被 0-3 否决,不引用。)

### 3. OpenAI:先把单 agent 做到极致,但给了三条拆分信号 [3-0]

官方立场明确劝阻默认拆多 agent:
> "Maximize a single agent's capabilities first... often a single agent with tools is sufficient."

但给出三条可操作的拆分触发信号:
1. prompt 含大量 if-then-else 条件分支、模板难以扩展
2. agent 反复无法遵守复杂指令
3. 反复选错工具

**本项目三条全中。**

⚠️ 三个限定:(a) 原文用的是 *may need / consider* 的弱语气,默认建议恰恰是不拆;(b) "选错工具"这条紧跟一句 —— *"The issue isn't solely the number of tools, but their similarity or overlap"*,建议**先改善工具名与描述**再考虑拆分;(c) 这三条回答的是"何时把一个 agent 拆成多个",**不构成"一条 prompt 规则何时下沉为代码"的判据**。
来源:https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/ (2025-04,已 15 个月)

另有反方观点:Cognition(Devin)的 *Don't Build Multi-Agents* 主张拆分会丢失隐式上下文、产生互相冲突的部分草稿,解法应是 context engineering 而非 agent 分解(作者后来公开软化立场)。

### 4. 安全/范围检查应作为独立 guardrail,而非 prompt 里的一条规则 [3-0]

OpenAI Agents SDK 的做法:
- 用**便宜快的模型先筛**,命中即抛 tripwire 异常**硬中断**执行
- 声明式绑定:`Agent(name=..., input_guardrails=[math_guardrail])`
- 源码确认非营销话术:`run.py` 有三处 `except InputGuardrailTripwireTriggered`,并在并行路径调 `model_task.cancel()`

**检测侧可以是概率的(LLM 分类器),执行侧是代码层确定性控制流。** guardrail 是可单独定义、单独替换、单独单测的对象。

⚠️ 四个限定:(a) input guardrail 默认 `run_in_parallel=True`,此模式下昂贵模型已经开跑,"省钱"只在阻塞模式成立;(b) 只对链上第一个 agent 生效,handoff 后不复筛;(c) streaming 下 output guardrail 在 token 已吐给客户端后才判定;(d) guardrail 的检测实现本身常常还是个带 prompt 的 LLM。
来源:https://openai.github.io/openai-agents-python/guardrails/

### 5. 约束应下沉到工具定义本身 [3-0]

描述、严格数据模型、错误信息 —— 而非只写在 system prompt。**工具描述是软引导,硬约束来自 schema 与校验代码。**
来源:https://www.anthropic.com/engineering/writing-tools-for-agents

**Pydantic AI 提供了框架级实现** [3-0]:
- 默认 Tool Output 模式把输出类型的 JSON schema 作为 output tool 的参数 schema 交给模型(**而非写进 instructions**)
- 业务校验通过 `@agent.output_validator` 挂载为**普通代码函数**,支持异步与 IO(如查数据库)→ 可单测
来源:https://pydantic.dev/docs/ai/core-concepts/output/

### 6. eval 驱动开发是配套底座 [3-0]

先基于真实用例批量生成评测任务(应涉及多次工具调用、基于真实数据源),验证器谱系从精确字符串比较到 LLM-as-judge,并可把评测 transcript 交给 agent 自动分析改进工具。
来源:https://www.anthropic.com/engineering/writing-tools-for-agents

### 7. NeMo Guardrails:把对话策略变成声明式单元 [medium, 3-0]

一条 dialog rail = 用户消息规范形式+示例话术 / 机器人消息规范形式+话术 / 连接二者的 flow。"是否允许模型自由生成"是**显式的代码层配置**。
来源:https://github.com/NVIDIA-NeMo/Guardrails (注:官方 docs 站对应路径已 404,须引 GitHub 源文件)

---

## 三、一个必须知道的反例

**泄露版 Claude Code system prompt 约 1585 行 / 27k token / 72 个命名章节 / 18 个工具 schema,包含带例外的硬规则。**

即 **Anthropic 自己的实践与其倡导的"别堆规则"并不完全一致**。

正确读法不是"所以堆规则没问题",而是:**那份大 prompt 是与厚重的代码/工具层结构配套的**——规则数量本身不是杠杆,有没有配套的工具 schema、校验层、eval 才是。

---

## 四、对本项目的演进路线

按优先级,每步都能独立交付价值(不是必须一路做到底):

### P0:建 eval 集与可观测性(**最高性价比,先做这个**)
- 每条现存规则对应**至少一个回归用例**
- 记录 planner 的结构化意图输出(intent / toolRequests / domains),以便逐条断言
- 这一步不改架构,但立刻解决"加第 31 条会不会打坏第 7 条"——现在这个问题只能靠人肉抽样
- 现状对照:`tests/capabilities/orbit-agent-gemini-live.test.ts` 已有 35 个用例,但**断言的是"规则文本在不在 prompt 里",不是行为**。要补的是行为层用例

### P1:硬边界规则下沉为前置 guardrail
- 目标规则:**服务范围拒答**(我刚加的那 4 条)、安全越界
- 做法:在 `live-agent-runtime.ts` 已有的本地边界层(`createLiveOrbitAgentLocalBoundaryPayload`)里加一个范围分类器,命中即短路,不进 planner
- 收益:deny 侧变成代码层确定,可单测,且省一次模型调用
- **这是调研结论支持度最高、最适合本项目的一步**

### P2:输出契约与检索参数约束下沉到 tool schema + validator
- 目标规则:`searchTerms` / `domains` 的约束(现在写在 instruction 第 598-599 行的自然语言里)
- 做法:移进工具的 JSON schema(枚举、必填、格式),校验逻辑做成可单测函数
- 同时做**工具描述消歧**——OpenAI 明说选错工具应先修描述再考虑拆分

### P3:才考虑按领域拆 agent 或引入图编排
- 三条拆分信号虽然全中,但官方默认建议是不拆,且 Devin 团队有反方实证
- 放最后,且拆之前先把 P2 的工具描述消歧做完

**关键提醒**:P1/P2 能可靠替代"拒答与硬边界"类规则,**不能可靠替代"意图路由"本身**——allow 侧仍是概率决策。所以路由类规则(现在 instruction 里最大的一块)只能靠 P0 的 eval 兜底,不要指望架构改造消除它。

---

## 五、调研盲区(诚实声明)

**以下方向没有任何论断通过对抗核实,报告在这些方向等于空白**,不能当作"已调研过且无结论":
LangGraph(状态机/图编排)、DSPy(prompt 自动优化)、Guardrails AI、Cursor、Devin、Glean、Claude Agent SDK、policy-as-code、canary/影子评估。

**来源性质**:绝大多数是厂商一手文档/工程博客。对"某框架提供什么机制"这类**接口性断言**是充分证据;但对"这样做效果更好"这类**效能断言,本轮几乎没有独立第三方实证**——Anthropic 声称的工具描述优化收益、eval 驱动收益均无可复现基线数字。**请勿把厂商的设计主张当成已验证的效果。**

**时效性**:OpenAI 实践指南发布于 2025-04(约 15 个月前),早于 2025–2026 的 context-engineering 与 subagent 隔离文献。

---

## 六、被否决的论断(0-3 或 1-2,不采信)

这些恰好是最"好用"的强表述,所以特别列出避免误引:

| 论断 | 票数 |
|---|---|
| handoff 是官方编排原语,策略应拆成多个专精 agent | 0-3 |
| 路由决策下沉为 `transfer_to_<agent>` 工具 schema | 0-3 |
| Prompted Output 说明"写进 prompt 是最弱约束" | 0-3 |
| 错误响应作为 prompt 工程对象,在代码层确定性纠正行为 | 0-3 |
| 500 条指令下遵守率约 68% | 0-3 |
| 范围分类应下沉为 relevance/safety 分类器并分层组合 | 1-2 |
| flow activation 使规则按上下文选择性启用 | 1-2 |
| "带策略变量的单一 prompt 模板"是拆分前的中间态 | 1-2 |

---

## 来源

- Anthropic, Effective context engineering for AI agents — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, Writing tools for agents — https://www.anthropic.com/engineering/writing-tools-for-agents
- OpenAI, A practical guide to building AI agents — https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- OpenAI Agents SDK, Guardrails — https://openai.github.io/openai-agents-python/guardrails/
- OpenAI Agents SDK, Handoffs — https://openai.github.io/openai-agents-python/handoffs/
- Pydantic AI, Output — https://pydantic.dev/docs/ai/core-concepts/output/
- NVIDIA NeMo Guardrails — https://github.com/NVIDIA-NeMo/Guardrails
- Chroma, Context Rot — https://research.trychroma.com/context-rot
- IFScale — https://arxiv.org/abs/2507.11538
- Cognition, Don't Build Multi-Agents — https://cognition.com/blog/dont-build-multi-agents
