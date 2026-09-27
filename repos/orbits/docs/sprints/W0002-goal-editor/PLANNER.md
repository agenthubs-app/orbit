# Sprint W0002 — 共享目标编辑器

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-05（「第 3 步提问前可改目标」随 W0006 实现，不在本 Sprint）。**单一目标:** 抽出一个目标编辑器组件，资料页「我的目标」和 onboarding 设目标步共用。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** W0001 合并后的 `chat-agent` HEAD。
**进入条件:** 无外部依赖。D7 已定：onboarding 去掉 16 个方向 chip，改用同一编辑器；`composeRelationshipGoal` 不再写入「方向、方向：」前缀，`parseRelationshipGoal` 仍能读回旧格式（旧 chip 前缀并入正文显示，不丢内容）。存储仍是 `relationshipGoal` 一段文字，不改表结构、不改 `/api/profile` 契约。

## 范围与文件

- 读取：`app/(app)/app/profile/profile-0918/profile-model.ts`（`GOAL_OPTIONS`、`personaGroups`）、`profile-persona.tsx`（`GoalCard`）、`app/(app)/app/profile/onboarding-0918/onboarding-model.ts`（`HORIZONS`、`composeRelationshipGoal`、`parseRelationshipGoal`）、`onboarding-flow.tsx`（`GoalsStep`）、对应测试。
- 修改：上述四个源文件及其测试。
- 新建：共享编辑器组件与纯模型（放在 `app/(app)/app/profile/` 下的共享位置，文件名开工时定），及其测试。
- 排除：iOrbit 第 3 步的就地修改（W0006）；onboarding 方向 chip 的恢复；改表结构。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0002-01 | 点示例句整句填入输入框（替换原内容），内容等于某示例时该示例 `aria-pressed=true`，改动后恢复 false | 组件测试 |
| SC-W0002-02 | 带「三个月内／一个月内／年内」的示例自动选对应期限卡片；手动点卡片可改 | 组件测试 |
| SC-W0002-03 | 期限选项改名后，`parseRelationshipGoal` 同时认新旧写法（本月／本季度／今年 → 一个月内／3 个月内／一年内）；带旧 chip 前缀的目标（「A、B：正文（本季度）」）读回时前缀并入正文、期限正确；`compose` 只写「正文（新期限）」 | 纯函数测试（新旧期限、旧 chip 前缀、无期限各一例） |
| SC-W0002-04 | 资料页和 onboarding 都用这个编辑器（onboarding 不再出现方向 chip），保存后刷新能回读同一段目标 | 既有资料页／onboarding 测试更新后通过；浏览器各走一次保存与刷新 |
| SC-W0002-05 | 不引入新的回归 | 修改测试所在完整文件及直接消费者通过；typecheck 一次 |

## 一次 Generator 的执行顺序

1. 登记 run-01；对 `parseRelationshipGoal`、`composeRelationshipGoal`、`GoalCard`、`GoalsStep`、`personaGroups` 批量 impact。
2. 先写 SC-01～03 的失败测试，再抽组件和模型。
3. 接入资料页与 onboarding，跑定向集，浏览器验证。
4. 路径限定提交、REPORT、合并回 `chat-agent`、合并树复跑定向集。

## 最小测试与检查

- 档位：L；若 impact 显示 `parseRelationshipGoal` 有服务端消费者（如活动推荐读目标），升 H 并加该消费者的测试。
- 开发定向集：新组件／模型测试、onboarding 与 profile 相关测试文件。
- 不运行：全量（除非升 H）。

## 失败与交接

报告写明 onboarding 方向 chip 的处理方式、新旧期限兼容证据；下一步 W0006 复用本组件做第 3 步就地修改。
