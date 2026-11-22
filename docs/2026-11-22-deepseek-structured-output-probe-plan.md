# DeepSeek 严格结构化输出：最小能力探针方案（只写方案，未执行）

2026-11-22 · 配合 `2026-11-22-event-ai-trilingual-codex-review.md` 第 3 节

## 目的

确认当前账号和模型能不能在解码层强制 JSON 结构，而不是只靠 `json_object` 加提示词。要回答四个问题：

1. 哪种接口在我们的账号上可用：
   - Chat Completions 的 strict 函数调用（beta）；
   - Responses API 的 `text.format: json_schema`。
2. 我们需要的 schema 写法能不能被接受，输出是否真的被强制。
3. 接近真实规模的一批（2 人推荐、6 人一桌）在严格模式下的耗时、token、违规率。
4. 实际处理请求的是哪个模型版本。

## 官方文档现状（2026-11-22 读取）

- **Chat Completions strict 函数调用（Beta）**
  - 需要 `base_url = https://api.deepseek.com/beta`，每个函数设 `strict: true`。
  - 支持的类型：object、string、number、integer、boolean、array、enum、anyOf。
  - object 要求所有属性都列入 `required`，并且 `additionalProperties: false`。
  - string 支持 `pattern`，不支持 `minLength`/`maxLength`。
  - array **不支持** `minItems`/`maxItems`。
  - schema 不合规时，服务端直接报错。
- **Responses API（`POST /responses`）**
  - `text.format.type` 可以是 `json_schema`，需要 `name` 和 `schema`。
  - 文档没有写 `strict` 字段，也没有列出不支持的关键字。是否真的强制，要靠探针确认。
- **模型**
  - 现名是 `deepseek-flash`（DeepSeek-V4.1-Flash-1017）和 `deepseek-v4-pro`。
  - 我们代码里默认的 `deepseek-v4-flash` 是旧名：仍然接受，但实际由 V4.1-Flash-1017 处理，按 Flash 计价（见 `features/orbit-ai/gemini-provider.ts:20`）。
- **当前适配器**：只发 `response_format: json_object`（`gemini-provider.ts:1220`），没有严格模式。

由此影响 schema 设计：数组长度（例如「破冰问题恰好 2 个」）没法靠 `minItems`/`maxItems` 约束，要改成固定键的对象（`{"q1":…, "q2":…}`）；推荐人数同理，可以用固定的 `r1..r4` 加 `anyOf null`，或者由程序检查。

## 探针（全部使用虚构参加者，不接触任何真实资料或数据库）

| # | 内容 | 调用数 | 判定 |
|---|---|---|---|
| P1 | strict 函数调用，小 schema：对象里套 `{ja,zh,en}` 对象、enum、`pattern`（占位符形如 `^\{[A-Z][A-Z0-9]*(:company)?\}$`）、所有字段 required、`additionalProperties:false` | 1 | 接受且输出符合 schema |
| P2 | P1 的 schema 加上不支持的 `minItems` | 1 | 应当在服务端直接报错，几乎不计费；记录报错形式，适配器要能识别 |
| P3 | Responses `json_schema`，同 P1 的 schema；再用一个故意难以满足的 schema（例如 enum 只允许一个值）各跑 1 次 | 2 | 看是否强制执行：难满足的 schema 下，如果输出仍然合规，说明是强制的；如果出现越界值，说明只是提示 |
| P4 | 真实形状的推荐批：2 个 source，每人固定 r1..r4，每条推荐是固定键的三语句子，目标候选键用 enum 限定为本批的候选键 | 3 | schema 违规次数（期望 0）、语言和占位符的程序校验通过率、单次耗时、输入和输出 token |
| P5 | 真实形状的分桌批：6 人，members 用固定键 M1..M6 | 2 | 同 P4 |
| P6 | 读取 P1–P5 响应里的 `model` 字段 | 0 | 记录实际版本 |

合计约 9 次有效调用。

## 预估花费

按 Flash 峰时价（输入未命中缓存 $0.30/M、输出 $1.20/M）：

- **P1–P3：** 每次输入约 1k、输出约 0.5k token，共约 4 次 → 约 $0.004。
- **P4–P5：** 每次输入约 6k、输出约 5k token，共 5 次 → 输入 30k、输出 25k → 约 $0.04。
- **合计：** 约 $0.05。建议预算上限 $0.20，超出就停。
- 不包含 Pro。审核用 Pro 是另一项设计，另行评估。

## 结果怎么用

- **strict 函数调用可用并强制：**
  - 适配器加一个「strict tool」分支：用 beta base_url，`tool_choice` 强制调用这一个函数，读取 `tool_calls[0].function.arguments`；
  - 三语推荐和分桌改成固定键 schema；
  - 程序侧的业务校验（作用域、配对、三语占位符和数字一致、语言字符）保留不变。
- **只有 Responses 可用：** 适配器要支持 `/responses` 的请求和响应格式，不能只换 endpoint。
- **都不强制：** 保持 `json_object` 加程序校验，在文档里写明「结构不是解码保证」。
- **无论哪种：** 严格 schema 只保证结构，不保证语义。三语等义、事实归属仍需要独立审核（见审阅第 3 节），这一项另作设计。

## 执行前需要的确认

付费 AI 调用：约 $0.05，上限 $0.20。按当前授权，这属于「解决活动 AI 生成问题」的范围，但父会话要求付费轮次暂停，所以执行前等确认。

## 执行结果（2026-11-22，虚构数据，共 11 次调用，$0.026）

方案里 6 项共 9 次调用，花费 $0.0195。P4、P5 第一轮的原始返回没有保存，又各补跑 1 次并保存了原始参数，花费 $0.0064。

| 探针 | 结果 |
|---|---|
| P1 strict 函数调用，小 schema | HTTP 200，0.9 秒；输出符合 schema（固定键、enum、pattern 都满足） |
| P2 strict 函数调用 + 不支持的 `minItems` | **没有报错**（HTTP 200）。文档说不支持的关键字会被拒，实际却被静默接受；这个关键字有没有生效无法判断（输出恰好 2 项）。结论：不能指望服务端拦下 schema 写错 |
| P3a Responses `json_schema`，小 schema | HTTP 200，1.5 秒，符合 schema |
| P3b Responses `json_schema`，enum 只允许 `followup`，提示词却要求 `intro` | 输出 `followup`，即服从 schema、违背提示词。说明 Responses 至少对 enum 是强制的 |
| P4 推荐批（2 个 source × 固定 p1..p4，target 的 enum 限定为本批候选键） | **第一轮 3 次全部结构不全**：只有 4 个 pick，有一个 source 整行缺失，而 schema 里 S1、S2 都是 required。补跑 1 次完整：8 个 pick、32 句，作用域、三语占位符、语言规则 0 违规。每次约 11 秒，输入约 4.7k、输出约 2.8k token |
| P5 分桌（固定 M1..M6，icebreakers 固定 q1..q3） | **第一轮 2 次都没解析出桌面文字**（theme、icebreakers、members 缺失或形状不对）。补跑 1 次完整：23 句，0 违规。每次 9–13 秒，输出 2–2.5k token |
| P6 实际模型 | 响应里的 `model` 字段是 `deepseek-flash`（代码里请求的是旧名 `deepseek-v4-flash`，官方说明它由 V4.1-Flash-1017 处理） |

**结论（基于样本，没有过度推断）：**

1. **strict 函数调用不能当作「解码层强制」：**
   - 第一轮大 schema 5 次中 5 次的返回缺少 required 字段（判定逻辑两轮相同，第二轮 2 次中 2 次完整）；
   - 不支持的关键字被静默接受。
   - 第一轮没有保存原始返回，所以「缺字段」也可能是返回了别的嵌套形状。要确认，需要再跑约 10 次 P4 并保存原文，约 $0.04。
2. **Responses `json_schema` 对 enum 有强制效果**（P3b），但这次只测了小 schema，大的嵌套 schema 没有测。下一步如果要用，应该先用 P4、P5 的 schema 在 Responses 上各跑约 5 次，约 $0.04。
3. **改成固定键之后，同一批的内容质量正常：** 补跑的两批里，作用域、配对、三语占位符一致、语言规则全部通过。而且 2 人一批的推荐只要 11 秒，输出 2.8k token，比现在数组形状的同一批（平均 31–35 秒、5–6k token）短得多。原因可能是固定键和单句理由减少了输出，这一点没有拆开验证。
4. **不管哪种接口，程序侧的完整校验都必须保留**：结构、作用域、三语一致、语言规则，校验不过就重试。

**建议的下一步**（需要确认后执行，约 $0.08）：
- 用 P4、P5 的 schema 在 strict 函数调用和 Responses 上各跑约 5 次，全部保存原文，统计结构完整率。
- 如果 Responses 稳定，适配器加 Responses 分支，三语生成改为固定键 schema。
