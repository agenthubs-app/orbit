# Sprint 0083 — 资料更新建议全部中文

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md 第 3 条。
**单一目标:** `live-signal-service.ts` 的建议文案按语言输出；证据摘录按用户决定的边界处理。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `12a9f9653`。未启动，run_count = 0。
**进入条件:** 用户回答一个问题——**是否把生成种子里的英文对话／记忆一起换成中文**（默认：不改种子，摘录保留原文并加"来源原文"标注；服务端规则文案全部本地化）。

## 已查明的事实

| 事实 | 数据 |
| --- | --- |
| 服务端硬编码英文 | `features/profile/live-signal-service.ts` 247–250、287–290、329–332（建议值／理由／sourceLabel），382–394、441–459（summary／nextAction） |
| 种子英文 | `shared/mock/generated-relationship-fixtures.ts` 生成的 messages／interactionMemories／evidence；本地库 interactionMemories 320 条、messages 58 条含英文长句 |
| App 直出 | `ProfileSuggestionsScreen.tsx:36–40` `rationale`／`suggestedValue`／`evidence.excerpt` 用 `locale.t.literal` |
| 请求语言 | `/api/profile/update-suggestions` 目前不带语言；账号语言偏好在 `account_language_preferences` |

**判断 1：文案在服务端按语言产出，不在 App 翻译。** 服务加 `language` 入参（route 从账号语言偏好或 `?language=` 取），规则表改为三语字典（zh／ja／en），建议值同样三语。
**判断 2：摘录是数据不是文案。** 默认不翻译摘录；UI 加"来源原文"小标签。若用户选择改种子，则加一个种子子任务并重跑 `db:seed:live-generated-fixtures`。

## 范围与文件

- orbits：`features/profile/live-signal-service.ts`（三语字典 + language 入参）、`features/profile/signal-contract.ts`（`language`）、`app/api/profile/update-suggestions/handler.ts`（取语言）、`tests/capabilities/profile-signal-review-live-store.test.ts`。
- App：`ProfileSuggestionsScreen.tsx`（"来源原文"标签）、i18n 三文件。
- 可选（用户决定）：`shared/mock/generated-relationship-fixtures.ts` 中文化 + 种子重跑。
- 排除：mock 服务的英文（仅 dev 页面）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0083-01 | zh 账号：3 条建议的建议值／理由／sourceLabel／summary／nextAction 无英文字面量；ja／en 账号各自语言 | 服务单测（正则断言无 `[A-Za-z]{4,} [A-Za-z]{4,}`）|
| SC-0083-02 | 摘录按决定处理：原文 + "来源原文"标签，或中文种子 | 截图 |
| SC-0083-03 | 接受建议的 patch 值是中文（写入资料的不是英文短语） | accept 路由单测 |
| SC-0083-04 | 无回归：orbits 定向集、App 全量对照、两端 typecheck 0 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0083-suggestions-i18n`。2. 服务端三语字典 RED→GREEN。3. 路由取语言。4. App 标签。5. （可选）种子。6. 截图、收口。

## 最小测试与检查

- 档位：orbits M／App L。定向集：profile-signal 两个测试文件、accept 路由；App 资料建议屏幕测试。

## 失败与交接

若账号语言偏好读取会引入额外一次业务读（0070 账本），改为 App 传 `?language=`。
