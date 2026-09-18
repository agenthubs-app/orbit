# Sprint 0081 — 活动画像：答满 8 题后能真正生成画像

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md 第 1 条（2026-09-18）。
**单一目标:** 找到并修掉 persona 预览 422 的真实原因，8 题会话（含预填题）能生成并保存画像；拒绝时界面透出 `portraitCode`。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `12a9f9653`。未启动，run_count = 0。
**进入条件:** 本机 Next dev（`.env.local` target=local）+ phoneweb；有一个已报名活动的测试账号（0077 期间已给 16 个活动补了报名窗口）；Gemini／DeepSeek 提供方可用（interview 步骤要调模型）。

## 已查明的事实

| 事实 | 数据 |
| --- | --- |
| 失败点 | `Registration7aViews.tsx:73` "生成画像" → `EventRegistrationScreen.tsx:379–412` `generateAdaptivePersona` → `POST …/registration/persona`（`mode: "portrait-preview"`）→ 422 |
| 日志证据 | `next-0069b.log` 约 31480–31600 行：6 次 interview 200 → persona 422 → App 重载 portrait／registration 来源（`saveState: "rejected"` 路径） |
| 服务端 422 出处 | `adaptive-handlers.ts:179` body 严格 schema；`portrait/answer-proofs.ts:29–80`（2–8 条、证明重验、stored responseId 必须存在、字段/ID 唯一、核心两题） |
| 已排除 | token 过期（两类 token 48h） |
| 首要怀疑 | 6 次交互 + 2 条预填 = 8 题；预填条目（`seedPortraitHistory`）的 `responseId`／`sourceVersion` 与服务端 `profile.interviewResponses` 不一致 |

**判断 1：先抓证据再改代码。** 用 Playwright 抓 persona 响应体拿 `portraitCode`＋message，定位到具体分支后再修；不猜。
**判断 2：错误要可见。** App 的 `setAdaptiveError` 在 409/422 时附带 `portraitCode`（i18n 文案 + 代码），避免再次"看不出为什么"。

## 范围与文件

- 修改（视定位结果二选一或都改）：`repos/orbit-app/src/view-models/event-registration-portrait.ts`（预填证明的 id／版本）、`repos/orbits/features/events/registration/portrait/answer-proofs.ts`（校验分支）、`EventRegistrationScreen.tsx`（错误透出）。
- 测试：orbits `tests/…/portrait*.test.ts` 增复现用例（混合三种证明）；App `tests/event-registration-portrait*.test.ts` 增 seed 与 body 一致性用例；浏览器复现脚本进 `tests/`（或记录为手工证据）。
- 排除：画像内容质量、问卷题目本身、七态 UI。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0081-01 | 复现：答满 8 题（含 2 条预填）后 persona 422，拿到 `portraitCode` 与 message | 抓包记录 |
| SC-0081-02 | 修复后同一会话 persona 200，预览含 persona 与 `generationToken`；保存 200 且回读一致 | 浏览器场景 + 服务端单测 |
| SC-0081-03 | 三种证明混合的 body 在服务端单测中通过；单独的负例（缺核心题、重复字段）仍 422 | orbits 单测 |
| SC-0081-04 | 拒绝时界面文案含 `portraitCode` | App 单测或截图 |
| SC-0081-05 | 无回归：App 全量对照 3508；orbits 定向集绿；两端 typecheck 0 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01、记基线与 Planner SHA；建分支 `codex/sprint-0081-portrait-422`。
2. 复现抓包（SC-01）。3. RED→GREEN 服务端／客户端修复（SC-02/03）。4. 错误透出（SC-04）。5. 全量与收口（SC-05）→ commit → merge → REPORT。

## 最小测试与检查

- 档位：App L／orbits M。定向集：portrait 相关单测两端；收口：App 全量（含 Chromium 屏幕测试）、orbits 定向。

## 失败与交接

若 422 来自模型返回的问题 token 本身不合法（interview 服务问题），把范围改为 interview 侧并在 REPORT 说明；不得绕过证明校验放行。
