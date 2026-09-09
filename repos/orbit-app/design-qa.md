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
