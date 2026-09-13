# R-00：真实验收的累计费用控制

> **For agentic workers:** 使用 `superpowers:executing-plans`，沿用已选单代理、原目录及 `chat-agent`，验证后单独 commit，不推送。

**Goal:** 执行已授权 AI/OCR 验收时，所有模型阶段、失败及重试合计不超过用户设定的 5 美元。

**Architecture:** 仅用于本次本地验收的 Node preload 包装已核实的 provider fetch 边界，先在同一个持久化账本原子预留，再允许网络。缺失／无效 usage 保留完整预留，只有完整成功回执可按保守费率下调。不是产品计费功能，不改 Web 源码、模型、prompt、输出上限、业务权限或 App UI。

**Tech Stack:** Node 内置 fs/crypto/http、现有 Node Test Runner；不新增依赖。

**Spec:** [剩余计划 R-00/R-01](2026-09-13-app-remaining-functionality-and-connectivity.md)；用户追加的累计 5 美元硬限额与本地依赖恢复／必要重启授权。

## 控制边界

- 新增 `scripts/qa/provider-budget.cjs`（账本及 fetch 拦截）、`scripts/qa/provider-budget-preload.cjs`（仅显式 NODE_OPTIONS 加载）；测试 `tests/provider-budget.test.ts`。不从产品代码引用，不自动启用。
- 已读实际 provider 实现：会话规划／合成、通用模型工具与 DeepSeek OCR 三个阶段均使用全局 fetch 或默认由其捕获的 fetchImplementation。Next worker 继承 NODE_OPTIONS；实际启用后先检查每个服务进程日志与只读请求，再发付费请求。
- 只允许 HTTPS `api.deepseek.com/chat/completions`、单个生成、非流式、当前确认的 Flash 三个名字。未知模型、供应商、路径、请求格式先拒绝，不能发送后才计账。
- 非模型 fetch 仅放行本地同服务和当前 Supabase 的 auth/rest/storage 路径；禁止自动跨源重定向。未知网络先报错，调查后再决定，不能无条件旁路。
- 账本存在已验证私有外盘目录中；初始化一次且拒绝覆盖。重启读同一路径；账本缺失、损坏或锁冲突均拒绝新的付费网络。临时文件 fsync 后原子替换，所有进程共享独占锁。账本只记录随机请求 ID、模型、时间、状态及 token 数，不记录凭证、图片或问题。
- 每次先预留 1,100,000 microUSD。官方已确认的 1M 上下文和 384K 最大输出，即按更高的保守费率 $0.44／百万输入、$1.32／百万输出，分开计算 1,048,576 输入＋393,216 输出，上界也低于 $1.10。这些是安全计价上界，不冒充当前公开价 $0.30/$1.20 或账户账单。
- usage 须含有效非负整数 prompt/completion/total、总数相等且分别不超已验证上界；响应模型也须已知。采用整数 microUSD 向上取整，不减缓存命中费用。超时、非 200、无 usage、解析失败、超范围等保持全额预留；不得据零值推断免费。
- HTTP 观测仅记录方法、脱敏路由、状态、Content-Type、重定向有无和随机关联 ID；不读／输出请求正文、Cookie、认证头或个人内容。

## 执行步骤

- [x] 基于当前 commit 刷新索引；对新增脚本和函数逐个 impact，未收录标 UNKNOWN，核对无产品引用。
- [x] TDD：真实临时账本，只有最外层 provider fetch 替换。第五个无 usage 请求必须在网络前拒绝；重启仍拒绝；有完整 1000 输入／100 输出的回执保守计为 572 microUSD；无效 usage 不回收。拒绝未知 endpoint/model/stream/n，保留原请求信号和正文、返回体可由调用方读取。初始化拒绝覆盖；损坏／锁冲突／并发跨进程不能超额。

  ```ts
  for (let n = 0; n < 4; n++) await guarded(endpoint, init);
  await assert.rejects(guarded(endpoint, init), /BUDGET_EXHAUSTED/);
  assert.equal(networkCalls, 4);
  assert.equal(readLedger(file).accountedMicroUsd, 4_400_000);
  ```

- [x] 最小实现，使用 `openSync(..., "wx", 0o600)` 初始化、`mkdirSync(file + ".lock")` 独占锁、`fsyncSync`＋rename 持久化；每次 reserve 与 settle 独立读写校验，保留所有未知结果。进程崩溃留下锁则停止，不擅自回收。
- [x] preload 子进程验证：不用真实凭证；先保存假的外部网络 fetch，再加载真实 preload，证明拒绝路径、正常透传和多个子进程共用账本。另以本地 HTTP 服务实际验证脱敏请求日志，不只检查代码字符串。
- [x] 定向用例、类型、契约及全量回归；自审／staged detect_changes 后独立 commit。
- [ ] 初始化本次唯一账本；验证已授权服务 PID 后停止自己的 Next 进程，继承原命令仅添加 preload／账本变量再启动。先只读检查健康、当前登录和历史；确认没有未覆盖 provider 客户端、意外网络旁路或旧服务仍监听，再执行少量原生 AI 场景。
- [ ] 每次读取账本与脱敏请求证据，验证保存／重开／第二轮上下文。不能把本机预算控制称为供应商账户限额；没有成功真实生成前不关闭 R-00。实体相机、未授权对象和服务端缺口继续分别记录。

## 自审

费用控制是既有验收的安全前置工具，不新增自动批量写入工作流。账本未知成本仍占额度；拒绝不能悄悄退回原 fetch。输出 token 上限和产品服务代码保持原值，因此不会用更简单的模型配置代替原问题验收。

## 当前验证记录

- 基于 `1bf649904` 重建索引成功，256.1 秒、exit 0；390389 节点、559469 边、300 流程。七个新增函数、测试 helper 与 preload 均未收录，impact UNKNOWN；源码搜索只有脚本互相引用及测试引用，产品 app/src 没有引用。不把缺节点说成 LOW 或零风险。
- 24 项首轮红测全部因无预留／无拒绝／无观测等预期行为缺失失败；实现后 24/24，0.772 秒、exit 0。自审补充未知计费字段与 Request 正文检查，4 项红测失败；拒绝未知字段、只读取 Request 克隆后通过。缺失账本启动和 OCR 三阶段独立计费的额外保护也通过。
- 最终定向 30/30，0.877 秒、exit 0；类型检查 exit 0；同步检查 6/6，2.093 秒、exit 0。全量 2276/2276，180.585 秒、exit 0，0 失败／取消／跳过。
- 本机安装的 Next `patch-fetch.js` 将原 globalThis.fetch 包在 createDedupeFetch／createPatchedFetcher 内；POST 与带 signal 请求仍调用原 fetch。`next-dev.js` 保留并重新格式化 Node options 给 fork worker；实际新进程仍须以 ready 日志核对，而不是仅凭源码推断启用成功。
- 当前 `.env`／`.env.local` 没有 NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL；运行时数据库由既有 Postgres 连接配置处理，不需要为它开放模型网络旁路。本轮不读取或打印数据库连接串。
- 官方 [Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/) 再读 HTTP 200：max_tokens 最大 393216，usage.completion_tokens 包含生成输出，prompt_tokens 等于缓存命中＋未命中。保守分开上界为 980419 microUSD，小于每次预留 1100000；实际费用只称保守估计，不称账户账单。
- 日志：`/tmp/orbit-budget-guard-red-20260913.log`、`/tmp/orbit-budget-guard-green-20260913.log`、`/tmp/orbit-budget-guard-extra-red-20260913.log`、`/tmp/orbit-budget-guard-final-20260913.log`、`/tmp/orbit-budget-guard-typecheck-final-20260913.log`、`/tmp/orbit-budget-guard-contracts-20260913.log`、`/tmp/orbit-budget-guard-full-20260913.log`。
- 沿用已选单代理执行，按 code-review 检查项进行自审，不声称独立审查。安全边界的未知费用、请求透传与并发预留均有行为断言；没有新增依赖或改产品文件。仅本次已核定供应商／模型／时点适用，未来重新验收必须重新核对价格和上界，但不得清零本次累计账本。
- 提交前 staged detect_changes 报告 6 文件、LOW、0 个已列出的受影响流程；图只映射到 5 个文档段落，新增 CJS／测试尚未收录。实际新增三份脚本／测试的完整代码已自审并运行，不用图中缺项作为通过证据。

## R-00 运行中补充：脱敏响应证据

14:03 原生单一会面准备问题已到达真实 provider，完整 usage 为 3195 输入／1126 输出，保守费用 2893 microUSD；同一 requestId 的业务根 POST 却返回 503 JSON。App 将服务端 SERVICE_UNAVAILABLE 统一显示为通用文字；不能由当前屏幕断言模型 schema 失败。本段补足原 R-00 要求的失败原因／生成来源／保存回读证据，不改产品行为。

- [x] 刷新当前 commit 后索引，对 `installBudgetObservation`、拟新增 `responseEvidence`、测试 helper 做 upstream impact，保留新增未知节点记录。
- [x] 扩展 `tests/provider-budget.test.ts`：真实 HTTP 子进程分别返回分段 503 JSON、成功模型 provenance、session 保存／回读；断言原响应字节未改变、日志只有固定错误分类／白名单元数据及 session 哈希。非 AI 路由、未知错误内容、非 JSON／编码响应、超出 128 KiB 的响应都不输出原文；未解析必须明示，不写成空成功。先看到缺少 evidence 的断言失败，再实现。
- [x] 仅改 QA `installBudgetObservation`，对 AI conversations 路径透明旁观 `write`／`end`，保留原参数、回调、返回值；最多暂存 128 KiB，结束后解析白名单，不落原始文件。`responseEvidence` 只返回 success、固定 error code／精确已知目录文字对应的原因、允许的 provider/model/generationMethod、布尔 safety／persisted、会话 ID 哈希／消息数量／正文摘要哈希。其他任意文字均不得进入日志。

  ```ts
  assert.equal(httpEvent.responseEvidence.errorCode, "SERVICE_UNAVAILABLE");
  assert.equal(httpEvent.responseEvidence.reason, "provider_schema_invalid");
  assert.equal(receipt.responseEvidence.sessionRef, reread.responseEvidence.sessionRef);
  assert.equal(receipt.responseEvidence.messagesDigest, reread.responseEvidence.messagesDigest);
  assert.doesNotMatch(log, /private-cookie|private-person|raw-provider-output/);
  ```

- [x] 运行定向／类型／同步／全量回归，自审和 staged detect_changes 后单独提交。
- [ ] 沿用原服务命令重新加载观测与**同一账本**，不得重新初始化。随后至多一次先重试当前冻结问题以获取精确原因；失败仍保留，是否继续依据新证据与既有最多三次同假设限制决定，不修改服务端安全校验或切换模型制造通过。

现有运行账本：`/Volumes/ORICO/Dev/MacMovedData/orbit-validation-20260913.7c2lIC/ai-ocr-budget-ledger-20260913.json`；当前 1 个已结算模型请求、累计 2893 microUSD。源码当前 `bf1baa1e2`；新观测验证不会调用模型。

补充验证：索引刷新 259.5 秒、exit 0；installBudgetObservation 为 LOW，仅 preload 一个直接调用者、0 个流程；测试 helper 为 LOW，仅本测试文件引用；新解析器／局部 observe 为 UNKNOWN。新增三项红测均因缺 evidence 失败，实现后 33/33。自审发现 Node 合法的 end(null) 路径会触发 Buffer.from(null)，新增红测复现后修复；本机 Next send-payload.js 也使用该调用，未忽略该兼容性。最终 34/34，1.358 秒、exit 0；类型 exit 0、同步 6/6，1.808 秒、exit 0。服务端 failure() 会用 provider 的具体错误文字覆盖通用目录文字，白名单同时覆盖已读的固定 schema 失败文字；其他消息仅记 unclassified，不打印原文。

全量 2280/2280，184.223 秒、exit 0，0 失败／取消／跳过。日志 `/tmp/orbit-r00-response-evidence-red-20260913.log`、`/tmp/orbit-r00-response-null-red-20260913.log`、`/tmp/orbit-r00-response-evidence-final-20260913.log`、`/tmp/orbit-r00-response-evidence-typecheck-20260913.log`、`/tmp/orbit-r00-response-evidence-contracts-20260913.log`、`/tmp/orbit-r00-response-evidence-full-20260913.log`。未改变费用预留／结算逻辑、产品代码或 Web 文件。
