# Sprint W0002 — 执行总结

## 目标实现情况

- 本轮要实现：资料页和 onboarding 用同一个目标编辑器——点示例句填入再改，选「一个月内／3 个月内／一年内」。
- 已验证能做到：
  - 新组件 `profile/goal-editor/`：输入框、10 条示例句（点击整句替换、光标到句末、内容一致时才显示选中）、三张期限卡片，带时间的示例自动选期限；已选示例悬停变深色而不是变浅（SC-01、SC-02）。
  - 存储仍是 `relationshipGoal` 一段文字，只写「正文（期限）」；旧期限本月／本季度／今年、旧 chip 前缀「A、B：正文」都能读回，旧草稿迁移不截断（SC-03）。
  - onboarding 去掉 16 个方向 chip（D7），显示同样的「请认真写」提醒；资料页和 onboarding 保存后重新挂载能读回同样的正文和期限（SC-04，组件级）。
  - 真实资料页 `/app/profile?view=persona` 渲染正常：已存旧目标的前缀并入正文、「本季度」读成「3 个月」，console 无错误。
- 仍未实现或未验证：
  - **真实页面的「保存并刷新」没有做**：保存会改写用户账号里已存的目标文字格式，未经用户同意不改动其数据；以组件级「保存 → 卸载 → 以同一接口数据重新挂载」测试替代，两页各一条。
  - onboarding 旧样式 `.ob-seg*`、`.ob-group-title` 已无人使用，未删（不在白名单，无害）。

## 运行记录

- 原需求：RW-05（第 3 步部分除外）；决定 D7
- 结果：completed
- run：run-01；Generator：子代理（general-purpose），协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 基线：`chat-agent` @ W0001 合并后
- 最后功能 SHA：`fa7ab0b0`；分支 `sprint/W0002-goal-editor`
- push：未执行

## 改了什么

| 功能 | 文件 | commit |
| --- | --- | --- |
| 共享编辑器与纯模型 | `app/(app)/app/profile/goal-editor/goal-editor.tsx`、`goal-editor-model.ts`（新） | `fa7ab0b0` |
| 资料页接入、10 条示例 | `profile-0918/profile-persona.tsx`、`profile-model.ts` | `fa7ab0b0` |
| onboarding 接入、去 chip、旧草稿迁移 | `onboarding-0918/onboarding-flow.tsx`、`onboarding-model.ts` | `fa7ab0b0` |
| 测试 | `tests/pages/app-profile-goal-editor.test.tsx`（新）、`app-profile-onboarding-flow`、`app-profile-persona`、`app-profile-model` | `fa7ab0b0` |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0002-01 | pass | `app-profile-goal-editor.test.tsx` SC-01 |
| SC-W0002-02 | pass | 同上 SC-02 |
| SC-W0002-03 | pass | 同上 SC-03（新旧期限、旧 chip 前缀、无期限、非期限括号、往返）+ 最长旧草稿不截断 |
| SC-W0002-04 | pass（组件级） | onboarding 与 persona 的「保存后重新挂载」测试；真实页面仅做渲染检查，保存未做（见上） |
| SC-W0002-05 | pass | profile 相关 154 条：150 pass、0 fail、4 skip（`app-profile-live-route-services` 需另一个测试库 socket，与本改动无关）；`tsc` 0 错误 |

## GitNexus

- `parseRelationshipGoal`、`composeRelationshipGoal`、`GoalsStep`、`readOnboardingDraft`、`OnboardingFlow`：LOW。
- `GoalCard`、`personaGroups`、`ProfilePersona`：图谱报 CRITICAL（`partial: true`，第 3 层扩散到 1914 个）。grep 核实真实消费者只有 `profile-screens.tsx`、`profile-overview.tsx`，签名未变、测试通过，判定为遍历虚高；服务端没有解析目标期限文字的代码，维持 L 档。
- staged detect-changes：10 文件、29 符号、0 流程，risk low。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 旧草稿迁移截断到 100 字，最长约 155 字会丢尾 | 采纳 | 读取与迁移路径不截断，100 字只限新输入；新增最长旧草稿测试 |
| SC-04 缺保存后回读证据 | 采纳 | 两页各加一条保存 → 重新挂载测试 |

## 交接

- 自行决定：资料页已存目标没有期限时不预选期限（不悄悄改用户文字）；onboarding 默认 3 个月内；onboarding「继续」只要求正文非空。
- 另一端影响：`relationshipGoal` 文字格式对 App 端透明（App 只展示文字）。
- 费用：0 次付费 AI 调用。
- 下一步：W0003、W0013、W0007；W0006 复用本编辑器。
