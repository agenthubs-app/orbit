# Sprint 0084 — 资料类页面：分组标题、可点入口、字段、静态值各归其位

**Plan revision:** 1。**模式:** existing-codebase / single-generator（含一次用户批准门）。运行状态只在登记表。
**原需求:** TODO.md 第 2 条。
**单一目标:** 截图审核 → 设计案 → 统一 `ProfilePagePrimitives` 与同类页面的四类元素规格。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `12a9f9653`。未启动，run_count = 0。
**进入条件:** 用户实际账号可登录 phoneweb（截图需真实数据密度）；设计案按"先出设计案再实现"规则获批后才进入实现步。
**设计案（已产出，待批准）:** https://claude.ai/artifact/RPmcSJo9GBTkucNoBPUj97 —— 四角色规范（分组标题降为 12px/600 灰色大写、可点入口 16px/500 + accent 箭头 + 按压态、字段标签 13px/500、静态值 16px/400），并含"服务器/服务器"改文案与审核范围。

## 已查明的事实

| 事实 | 数据 |
| --- | --- |
| 共用组件 | `ProfilePagePrimitives.tsx`：`sectionTitle` 15/800，`rowLabel` 15/600，输入 15 正文无边框，`fieldLabel` 12/700 灰，`sectionDetail` 12 灰；可点只靠 chevron |
| 使用页面 | EditProfile、ProfileMore、ProfileSuggestions、ProfilePreview、ProfilePublicView、ProfileTagPicker |
| 观感来源 | section 标题后紧跟同样粗的 `ProfileNavRow`（我能提供→选择标签；怎么联系我→打开更多资料→查看资料建议） |
| 证据 | `docs/todo-evidence/2026-09-18-profile-edit.png`、`-profile-more.png` |

**判断 1：审核范围不止资料页。** 至少覆盖：资料 6 页、设置页组（`SettingsScreen`、`ApiSettingsScreen`、通知设置）、账号页、活动详情、待办详情、个人日程编辑——凡是"分组标题 + 行"结构的页面。
**判断 2：规格落在组件，不在页面。** 改 `ProfilePagePrimitives` 及其它页面各自的 primitives；页面只换用法。
**判断 3：可点与不可点必须有两处以上差异**（例如：字色 ink vs text3、右侧 chevron、按压态），不只靠 chevron。

## 范围与文件

- 审核产物：`docs/audits/2026-xx-page-hierarchy/`（截图 + 清单）。
- 设计案：artifact（本地 `scratchpad/page-hierarchy.html` 副本入 `docs/designs/`）。
- 实现（获批后）：`src/screens/profile/ProfilePagePrimitives.tsx` 及审核列出的页面与其 primitives；对应屏幕测试（`app-style-*`、`ink-signal-*` 中相关用例）。
- 排除：改信息架构（不增删字段），改文案。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0084-01 | 审核清单覆盖所有"分组标题 + 行"页面，每页截图标出四类元素与问题 | 清单文件 |
| SC-0084-02 | 设计案给出四类元素规格与可点／不可点的差异规则，用户批准 | artifact 链接 + 批准记录 |
| SC-0084-03 | 实现后，审核清单里每页前后对照截图，四类元素按规格区分 | 截图对照 |
| SC-0084-04 | 屏幕测试更新为新规格（触摸目标 44pt、字号缩放等既有断言不退化） | App 全量对照 |
| SC-0084-05 | 两端 typecheck 0；Simulator 抽查 2 页 | 摘要 + 截图 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0084-page-hierarchy`。2. 截图审核（phoneweb + Simulator）。3. 设计案 → **等待批准**。4. 组件与页面实现 RED→GREEN。5. 前后截图、全量、收口。

## 最小测试与检查

- 档位：App H（改共用组件）。定向集：使用 primitives 的页面屏幕测试；收口：App 全量。

## 失败与交接

设计案未批准则停在步骤 3，登记 paused；不得在未批准时改组件样式。
