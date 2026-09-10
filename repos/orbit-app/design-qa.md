# Orbit AI Drawer Option 1 Design QA

## Comparison Target

- Source visual truth: `/Users/xzhao/.codex/generated_images/019f426d-ebdc-76a3-ae84-54acdaa9ca91/exec-d02b446b-13fd-4635-b29d-b331b6e314a4.png`
- Implementation screenshot: `/Users/xzhao/Projects/orbit/.tmp-ios-ai-drawer-option1-final.png`
- Side-by-side comparison: `/Users/xzhao/Projects/orbit/.tmp-ios-ai-drawer-option1-comparison.png`
- Device and state: iPhone 17 Pro simulator, signed in as the canonical Xiaoyu account, Orbit AI drawer open, four next actions and 40 inbox items.
- Source pixels: `853 x 1844`, generated for a `390 x 844` mobile target.
- Implementation pixels: `1206 x 2622`, iPhone 17 Pro logical viewport `402 x 874` at `3x` density.
- Normalization: both images were Lanczos-scaled into `402 x 874` frames; the source preserved aspect ratio with white padding and the implementation was downsampled from `3x`.

## Findings

- P0: none.
- P1: none.
- P2: none.
- Typography: the implementation preserves the target's strong black workspace labels, lighter single-line descriptions, zero letter spacing, and compact hierarchy. Chinese labels do not wrap or clip.
- Spacing and layout: the four continuous rows, separators, generous lower whitespace, rounded drawer edge, and combined account footer match the selected structure. Touch targets remain at least 44 points.
- Colors and tokens: Orbit purple, sky blue, green, amber, red badges, white surface, and gray scrim use the existing app tokens and closely match the source.
- Icons and assets: production uses the existing Ionicons set. The source's illustrative avatar is intentionally replaced with the existing profile icon because no verified user portrait is available; no fabricated portrait was introduced.
- Copy and content: the drawer contains only `今天`, `人脉`, `活动`, and `收件箱`. Former granular entries are absorbed into these workspaces. The footer displays `小雨` through the canonical mobile identity mapping.
- Runtime chrome: the implementation includes the simulator-owned iOS status area while the generated source omits it. This is expected native runtime behavior and does not alter app-owned drawer content.

## Evidence

- Full-view comparison: `.tmp-ios-ai-drawer-option1-comparison.png` shows matching information hierarchy, row density, semantic colors, badges, whitespace, and footer placement.
- Focused comparison was not needed because the drawer itself is the focused component and all typography, icons, dividers, badges, and footer controls remain legible in the normalized comparison.
- Primary interactions tested in the simulator:
  - `今天` opened the schedule screen.
  - The settings icon opened the settings screen.
  - Accessibility inspection exposed all four workspace rows plus separate `打开个人档案` and `打开设置` controls.
- No red error overlay, clipping, overlap, or blank state appeared during the tested interactions.

## Comparison History

1. Initial implementation matched the four-row structure but displayed the raw Google identity `agenthubs` in the footer.
2. The footer was changed to use `mobileUserDisplayName`, which maps the canonical account to `小雨` while preserving other users' own names.
3. Post-fix evidence in `.tmp-ios-ai-drawer-option1-final.png` shows the corrected account label and no remaining P0/P1/P2 differences.

## Follow-up Polish

- P3: if a verified profile portrait is added later, the footer icon can use it without changing the drawer layout.

final result: passed

---

# iOS 行业分布六点环绕圆盘方案 1 Design QA

## Comparison Target

- Source visual truth: `/Users/xzhao/Projects/orbit/docs/designs/orbit-app/network-structure/2026-08-31-mobile-donut-redesign/01-six-point-focus-ring.png`
- Implementation top: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/03-structure-top.png`
- Food selected: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/11-final-after-review.png`
- Small industry selected: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/06-short-connectors.png`
- Full comparison: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/07-full-comparison.png`
- Focused comparison: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/08-focused-comparison.png`
- Route: `orbit://contacts/dashboard`
- Runtime: native iOS Simulator, iPhone 16, `393 × 852` logical points at `3x`

## State

- The source and final food-selected capture use `餐饮与食品`, `19 人`, and `24%` as the selected state.
- The live payload contains nine industries. The five largest visible anchors are accompanied by one `其他 4 个` aggregate, while all nine true sectors remain in the donut.
- The small-industry capture selects `制造与供应链`; the center and detail action update to `3%`, `2 人`, and the exact industry name.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Composition: six stable anchor zones surround one large centered donut. Labels no longer form a list or compete in nine radial lanes.
- Connectors: the first simulator pass exposed long diagonal leader lines. They were replaced with 22-point radial ticks, restoring the compact ring-like composition of the selected reference.
- Data fidelity: the chart preserves one sector per live industry. `其他` is a label-only aggregate and does not alter the source percentages.
- Typography: each anchor keeps the industry name plus `人数 · 百分比`; the center keeps percentage, exact selected label, and count. No selected capsule or hidden side panel is used.
- Interaction: major labels select directly. The `其他` label selects a real child, and every thin child sector remains independently tappable. Only the explicit detail action navigates.
- Accessibility: all six anchors are selectable buttons. The `其他` accessibility label enumerates its four child industries; decorative chart and connector SVG layers are hidden from VoiceOver.
- Large text: the frame grows through 1.6 system font scale, and pairwise slot-collision tests remain clear.
- Runtime continuity: the existing structure insight and relationship-health cards remain below the redesigned chart instead of losing real product information.

## Comparison History

1. The nine-label orbital implementation preserved all information but became visually crowded on an iPhone.
2. The first six-anchor build kept nine true sectors and reduced visible anchors to five major industries plus `其他`, but used long leader lines.
3. Focused comparison showed that the long lines weakened the ring composition. They were replaced with short radial ticks and verified again on the simulator.
4. Native interaction confirmed both the primary selection and an exact small-sector selection inside `其他`.

## Verification

- Focused layout, render, and source-contract tests: 16 passed, 0 failed.
- `npm run typecheck`: passed.
- Full iOS test suite: 721 passed, 0 failed.
- Native interaction: major anchor, aggregate anchor, exact center state, and dynamic detail action verified.
- Native accessibility tree: six complete anchor controls and the explicit detail action verified.
- Native simulator: no React Native error overlay, clipping, or label collision observed.
- Browser console check: not applicable to this native iOS implementation.

## Follow-up Polish

- P3: if future payloads regularly exceed roughly fifteen industries, review whether the `其他` aggregate should open a compact selector instead of relying on thin-sector tapping alone.

final result: passed

---

# iOS 四维结构环绕圆盘扩展 Design QA

## Comparison Target

- Approved visual direction: `/Users/xzhao/Projects/orbit/docs/designs/orbit-app/network-structure/2026-08-31-mobile-donut-redesign/01-six-point-focus-ring.png`
- Location, 12 groups: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/13-location-top.png`
- Role, final four-anchor layout: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/26-review-fix-role-full.png`
- Role, small sector selected: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/27-review-fix-small-sector-selected.png`
- Relationship, three-anchor layout: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/18-relationship-full.png`
- Relationship selection: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/visual-qa/option-1/19-relationship-selected.png`
- Route: `orbit://contacts/dashboard`
- Runtime: native iOS Simulator, iPhone 16, `393 × 852` logical points at `3x`

## State

- The live payload contains 9 industries, 12 locations, 4 roles, and 3 relationship states.
- Industry and location use five major anchors plus one `其他 N 个` aggregate while preserving every real donut sector.
- Role and relationship contain at most five groups, so every real group remains visible as its own surrounding anchor.
- Selecting `保持联系` updates the donut center and the explicit `查看保持联系分组` action without navigating away.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Consistency: all four structure dimensions now share the same chart composition, information hierarchy, selection model, and detail action.
- Density: visible anchors adapt to the real group count instead of forcing sparse dimensions into a six-point pattern or dense dimensions into a list.
- Data fidelity: `其他` remains a presentation-only aggregate; every source group keeps its own slice and exact selectable center state.
- Four-item layout: native inspection exposed long role labels entering the donut at the left and right midpoints. The anchors were moved to vertically offset quadrants; the complete label hit rectangles now stay outside the chart bounds, covered by a one-through-six-anchor regression test.
- Interaction: complete native accessibility labels remain available for every surrounding anchor, and relationship selection updates the center and detail action correctly.

## Comparison History

1. The first extension reused the six-point geometry for every dimension, leaving sparse layouts visually unbalanced.
2. Adaptive three-, four-, five-, and six-anchor patterns restored an intentional surrounding composition for each data shape.
3. The first four-anchor simulator pass revealed role-label intrusion at the donut's widest horizontal band.
4. The final staggered four-anchor pattern removed the overlap while keeping all role information visible.

## Verification

- Focused layout, render, and source-contract tests: 18 passed, 0 failed.
- `npm run typecheck`: passed.
- Full test suite: 723 passed, 0 failed.
- Native interaction: location, role, and relationship layouts inspected; relationship selection and the role's 9% `专业顾问` sector both update the dynamic detail action correctly.
- Native accessibility tree: complete labels for all visible anchors verified.
- Native simulator: no React Native error overlay, clipping, or remaining label collision observed.
- Browser console check: not applicable to this native iOS implementation.

final result: passed

---

# iOS 四维结构圆盘审视更正 Loop

> Historical result, superseded on 2026-08-31 after the user found that fixed
> text slots and disconnected sector ticks still made sector ownership unclear.

## Audit Scope

- Surface: `人脉分析 → 结构` 的行业、地区、角色、关系四个环绕圆盘。
- User goal: 在手机上快速理解真实占比，并可靠选择任意分组查看精确信息。
- Runtime: native iOS Simulator, iPhone 16, `393 × 852` logical points at `3x`.
- Audit mode: combined visual, interaction, and accessibility review.

## Accepted Evidence

1. Industry, 9 groups: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/01-industry-selected.png`
2. Location, 12 groups: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/02-location.png`
3. Role, 4 groups: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/03-role.png`
4. Relationship, 3 groups: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/04-relationship.png`
5. Aggregate child selected: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/05-industry-other-cycled.png`
6. Accessibility text size, upper chart: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/06a-industry-large-text-upper.png`
7. Accessibility text size, lower chart: `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/audits/2026-08-31-structure-orbit-loop/06b-industry-large-text-lower.png`

## Findings And Correction Loop

1. Visual composition: all four data shapes remain balanced, with no label collision, clipping, or list-like fallback. Status: healthy.
2. Data fidelity: the donut retains every real source sector; `其他` changes only the surrounding-label density. Status: healthy.
3. Interaction risk found: the 1%–3% sectors inside `其他` are too narrow to be the only reliable touch target. Severity: P2.
4. Correction: the existing 50pt-high `其他` anchor now advances through every represented real group on repeated taps, while direct sector selection still works.
5. Native retest: five consecutive aggregate taps produced `制造与供应链 → 零售与消费 → 医疗与健康 → 文化传媒与创意 → 制造与供应链`; the center and explicit detail action followed each exact selection. Status: healthy.
6. Accessibility: the aggregate control exposes the hint `重复轻触，依次查看其中每个分组`; all surrounding controls retain complete labels and selected state. Status: healthy.
7. Large text: at iOS `accessibility-medium`, labels grow to 80pt-high slots, preserve the ring composition, and remain outside the donut. Status: healthy.

## Remaining Risks And Evidence Limits

- No actionable P0, P1, or P2 findings remain in this surface.
- Screenshots and the native accessibility tree verify visible layout, labels, target frames, and state changes; they do not by themselves prove full WCAG compliance or every VoiceOver navigation gesture.
- If payloads grow well beyond the current 12 groups, repeat the audit with the new maximum data shape.

## Verification

- Focused layout, render, and source-contract tests: 19 passed, 0 failed.
- Full test suite: 724 passed, 0 failed.
- `npm run typecheck`: passed.
- Native aggregate cycle, explicit detail action, accessibility hint, and accessibility text-size layout verified.
- `git diff --check`: passed.

final result: passed

---

# iOS 扇区、引线与标签一一对应 Second Correction Loop

## Audit Scope

- Surface: `人脉分析 → 结构` 的行业、地区、角色、关系四个圆盘。
- Regression: 扇区中线短刻度没有抵达固定文字槽位，字体、颜色和扇区归属无法一眼确认。
- Runtime target: native iOS Simulator, iPhone 16, `393 × 852` logical points.
- Required data: the representative Xiaoyu dataset; the generic empty QA account is not acceptable chart evidence.

## Geometry Findings And Corrections

1. Root cause: the previous sector ticks used real angles, but the six text slots used a separate fixed pattern. Status: corrected.
2. Every visible callout now derives its zone from its own sector midpoint; one near-vertical sector may own the top and bottom positions, while the remaining sectors stay on their real left or right half. Status: corrected.
3. Every connector now runs directly from the sector midpoint ray to the matching color endpoint beside its text. Side endpoints may move inside their 16pt color-dot container so dense same-side connectors remain straight and do not cross. Status: corrected.
4. Exact text rectangles stay outside the protected donut radius at default and 1.6× system text. Status: covered by regression tests.
5. Side slots now reserve 74pt of height and enough copy width to show the full name, count, and percentage; metadata stays on one line by default and may wrap to two lines at larger text sizes instead of being truncated. Status: corrected.
6. A 100,000-sample distribution stress test found 1,193 same-side collisions in the first angle-derived draft and 623 connector crossings in a later draft. Stable same-side ordering, minimum-gap placement, and endpoint backtracking reduced the final result to 0 text overlaps, 0 out-of-bounds regions, and 0 connector crossings. Status: corrected.
7. The chart is about 5% smaller on the 393pt iPhone frame, restoring breathing room for the complete side labels while preserving a centered donut. Status: corrected.

## Verification State

- Focused layout and render tests: 18 passed, 0 failed.
- Full test suite: 730 passed, 0 failed.
- `npm run typecheck`: passed.
- Native authentication: password login confirmed for `agenthubs.app@gmail.com`; the password remains only in the ignored backend `.env.local` and is not recorded here.
- Native Xiaoyu evidence: accepted on iPhone 16 Simulator for all four dimensions and the relationship selected state.
- Accessibility evidence: every visible label exposes its complete name, count, and percentage, and measured logical hit frames are at least 95 × 60pt. Screenshot and accessibility-tree inspection do not establish complete VoiceOver gesture or WCAG compliance.

## Accepted Native Flow

1. Industry — 9 real groups, five leading labels plus `其他`, complete statistics visible. Status: healthy. Evidence: `.tmp/audits/2026-08-31-sector-label-alignment/51-industry-xiaoyu-final.png`.
2. Location — 12 real groups, no clipped or ellipsized side statistics. Status: healthy. Evidence: `.tmp/audits/2026-08-31-sector-label-alignment/52-location-xiaoyu-final.png`.
3. Role — 4 real groups, sector, color dot, leader, and label ownership remain clear. Status: healthy. Evidence: `.tmp/audits/2026-08-31-sector-label-alignment/53-role-xiaoyu-final.png`.
4. Relationship — 3 real groups, complete labels and balanced spacing. Status: healthy. Evidence: `.tmp/audits/2026-08-31-sector-label-alignment/54-relationship-xiaoyu-final.png`.
5. Relationship selection — tapping `保持联系` updates the selected slice, center summary, and detail action to 30 people / 39%. Status: healthy. Evidence: `.tmp/audits/2026-08-31-sector-label-alignment/57-relationship-warm-selected-final.png`.

final result: passed

---

# 2026-09-06 — 仅视觉调整：浅色 / 深色统一主题

## 范围与视觉依据

- 只改配色、按钮/输入框圆角、触控尺寸和局部间距。原文案、数据、照片、路由、操作、图表几何不变；不新增底部导航或主题设置。
- Source visual truth：仓库根目录 `docs/designs/orbit-app/visual-system/2026-09-06-unified-light-dark/visual-only/` 中的 `light-a.png`、`light-b.png`、`dark-a.png`、`dark-b.png`，及同目录 README/PROMPTS。旧探索图不作为实施依据。
- 这四张图是视觉讨论稿，不是逐像素规格。深色位图中的白字主按钮与 PROMPTS 中的浅灰靛底/深色字存在偏差；实现采用后者，并提高实际配对颜色的对比度。保留原生字体、真实照片与现有图表引线，不复制生成图的渐变、文字和图形误差。

## 原生证据与归一化

- Runtime：iPhone 17 Pro，iOS 26.4，402 × 874pt，3x；每张原生截图为 1206 × 2622px。
- Implementation screenshots：本项目 `.tmp/visual-qa/2026-09-06-themes/` 下的 `{light,dark}-{ai,drawer,today,inbox,events,analysis}.png`，共 12 张。
- Source boards：1536 × 1024px。逐页裁出内容区后等比缩放到 402px 宽；原生截图以 3:1 缩为 402 × 874，剔除顶部 62pt 和底部 34pt 的系统区域。未拉伸两者到相同高度。
- 同一 comparison input：上述目录 `compare-{light,dark}-{ai,drawer,today,inbox,events,analysis}.png`，左设计、右原生。12 组均已打开检查，而不是仅凭代码或分开看图下结论。
- Focused evidence：`focus-{light,dark}-{drawer,inbox}.png` 检查抽屉控件间距、统计标签与页签；图表标签在 402pt 对照中可读，并另核对原生完整截图及无障碍元素边界。
- 状态差异：现有账号不是图稿中的 qa；AI 现在有任务，Today 为 9 月 6 日、6 项待办/0 项日程；9 月 1 日活动已过期且当前标记取消，因此推荐卡不再显示；活动当前为即将 1 / 历史 12 / 全部 13。未改写数据或绕过这些状态来复刻旧截图。分析页滚动位置略有不同，保留当前原生图表几何。

## 比较发现与修正记录

1. 第一轮：[P2] 抽屉“新对话”和搜索框相接，图稿有明确间距。`AiScreen.drawerSearchBox` 增加 8pt 顶部间距。第二轮重新启动当前 JS 后重拍，`compare-light-drawer.png` 和 `focus-light-drawer.png` 确認控件已分开；深色同样复核。
2. 第一轮：[P2] 原有收件箱页签/搜索与分析页部分控件小于 44pt。局部增加到 44pt，不改按钮数量或行为。第二轮原生树确认：收件箱页签 164 × 44pt；分析页三段切换高 44pt、四维切换高 44pt、刷新 44 × 44pt、分组详情至少 44pt。
3. 代码与对比度审查：照片文字、白色照片徽章、扫码关闭控件不能复用会反转的按钮前景；已采用固定 `onImage` / `imageBadgeText`。账户错误状态采用成对主题色；任务编号及反色面板小字使用可读前景。配对色测试通过。
4. 没有待修复的 P0/P1/P2 视觉回归。可接受差异：正文保持现有原生字号/字重；统计列不增加装饰性分隔线；当前图表引线与布局优先于生成图；深色主按钮遵从文字设计目标而非位图的误差。

## 必查视觉面

- 字体与排版：保留系统中文字体及现有层级、行高、截断规则；未增加新字体。真实长任务继续单行截断，完整内容仍可打开；统计标签和图表人数/百分比无新增裁切。
- 间距与布局：输入框 14、主控件 12、共享卡片 16pt 圆角；头像、完成标记和图表圆点仍为圆形。共享卡片无投影；四项统计改成等宽单排，标签的原生 y 坐标均为 293.33pt，中心 x 为 75/159/243/327pt。
- 颜色与状态：暖白/炭灰背景、低饱和灰靛与语义色；主文字、次级文字、错误和主操作的配对颜色覆盖 4.5:1 测试。禁用发送仍呈灰色；启用发送可区分。
- 图像与图标：保留原照片和 Ionicons。活动缩略图内部同坐标区域的浅/深色像素完全相同；未人为压暗照片。所有控件图标保持原职责，无占位图或新增装饰图形。
- 文案与内容：代码审查未发现文案、数据请求、事件处理、路由或控件增删。日期与数量变化来自现有数据/时间，不是主题实现。

## 交互与回归

- 抽屉打开、关闭和“今天”跳转正常；切换系统外观时抽屉保持打开。
- 收件箱四项统计同排；待处理/对话可切换。输入 `Orbit` 后切换深→浅仍保留查询与空结果，证据 `dark-inbox-search.png` / `light-inbox-search.png`；临时查询已清除。
- AI 未发送草稿 `ThemeCheck` 在浅→深后仍保留，发送按钮从禁用变为可用，证据 `light-ai-draft.png` / `dark-ai-draft.png`；未发送，临时草稿已清除。
- 活动选择“全部”后切换外观仍显示 13 场，证据 `light-events-all.png` / `dark-events-all.png`；照片不变。
- 角色图选择“业务拓展”后切换外观仍为 21 人 / 27%，详情入口保持“查看业务拓展分组详情”，证据 `light-analysis-selected.png` / `dark-analysis-selected.png`。最终对照恢复运营与专业角色 37 人 / 47%。
- 新增真实渲染测试覆盖卡片、错误恢复、空态、加载态、图表、未知外观回退以及浅深缓存隔离。收件箱内部统计组件未为测试而导出或重构；布局用原生坐标与截图验证，属于对原计划测试手段的限定调整。
- `npm test`：738 passed，0 failed；`npm run typecheck`、`git diff --check`：通过。原生构建：Build Succeeded，0 errors，0 warnings。
- 独立代码审查未发现 hook 顺序、过期颜色闭包、业务逻辑或路由回归；已处理指出的对比度问题。
- GitNexus：`orbit` 名称有多个工作区，最终以完整仓库路径复核。共享组件仍属 CRITICAL 范围（AppScreen 49 个直接调用/10 条流程；DataCard 110/11）；全量回归和原生检查覆盖本次变化。变更检测只映射到本应用符号，未改后端实现。

## 验证边界

- 本次为原生 iOS QA；浏览器控制不可用，未用其他浏览器自动化替代。浏览器 console 不适用于这份原生验收；Metro 与原生画面未出现 JS 错误覆盖层。
- 推荐卡当前无可显示数据，因此其两个动作未做本次真机点击；保留原 JSX/处理函数，并由现有测试约束。未发送消息、完成任务、记下推荐或修改业务数据。
- 未宣称完整 VoiceOver 手势、所有动态字号、iPad/Android 或所有屏幕尺寸均通过。其他页面完成主题接线与回归测试，不等于逐页原生视觉验收。
- 截图及构建产物保留在忽略目录；未提交或发布。

final result: passed

---

# 2026-09-06 — 追加原生触控与动态字号复查（未收敛）

本节是后续检查，更新上节“没有待修复 P2”的结论；上节通过仅代表其当时验证的范围，不代表整个五轮目标完成。

## 依据与边界

- 已完整读取原仓库的 [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md) 与 [apple-design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)，将触控尺寸、清晰反馈和系统字号原则用于现有原生 UI；不引入网页 CSS、手势或功能重组。
- 延续已批准的 44pt 触控基线及 12pt 控件圆角。新的浅色蓝色候选尚未获选，不改当前主题色。
- 运行环境仍为 iPhone 17 Pro / iOS 26.4 / 402 × 874pt。证据位于本应用 `.tmp/visual-qa/2026-09-06-loop-audit/`，不是仓库根目录的 `.tmp/`。
- 本次仅新增两处样式修正（三个属性值）；其他主题改动属于之前的工作。未发送消息、完成任务或忽略提醒，未修改业务数据、路由与事件处理函数。

## 两个已闭环的增量改进

| Before | After | Why |
| --- | --- | --- |
| Today 六个完成按钮的原生 frame 为 40 × 44pt，44pt 断言失败 | `checkButton.width` 从 40 改为 44；六个 frame 均为 44 × 44pt，浅深色断言通过，圆形标记仍为 20pt | 达到已批准的触控尺寸，不扩大视觉图标 |
| 收件箱六个“忽略”按钮为 63 × 30pt，44pt 断言失败，仍用胶囊圆角 | `minHeight` 从 30 改为 44，圆角改为 `radius.control`；六个 frame 均为 63 × 44pt，浅深色断言通过 | 提升触控容错并落实既定控件圆角 |

每个增量均经历 planner（核对既定标准）→ examiner（原生 frame 断言 RED）→ improver（最小样式修正）→ examiner（同一断言 GREEN 和截图复查）。这只记录两个新增闭环，不把页面巡视算成改进轮次。

- Today 证据：`01-today-before.png`、`01-today-after.png`、`01-today-dark-after.png`。长任务仍按现有规则截断；重启后的返回/主页图标差异来自导航历史，不是这次改动。
- 收件箱证据：`03-inbox-alerts-before.png`、`03-inbox-alerts-after.png`、`03-inbox-alerts-dark-after.png`。40 条提醒保持不变；只有首个按钮位于当前视口，其余 frame 来自原生树，未把树中存在等同于全部同时可见。
- GitNexus upstream：`TaskRow` 为 LOW（1 个直接调用者 TodayWorkspace、0 条流程）；`AlertDismissButton` 为 LOW（1 个直接调用者 AlertsCard、0 条流程）。新 `useStyles` 名称尚未被索引，旧 `styles` 的 LOW 结果不当作新符号完整覆盖；辅以源码使用点检查。
- 独立审查仅覆盖这三个新增样式值及对应截图：无发现；不将其解释为整个主题迁移或动态字号问题均通过。

原生断言采用 `uv --cache-dir /tmp/orbit-theme-uv-cache run --project /Users/xzhao/.local/share/uv/tools/fb-idb idb ui describe-all --udid 9BF990F2-45B8-42CE-8543-E583B941DA17` 输出：Today 按 `AXLabel.startsWith("完成待办：")`，收件箱按 `AXLabel === "忽略"` 取元素，分别断言数量 6、宽高均至少 43.99pt（浮点容差）；收件箱另断言页面仍有“40 条提醒”。修正前分别由宽 40 和高 30 触发失败，修正后浅深色均通过。

## 其他观察与未完成项

1. **[P2 / OPEN] 抽屉打开期间切换系统字号会裁字。** 先在 `large` 打开抽屉，再设 `accessibility-medium`，文本绘制变大但原生布局仍保持旧 frame，标题、导航与页脚裁切。关闭再打开可恢复完整排版。证据：`05-drawer-large-type.png` 与 `05-drawer-large-type-reopened.png`。已缩小到“打开的 Modal 内实时字号变化”这个触发条件，根因尚未确定；未用限制字号、强制重挂载或改业务状态掩盖问题。
2. 活动默认/展开筛选及大字号、收件箱大字号统计/对话、AI 默认首页已检查：`02-events-before.png`、`02-events-expanded.png`、`02-events-large-type.png`、`03-inbox-large-type.png`、`04-ai-default.png`。这些状态未发现需要新增修正的问题，不构成额外改进轮次，也不证明所有字号或 VoiceOver 手势通过。
3. 分析页默认/结构及深色检查：`06-analysis-default.png`、`06-analysis-structure.png`、`06-analysis-dark.png`。结构截图已向下滚动，顶部标签越过视口，不用它证明顶部完整可见；本次未改图表几何。
4. 仍需核实完整的至少五轮 planner → examiner → improver 证据，并修复/验收未解决问题，才能宣称收敛。新的浅蓝方案等待用户选择，未擅自实施。

## 最新验证

- `npm test`：738 passed、0 failed、0 skipped（本次最终重跑约 4.87 秒）。
- `npm run typecheck`：退出码 0。
- Today / 收件箱新增触控修正：浅深色原生断言通过，截图已打开检查。
- 模拟器已恢复 `appearance light` / `content_size large`。未提交、推送或发布。

final result: incomplete — 两个增量修正通过；实时大字号裁切与完整五轮验收仍未完成。

### 动态字号问题的后续定位：打开时序，而非持续打开状态

以下诊断没有修改应用源码或依赖，也不计作一次已完成的 UI 改进。

- 抽屉已经稳定显示后，`large → accessibility-medium → large` 重复切换，200ms 和随后 1500ms 的原生采样均正常。标题从 89.33 × 30pt 变为 158.33 × 53.67pt；“今天”入口从 82pt 增高为约 97.67pt。证据：`07-drawer-live-type-recheck.png`。
- **已捕获的失败时序**：在默认字号、AI 首页、抽屉关闭时，执行 `idb ui tap 34 92` 后立即执行 `simctl ui … content_size accessibility-medium`，不等待淡入结束。字号变大，但标题 frame 仍为 89.33 × 30pt、“常用入口”仍高 14.33pt；等待后仍裁切。证据：`07-drawer-during-open.png`，与先前 `05-drawer-large-type.png` 一致。随后同一 AI 页面上的两次立即重开试验均正常，因此这不是“立即切换就必现”；首次呈现/节点挂载状态仍是待隔离变量。
- **后台返回路径**：保持抽屉打开，启动 `com.apple.Preferences`，通过 simctl 改字号，再启动原 Orbit 进程（没有 terminate/relaunch），标题恢复为 158.33 × 53.67pt、文字完整。证据：`07-drawer-return-from-settings.png`。这是模拟器上的后台字号变更验证，不等同于已经手动操作系统设置滑块或穷尽控制中心路径。
- 本地 React Native 0.86.0 源码显示：`RCTFabricSurface` 收到字号通知后更新 `fontSizeMultiplier`；`SurfaceHandler::constraintLayout` 在倍率改变时使可测量节点重新布局；Modal 呈现过程中另经 `boundsDidChange` 更新状态。观测支持“Modal 打开与字号刷新之间的时序问题”，但尚未用原生 instrumentation 证明是哪次提交覆盖/遗漏了测量，不能把推测当作确定的框架根因。
- 因此将此前笼统的“抽屉打开期间切换字号会裁字”收窄为“**抽屉呈现期间立即切换字号可裁字**”。保留 OPEN；未通过限制字号或强制重挂载规避。移除淡入仅是待授权、待验证的候选，不宣称能修复。
- 诊断结束恢复浅色 / 默认 `large` 字号、关闭抽屉。未发送消息或修改任务/提醒。
- 补充限制：三个固定等待 2.5 秒的冷启动试验未成功打开抽屉（`isDrawer=false`），属于无效试验，不作为裁切失败证据。随后确认 AI 首页“打开侧栏”存在后再试，冷启动首次立即变号也正常。因此首开本身不是充分触发条件；保留“呈现与字号刷新时序相关”的推断，不将其升级为已经完全确定的根因。
- 独立 examiner 与上述判断一致：未发现能解释时序差异的确定性样式约束；具体原生提交/缓存失效机制未证实。其提出的“仅按字号重挂载 panel 子树”也未实施，因为仍需验证焦点/滚动等原生状态是否受损，不能用保留父级 React state 代替完整状态保留证明。
- 蓝色预览已补存：仓库根目录 `docs/designs/orbit-app/visual-system/2026-09-06-vivid-blue-options/`，含原生参考、三张独立样本、显示顺序与提示词。等待选色；不再依赖此前未可靠落盘的预览，未改当前应用主题。

# 2026-09-06 — 已选 Ocean-blue：浅色主题配色增量

## 范围与依据

- 用户已明确选择「ocean-blue」并要求实现；此前的等待选色状态到此解除。
- Source visual truth：仓库根目录 `docs/designs/orbit-app/visual-system/2026-09-06-vivid-blue-options/ocean-blue.png`。本次只实施配色，不重新解释布局、字体、文案、功能或深色方案。
- 应用代码只调整 `src/design/tokens.ts` 的七个浅色值：accent `#006DB8`、hover `#0060A3`、press `#00528F`、ring `rgba(0,109,184,0.32)`、soft `#E3F2FC`、softer/tint `#EDF8FF`。保留其他语义色和整个 darkColors。
- GitNexus upstream 对 colors 返回 LOW、0 个直接调用者、0 条流程；常量引用图不等于完整覆盖，已按全局共享配色检查实际消费者。

## 视觉证据与比较

- 原生环境：iPhone 17 Pro / iOS 26.4，402 × 874pt，@3x 截图为 1206 × 2622px，浅色 / large 默认字号，抽屉打开且未输入搜索。
- 源图为 851 × 1848px，按宽度归一至 402 × 873px；原生归一至 402 × 874px。两者裁去顶部 62pt 安全区以排除系统状态栏，不拉伸 app 内容。
- 证据目录：`.tmp/visual-qa/2026-09-06-ocean-blue/`。已打开完整并排图 `compare-source-drawer.png`、重点区域 `focus-source-drawer.png`，以及同一原生布局的前后对比 `compare-before-drawer.png`。
- 原生截图：`drawer-before.png`、`drawer-after.png`、`drawer-dark.png`、`ai-after.png`、`inbox-after.png`。抽屉、首页下一步卡片、收件箱选中态与主按钮已显示新配色；切换深色后仍为既有配色。抽屉进入收件箱、返回导航正常，40 条提醒 / 6 段对话未变化；未发送消息或修改业务记录。
- 字体与排版：原生前后标题、按钮、导航、近期对话的字重、换行与布局一致；不照搬生成图轻微变化的文字渲染、间距和图标笔画。
- 颜色：主蓝色比生成预览更深是明确的可读性调整。预览目标 `#0077C8` 对 `#EDF8FF` 为 4.35:1，低于小字号文字 4.5:1；实际 `#006DB8` 对白色为 5.41:1、浅蓝底为 5.02:1、soft 为 4.74:1、surface3 为 4.57:1。无新增渐变；收件箱灰色图标、人脉 sky 与活动 live 语义色继续沿用原生基线。
- 图像与内容：无新增栅格资源，保留既有图标库、头像、全部文案及数值；对比截图仅为 QA 证据，不作为应用资源。

## 检查结果与限制

- TDD：新增实际组件渲染测试先在旧灰蓝 `[89,100,134]` 上按预期失败，更新主题后通过。测试核对真实重试按钮的浅色 RGB、深色 RGB 和小字号对比度。
- 全套 `npm test`：739 passed、0 failed、0 skipped；`npm run typecheck`：退出码 0。
- 独立只读审查：本次七个 token 和新增测试无 Critical / Important / Minor 发现；审查者独立运行主题渲染文件 6 项测试通过。
- 本次首次归一化视觉比较没有发现需要修改的范围内 P0/P1/P2 差异，没有把截图数量计作额外改进轮次。渲染测试覆盖错误态；未穷尽全部屏幕、原生按压态或 VoiceOver。
- 既有「Modal 呈现期间立即切换字号可裁字」仍 OPEN，完整五轮验收也未在本次补齐；本节通过仅指已授权的 Ocean-blue 配色增量，不代表原整体目标收敛。
- 实施清单：浅色共享配色已更新；布局与业务逻辑未改；深色核对完成；模拟器恢复浅色默认字号；未提交、推送或发布。

final result: passed

# 2026-09-07 — 首页两条问题引导（单项接入）

## 范围与视觉依据

- 用户已结束此前整体改进循环，选择 question-starters，批准动态选题策略和 v2 画面，并要求「接入」。本节仅验收首页引导，不重启旧循环，也不把旧问题标为解决。
- Source visual truth：`docs/designs/2026-09-07-ai-home-guidance/question-starters-v2.png`，852 × 1847px。
- 原生实现：`.tmp/home-guidance/native-restarted.png`（浅色），`.tmp/home-guidance/native-dark.png`（深色）；iPhone 17 Pro / iOS 26.4，402 × 874pt，1206 × 2622px，@3x，默认 large 字号，首页、空输入、键盘关闭。
- 原图按宽度等比归一至 402 × 871.49pt；原生归一至 402 × 874pt。完整同输入并排证据：`.tmp/home-guidance/comparison.png`；引导局部并排：`.tmp/home-guidance/comparison-focus.png`。两张均已打开检查。诊断画布不参与应用渲染。
- 生成参考省略了系统状态栏，原生仍保留 62pt 顶部安全区和底部安全区；不把 OS 区域差异当布局缺陷。局部比较分别从源图 y=375pt、原生 y=417pt 对齐引导区，保持同宽，检查标题、两行文字、分隔线及箭头。
- 下一步数量已由真实服务返回 7，源图为 6；可见三个任务仍来自原生服务，不把图稿数值写回数据。原有卡片、导航、composer 的几何、主题与文案差异不属于本次重做范围。

## 五项视觉检查

- **字体与排版**：沿用系统中文字体，问题 16pt / 24pt 行高，提示标题 13pt / 20pt，层级清楚。局部对比中原生问题文字略大于生成稿，保持既有可读性；两个默认问题均完整单行，长的准备类模板允许自然换行，不做省略。
- **间距与布局**：卡片下留 28pt，问题行最小 60pt，左右随原有 24pt 页边距。问题位于同一滚动区；键盘展开时可向上滚动到两条问题，底部输入与发送独立保留。原生检查测得行高均 60pt，触控区超过 44pt。
- **颜色与 token**：使用既有 paper/text/text3/border。Ocean-blue 卡片不变；深色使用既有深色映射，文字、箭头和输入控制均可辨。原生细分隔线比生成稿淡，符合当前 token，不影响行区分，视为可选 P3 精修。
- **图像与图标**：此区域没有新增栅格图，采用现有 Ionicons 的 arrow-up 旋转至左上，未用手绘符号或截图模拟交互。保留原有导航/卡片图标。
- **文案与内容**：「试着问我」＋两个不同类型问题，与选定方向一致；不再显示默认长欢迎段和 09:00 时间戳。不复制具体待办，也不声称存在未核实的报名或跟进。

## 交互及代码验证

- 点击第一条，原生 TextArea.AXValue 为「今天先处理哪些事？」；点击第二条后为「最近有哪些活动适合我？」。仍显示首页两个问题及三个待办入口，发送按钮由禁用变为启用，没有自动发送或导航。证据：`.tmp/home-guidance/native-prefill.png`。
- 深色默认页已检查；键盘展开并滚动后，再次点第一条可直接替换草稿，不需先收起键盘。证据：`.tmp/home-guidance/native-dark-keyboard.png`、`.tmp/home-guidance/native-keyboard-prefill.png`。发送按钮原生 frame 为 x=333、y=478、44 × 44pt，底边 522pt；截图中键盘上边约 540pt，输入控制可见且不被遮挡。iOS accessibility 树未报告标准 Keyboard 类型，因此键盘上界来自截图检查，不冒称自动识别键盘通过。
- TDD：首页真实渲染用例先出现 9 个期望的缺失行为失败、1 个真实消息保留通过，再实现至 10 项通过；快照状态先 3 项失败后通过；默认 assistantMessage 兜底单独先失败后通过。
- 选题覆盖：高优先级/到期开放事项、未来会面/活动、人脉跟进、通用兜底、无效/完成/取消记录。使用既有合同类型解码，不加网络调用或模型调用。
- 稳定性：首次就绪固定；后台覆盖不换题；显式刷新完成才重选；账户/服务器变更等待新资源周期。独立审查发现「此前刷新过后，换账户只经历 refreshing 而非 loading」会卡在通用题，已用失败→通过回归测试修复，仅改首页快照函数。
- 最终全量测试：769 passed、0 failed、0 skipped；`npm run typecheck` 退出码 0；`git diff --check` 通过。独立定向检查 46/46，通过且无剩余 Critical / Important / Minor。
- GitNexus：AiScreen LOW / 0 个图中直接调用者；ChatTranscript LOW / 1 个直接调用者 AiScreen；orbitAiHomeChatWindow LOW，图未列调用者，但源码可见首页消费，按此覆盖。新快照函数尚未索引，返回 UNKNOWN，手工检查唯一生产调用者 AiScreen。没有将图中零引用误称为无影响。

## 比较历史、限制与交付

- 首次规范化全页与局部对比没有发现范围内 P0/P1/P2 视觉问题；没有为了增加轮数而修改已匹配的视觉。之后只修复账户刷新状态判断，未改变布局或样式。
- 最后尝试重拍时 Simulator 已被用户切至设置和侧栏；该 `native-final.png` / `comparison-final.png` 是错误页面状态，明确排除，不作为首页验收证据。观察到界面活动后停止全部模拟器操作，不强行导航或清空用户输入。
- 上述有效首页、深色与键盘证据已经齐全。账户实际切换链路由纯状态回归测试验证，未在用户账户上反复登录。没有做真实发送、VoiceOver 完整手势、所有大字号/设备测试；不声称这些项目通过。旧 Modal 字号问题不在本项授权范围。
- 完成清单：两种问题动态选择；空态兜底；停留稳定；显式刷新；精确欢迎过滤；只填入不发送；浅深色/键盘检查；审查修正；保留本地工作。没有提交、推送、发布或改写业务记录。

final result: passed

# 2026-09-08 — 原生邮件式收件箱

## 比较目标与证据

- 用户批准改后设计，并授权收件箱直接修订、实施；名称固定为「收件箱」。范围只有原生收件箱列表、阅读/草稿体验与对应文案，不包含另外两张联系人设计的实施。
- Source visual truth：`docs/designs/2026-09-08-redesigned-screens/04-inbox-mail-revision.png`，851 × 1847px，约 402 × 873pt 的纯 App 内容。
- 实现：iOS Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17`，原生 402 × 874pt，截图 1206 × 2622px，密度 @3x。默认浅色、消息页签、无搜索词、实际历史数据。
- 证据目录：`.tmp/inbox-mail-qa/`。最终列表 `orbit-inbox-mail-final.png`；深色 `orbit-inbox-mail-dark.png`；提醒 `orbit-inbox-mail-reminders-final.png`；键盘编辑 `orbit-inbox-mail-compose-keyboard.png`；详情 `orbit-inbox-mail-thread-final.png`。
- 规范化：参考等比缩至 402px 宽；实现去掉顶部系统安全区 62pt（186px），再 @3x→@1x。全视图比较共同可用的 402 × 812pt 内容区，未压扁状态栏或重绘系统控件。
- 已打开同一张并排证据 `full-comparison-final.png`；另打开 `orbit-inbox-mail-comparison-final.png`（首三条区域，820 × 620px）和 `orbit-inbox-mail-comparison-detail.png`（搜索、页签、首条，820 × 250px），不是仅凭路径判断。
- 状态差异：参考只画三位联系人；真实列表继续展示后续联系人，不截断成三条。真实姓名「山田千尋」不按生成图简化字改写；历史六月日期保持原值。差异属于真实内容保留，不是设计遗漏。

## 五项视觉核对

- **字体/文字层级**：原生 SF/PingFang，标题 30/38pt，姓名 17pt semibold，主题 15pt regular，预览 14/21pt、时间 12pt。已核对中文换行、截断和正文层级；没有新增字体包。
- **间距/布局**：20pt 水平边距、开放分隔行、126pt 最小行高，去掉统计和双层卡片。搜索与页签顺序和首行位置已调整至参考附近。44pt 可编辑搜索区有意略高于生成图，不牺牲触控尺寸匹配约 37pt 的图中搜索框。
- **颜色/令牌**：沿用现有白色 surface、Ocean 蓝主操作、灰阶正文和边线；深色仍用项目已有深色令牌。没有把本轮浅色目标擅自推广成新的深色配色。
- **图像/图标**：参考没有照片、头像或插图，不需栅格资产。返回、写消息、搜索使用项目 Ionicons；没有截图当 UI、伪头像、手绘 SVG 或装饰图形替代。
- **文案/内容**：标题统一收件箱；消息/提醒分开；草稿始终称预览且明确未保存/未发送。实际多语种消息保留原文，只过滤已确认的合成占位与操作指令。无正文记录注明数量且可展开，不删除数据。

## 比较历史与修正

1. **P1 内容错误**：初拍 `orbit-inbox-mail-first.png` 暴露已知 `Follow up about … with a concrete next step.` 合成提示。检查现有服务对应模板后，加入精确占位识别与保留真实多语种文本的回归；第二张截图不再冒充收到的邮件。
2. **P2 布局节奏**：`orbit-inbox-mail-comparison.png` 显示首行比参考低约 16–20pt。标题下距 18→12pt、页签上距 14→8pt、页签高 48→44pt；最终全视图与局部并排证据重新核对，没有剩余可操作的 P0/P1/P2。
3. **P2 提醒空占位**：`orbit-inbox-mail-reminders.png` 先出现大块空线索卡，推低真实提醒。现在仅在有线索、加载或错误时显示线索区域；提醒改为分隔行。最终提醒实拍与 AX 树确认 40 个忽略入口，不再只渲染前六条。
4. **P1 无正文历史淹没阅读**：`orbit-inbox-mail-thread.png` 显示满屏重复空正文。现在默认收起这类记录、注明 13 条并提供展开按钮；`orbit-inbox-mail-thread-final.png` 中联系人、记录说明、回复与隐私入口在可用范围内。测试验证展开/收起十条无正文记录，不静默丢弃它们。
5. **功能审查修正**：加载/离线/失败时写消息入口导致无返回路径，以及预览缺少收件人，均有失败→通过测试；独立审查者再次运行四个定向用例确认修复。列表无障碍名称也补全时间、预览和未读数。

## 验证、限制与交付

- 最新完整 `npm test`：817 passed、0 failed、0 skipped；`npm run typecheck` 退出 0；`git diff --check` 通过。
- 十个浏览器交互用例执行真实 RN Web 屏幕/事件处理/View-model，只替换导航、原生模块和 HTTP 边界。覆盖搜索姓名/公司/主题/正文与无匹配、提醒全部显示和本次忽略、编码后的详情导航、独立编辑/取消、空主题正文、预览失败保留输入、收件人、继续编辑、等待期间锁定、加载/离线/失败可返回、本地回复预览、隐私展开和无正文历史展开。
- 原生 AX：返回/写消息均 44pt 高；搜索输入本身 44pt；消息/提醒各 44pt；列表宽 362pt、最小高 126pt；提醒忽略按钮高 44pt。输入编辑页从空白主题、正文开始。
- 原生键盘：正文聚焦后系统键盘正常出现，编辑区保持可见，内容可滚动；底部动作不是固定栏。默认位置动作下缘靠近键盘，取消点击已实测；未声称所有键盘/字号组合均已验证。完整 VoiceOver 手势、极端动态字号和所有设备尺寸未测试。
- GitNexus：页面/列表/编辑组件为 LOW（0–2 个直接调用者）；`localizeSubject` 和 `localizeDraftReply` 为 HIGH，分别影响列表/详情与详情/新建预览，修改前已告知风险并覆盖回归。新建局部布局/文本助手尚无索引项，返回 UNKNOWN，已按其实际局部调用关系检查；没有将 UNKNOWN 宣称 LOW。未提交，因此未触发提交前 detect_changes 门禁。
- API 边界：沿用已有收件箱、提醒、线索、润色、隐私接口；新消息接口仅返回非持久化预览。没有新增真实发送、草稿持久化、归档、星标、删除或标记已读能力。上述缺口不以假按钮填充；UI 明确未保存/未发送。本次没有改业务数据、提交、推送或发布。
- 所有证据保存在本地 `.tmp/`，不提交；模拟器回到新版收件箱，现有本地服务保持运行。联系人两页仍为前一阶段静态设计，不冒称已实现。
- P3：生成图的笔画/抗锯齿与系统字体、行内垂直间距存在小幅差异；保留原生字体和真实内容，未为低优先级像素微差继续迭代。

final result: passed

# 2026-09-08 — 联系人列表与详情原生实施

本节更新前文的实施状态：联系人两页已完成，收件箱保留上一阶段实现。用户已批准 01/02 号视觉稿并要求继续实施，无新增设计选择、后端能力或发布。

## 目标、规范化与证据

- Source visual truth：`docs/designs/2026-09-08-redesigned-screens/01-contacts-list-after.png`（851×1848）及 `02-contact-detail-after.png`（851×1849）。
- 原生 iPhone 17 Pro，402×874pt、1206×2622px @3x，默认 large 字号。参考等比缩至 402 宽；实现扣除顶部 62pt 系统安全区，比较共同 402×812pt 内容区域。并排文件为 1640×1748px @2x，右侧底部余量留白，未拉伸或绘制系统状态栏。
- `.tmp/contacts-redesign-qa/`：最终 `list-final.png`、`detail-final.png`；全视图 `list-comparison-second.png`、`detail-comparison-final.png`；局部 `list-comparison-focus.png`（前三行）、`detail-comparison-focus.png`（主操作/摘要/合作内容）。均已实际打开比较。
- 真实列表超过参考中的七人，继续展示后续记录，不为匹配静态图截断数据。详情在真实安全区内需稍向上滚动才能看到「更新联系人」；`detail-bottom.png` 验证两个入口均完整可达。原生控件没有固定在屏幕底部。

## 五项视觉核对与迭代

- 字体：原生 SF/PingFang；列表标题 28/36、姓名 17/24；详情姓名 24/32、下一步 18/27、正文 14/23。保留真实文本；生成字体与原生字形、抗锯齿微差为 P3。
- 布局：22pt 页面边距，人物约 70pt 分隔行；无搜索外框、人物外框、身份卡或摘要卡。主操作宽 358、高 50pt；返回、搜索输入和两个搜索按钮均至少 44pt。
- 颜色：沿用 surface、蓝色主操作与灰阶评分，深色继续用既有令牌，不修改全局主题。
- 资产：沿用真实头像资源与项目原有首字头像回退，和参考一致；图标用 Ionicons，无新增照片、虚构人物、截图式 UI 或手绘资产。
- 内容：搜索/筛选/起草与详情折叠顺序保留；暂无互动保持空态。没有为了视觉匹配改写联系人数据。
- 第一轮 P2：列表顶部比参考多占约 20pt（`list-comparison-first.png`）；搜索区间距 16→8pt，并恢复筛选间的短分隔。第二轮全图与局部对照通过。
- 第一轮 P2：详情下一步铺成一行（`detail-comparison-first.png`），主操作与内容节奏偏移。限制正文宽度 242pt、调整局部间距和主按钮圆角；最终并排图确认两行结构、主操作和内容层级。捕获到热更新中间帧时重新采集，不把刷新遮罩当作最终证据。

## 验证和边界

- 最新 `npm test`：824 passed、0 failed、0 skipped；TypeScript 退出 0；diff 检查通过。
- 新增七个真实 RN Web 交互测试：可编辑搜索/清空、联系人导航、320pt 窄屏操作及图标/文字容纳、两个搜索接口请求、四个筛选展开和行动过滤、全宽起草路由且无发送、资料/编辑展开与草稿保留、失败保存保留输入、无历史的离线返回。
- 独立审查无 Critical/Important；按其 Minor 建议给原生图标测试替身保留真实尺寸，并补按钮内文字边界检查。旧源码断言中的 eyebrow 要求已由实际导航测试替代。
- 原生额外证据：`list-dark.png`、`detail-dark.png`、`list-large.png`（extra-extra-extra-large，筛选展开）、`filter-dark.png`（行动已选）、`expanded.png`、`editing.png`、`editing-keyboard-dark.png`。仅查看、筛选和聚焦；未执行真实保存、归档或发送。
- 键盘不是固定动作栏，编辑区可滚动；未覆盖所有字号/键盘组合、完整 VoiceOver 手势和所有设备。旧编辑区小型次要按钮保留既有尺寸，不声称全面无障碍认证。
- GitNexus：页面组件 LOW，列表/详情样式入口 HIGH（15/17 个直接调用者），修改前已报告并核对局部消费者；新 ContactPage 无索引项为 UNKNOWN。未提交，未触发提交前 detect_changes 门禁。原有脏工作保留。
- 完成清单：按图实现、保留交互、失败→通过回归、全套测试/类型检查、全图及局部对照、原生状态验证、独立审查、本地交付。无剩余可操作 P0/P1/P2；字形和小幅间距差异为 P3。

final result: passed

---

# 2026-09-09 — 全 App 视觉统一：改进循环与最终覆盖交接

本节只追加本轮可追溯证据，不改写前面的历史结论。`planner → examiner → improver → examiner` 的一次循环必须同时有明确标准、可复现失败、最小修正和同一标准的复验；任务编号、路由数量或截图数量本身不算循环。前五个循环来自 controller 的 `loop-evidence-audit.md`；当时仍待审的 Task 3–5 领域修补，现已由各自最终报告和独立复审闭合。领域闭合不代表 whole-app convergence：原生运行中改变 Dynamic Type 后的陈旧 frame 仍为 **OPEN**，auth/profile 软件键盘仍为 **UNPROVEN**。

## 可追溯循环摘要

1. Today 44pt 触控：六个完成目标的原生宽度断言以 40pt 失败；宽度最小修为 44pt 后，同一六目标浅/深色 frame 断言与审查通过。证据：本文件前文 `2026-09-06 — 追加原生触控与动态字号复查`。
2. 历史 inbox 44pt 触控：六个忽略目标以 30pt 高失败；最小高度增至 44pt 后同一断言通过。此记录只说明当时版本；inbox 后来按用户批准方案重做，不能把历史截图当当前验收。
3. 共享基础：七个真实 consumer 分别暴露标题裁切、卡片边框、17pt 输入、Settings 宽度和 48pt recovery 主动作；共享 layout/text/control、`AppScreen`、`DataCard` 和 state presentation 修正后七项转绿，20 项覆盖及独立审查通过。证据：`tests/app-wide-primitives.test.ts`、`task-1-report.md`。
4. 联系人分析 Dynamic Type：原生 62%/37% 被省略且 320pt doubled-text 复现；移除相关本地行数限制、保留图表数学后，同一真实 consumer 显示完整值/解释，原生复查与 Task 2 复审通过。证据：`tests/app-wide-contacts.test.ts`、`task-2-report.md`。
5. 未路由 graph evidence form：独立审查发现透明/零圆角/无 12pt padding 且唯一提交动作不是 50pt primary；改为 inset 表面和共享 primary 后，真实 GET 与失败 POST 草稿保持在浅/深色通过，复审确认三项 findings 均关闭。证据：`tests/app-wide-contacts.test.ts`、`task-2-fix-1-review.diff`。
6. Event center 窄屏动作：320pt 下主要“查看活动”只有 114.53125pt 而非 276pt 内容行；主动作改为整行、次动作独立后，doubled-text 下所有目的地保持可读可点。证据：`tests/app-wide-events.test.ts`、`task-3-report.md`。
7. Home events/hub：独立审查发现 events 模式标题重复且 legacy hub 没有真实 render 回归；events eyebrow 以一行最小修正移除，并增加实际 `HomeScreen mode=hub` 的 320pt 浅/深/大字、输入/导航/无写入覆盖。最终 36/36、类型与 diff 通过，复审关闭。证据：`tests/app-wide-events.test.ts`、`task-3-report.md`。
8. 日历大字：46pt 小时 gutter 让 `09:00` 在 2x 文本下换成两行，43pt agenda 时间栏也让时间/标题裁切；以 native `fontScale` 扩大水平 gutter/offset，并在 >1.3 时让 agenda 重排。相同测试确认时间单行、标题完整且 64pt 小时高度及 event top/height 不变；领域审查和冷启动大字原生复核闭合。运行中字号变化问题是另一项 OPEN 标准。证据：`tests/app-wide-workspaces.test.ts`、`task-4-report.md`。
9. 账号反馈 inset：独立审查发现 Account/Auth/Permissions 五个反馈、notice、safety 面仍用 `radius.md=14`，与批准的 12pt inset 不符；五处改为 `radius.card=12`。五面 × 浅/深共十个真实 consumer RED 后转绿，最终覆盖 40/40、类型/diff 通过，fix-only 复审关闭。证据：`tests/app-wide-account.test.ts`、`task-5-report.md`。

## emil-design-eng：Before | After | Why

| Before | After | Why |
| --- | --- | --- |
| Today 完成目标 40×44pt | 44×44pt，视觉 marker 仍为 20pt | 扩大命中区，不放大装饰图形 |
| 历史 inbox 忽略目标 63×30pt | 63×44pt | 达到原生触控基线；不把历史版当当前 inbox 证明 |
| 标题/输入/recovery 控件各自固定尺寸 | 可增长的 native text roles、44/50pt 控件和 22pt 页面 inset | Dynamic Type 与窄屏优先，保留原生反馈和 handler |
| 联系人分析 62%/37% 与解释被截断 | 完整数值与说明可重排 | 有意义数据不能为了整齐而省略 |
| Graph 证据表单透明且提交层级不清 | 12pt inset + 50pt primary，失败保留草稿 | 明确可编辑边界和主要动作，同时保留业务安全反馈 |
| Event center 主动作在 320pt 被挤到 114.53125pt | 主动作占 276pt 内容行，次动作另行 | 操作名称和命中区在大字下都应清楚 |
| Events 页面重复身份；hub 大字无真实 consumer 守护 | 单一标题；hub 有浅/深 320pt doubled-text 与交互回归 | 清晰层级且让未路由 consumer 也有可复验保护 |
| 日历 `09:00`/`14:00` 固定窄栏换行或裁切 | fontScale-aware 水平布局，垂直时间几何不变 | 自适应文字不能破坏日历的时间语义 |
| 五个账号反馈面半径 14pt | 精确 12pt inset，浅/深真实状态覆盖 | 反馈/风险面需与批准系统一致，不能只检查静态源码 |

## 当前整体结论

58 个 `app/` 入口已有 controller-viewed 原生实际状态，canonical/alias/redirect 与受控真实 consumer 证据见 `docs/designs/2026-09-08-app-wide-style/README.md`。实际 NOT_FOUND、permission-denied、0 pending 和明确不可用状态均按原样记录，没有用 fixture 冒充 live 成功，也没有执行真实业务写入。原生 live Dynamic Type 与 auth/profile 软件键盘仍未满足，因此：

final result: incomplete — 领域修补循环已闭合；whole-app 实时 Dynamic Type 与 auth/profile 键盘标准仍开放，最终完整回归和整体独立审查由 controller 收尾。

## 2026-09-09 23:07 — 全量审查修补及最终验证

本节更新上一段的“最终回归待执行”。循环 10：全量独立审查发现 28 个可达 inset/内嵌反馈面仍为 14pt；先补 20 个浅/深色真实 consumer 回归，全部因 14px ≠ 12px 失败，再仅替换 9 个生产文件的 28 处 radius token。116 项聚焦测试与 10 项相邻 inbox 交互测试通过；controller 独立比较冻结前后源码，确认没有其他生产行改动。此前循环 1–2 是历史记录，本轮全 App 改造对应循环 3–10，共 8 个可追溯修正循环；最终限定复审结果另附，实时字号问题不是其中已关闭的项目。

| Before | After | Why |
| --- | --- | --- |
| 28 个可达反馈/表单/对话内嵌面的圆角仍为 14pt | 统一为 12pt，保留各自内容、交互和语义边界 | 补齐批准的 inset 规范 |
| 成功后才出现的反馈面缺少尺寸回归 | 真实 handler 经受控响应产生反馈，浅/深色均核对可见 consumer 和精确请求 | 不只检查共享样式对象，不触达真实写入 |
| 原生运行中字号变化后字形与 frame 不同步 | OPEN，未以重启通过替代 | 该原生验收问题不能被圆角修补或自动化通过掩盖 |

最终冻结后 `npm test` **961/961**，0 failed/cancelled/skipped/todo，25.610 秒；`npm run typecheck && git diff --check` 退出 0。`/tmp/orbit-app-final-verified-20260909.log` 保留原有负向会话测试故意输出的 `boom`。最终源码冻结清单确认只有预期的 9 个生产文件和 3 个已有测试文件相对上一冻结版本变化；外部工作保留。

原生最终抽查访问管理提示浅/深色，文字与图标完整，证据 `.tmp/app-wide-style/after/final-insets/native-observations.json`。这是 1 个改动面、2 种外观，不冒充全部 28 面重新原生截图；此前 58 入口记录继续作为当时路由/实际状态证据。全量独立审查未建立新的业务/导航回归，但确认 live Dynamic Type 为重要未解决项；auth/profile 软件键盘是未证明范围，非已确诊缺陷。低优先级问题及影响查询流程偏差见全 App README 的最终更新。

final result: incomplete — 全量自动化验证通过；原生实时 Dynamic Type 尚未修复。未提交、推送、发布或执行真实业务写入。

23:12 最终限定复审：28/28 圆角缺口已解决，修补差异未发现新 Critical/Important/Minor 问题；循环 10 的修补/复验闭合。原生实时字号仍 NOT ADDRESSED / OPEN，五项低优先级事项保留。完成的 UI 修补与未完成的整体验收分开记录，不执行第二次扩大修补或未经授权的原生框架更改。
