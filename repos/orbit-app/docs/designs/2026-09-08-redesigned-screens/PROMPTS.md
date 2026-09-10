# 改后设计生成提示词

使用内置 ImageGen。前三次为同一设计系统的三个页面，第四次只修正收件箱首条预览中的汉字。最终交付使用修正版收件箱。

参考输入均已先直接查看：2026-09-07 原生截图与原选 Eight Hero Action、Conversation Transcript、After Hours。详情与收件箱还附加了本轮已生成的页面以保持风格一致。

## 1 · contacts-list

```text
Use case: ui-mockup. Create a production-quality AFTER-REDESIGN of Orbit's existing native iOS contacts list, not an audit board, not a website, not a new style option. One full portrait app-content screen, logical dimensions 402 x 874, preserve this 402:874 aspect ratio at high resolution. Current date 2026-09-08; preserve actual source data, don't invent dates.
INPUTS: Image1 is the existing contacts-list screen, edit target and authoritative content. Image2 Eight Hero Action is selected reference for compact people rows, clean white surfaces, clear primary action. Image3 Conversation Transcript is selected reference for typography and thin separators ONLY, not its fields, quotes, bottom tabs or red palette. Image4 After Hours is selected reference for restrained boundaries ONLY; this output is LIGHT mode.
DESIGN: An intentional native relationship-management tool. Warm near-white #FFFEFC base, ink #20242C, secondary #626874, blue #006DB8. SF Pro / PingFang-like sans, body 15-16 logical points, names 17 semibold, secondary 13 regular, score 13 medium muted. 20pt side margins. Native single compact navigation line with chevron and small “联系人” on left, then a 26pt semibold “联系人列表” title below; no giant boxed back button or tall eyebrow-title stack. A single 44pt softly tinted search field labeled “搜索姓名、公司、资源”. Next row keeps TWO 44pt actions “深度搜索” and “关系搜索”: light blue action and quiet outline action, neither large dominant hero. Next row four unobtrusive dropdown controls “行业”, “进展”, “行动”, “更多”, equal touch widths, thin chevrons, no individual heavy white rounded tiles. NO enclosing panel around search/actions/filters. First person begins roughly y=245 logical points (app content coordinates).
Then open full-width list with 72-76pt rows separated by hairlines, NO card around the list, NO individually bordered cards. Each row preserves pastel INITIAL avatar (no fabricated face), name and company/role left, small muted “84” and chevron far right. Name is main anchor, score is not blue/bold and must not compete. Actual rows in order:
吴可欣 / 南山餐饮 · DX 顾问 / initial 吴 / 84
刘雨薇 / 晨光餐饮 · 产品经理 / 刘 / 84
赵思琪 / 蓝海餐饮 · 门店经营者 / 赵 / 84
王一凡 / 梅田餐饮 · 投资合伙人 / 王 / 84
张博文 / 红桥餐饮 · 市场负责人 / 张 / 84
姚晓琳 / 银座餐饮 · 门店经营者 / 姚 / 84
方欣然 / 青叶餐饮 · 市场负责人 / 方 / 84
Show all seven comfortably and natural blank lower breathing room. Keep source order, all search controls and scores. Do NOT add relationship tags, quotes, dates, contact counts, plus/add buttons, bottom navigation, or new fields. Do NOT copy reference fictional names, photos, timestamps, totals.
OUTPUT: single redesigned screen only; no before/after pair, no annotations, no presentation heading, no device bezel/body/notch/Dynamic Island/status bar/clock/battery/home indicator/browser chrome/device mask or shadow. Flat app content extends to edges. Plain warm-white mobile canvas, purposeful spacing, thin separators, precise readable Chinese. The visual transformation must be hierarchy, density and removal of nested enclosures, not merely recoloring the original.
```

## 2 · contact-detail

```text
Use case: ui-mockup. Create the actual AFTER-REDESIGN of Orbit's native iOS contact detail, in the SAME visual system as Image2, not an audit or a new style option. Single app-content portrait screen, logical 402 x 874; preserve aspect ratio at high resolution. Current date 2026-09-08. Preserve actual source facts; no invented history.
INPUTS: Image1 existing contact detail is the authoritative content/edit target. Image2 just-designed contacts list is the EXACT style reference: match its warm white canvas, blue #006DB8, charcoal type, thin hairlines, PingFang/SF typography, no enclosing cards. Image3 Eight Hero Action reference establishes prominent primary action. Image4 Conversation Transcript establishes clean editorial text hierarchy, not its extra functionality.
DESIGN: Native mobile page, warm-white #FFFEFC edge to edge, ink #20242C and secondary #626874. 20pt side margins, compact top navigation: blue back chevron and “联系人” on left; small centered “联系人详情”. No big page headline, no large back-button tile, no ellipsis/add feature.
Below, identity on open base surface: 64pt pale rose circular INITIAL avatar “吴” (NO fabricated portrait), name “吴可欣” 28pt semibold, company/role “南山餐饮 · DX 顾问” 14pt secondary and compact pale-green status “需要联系”. Clear breathing room, NO identity card border.
Immediately follow with next-action section: small blue label “下一步”, readable 17pt semibold exact text “请共同联系人确认双方意愿后再发起引荐” wrapped naturally into two lines. Single prominent FULL-WIDTH 50pt blue #006DB8 button with small mail icon and “起草消息”, radius10, no shadow or enclosing card. Put this action around y=250, not pinned over content or moved below disclosures.
Then open reading sections with 20-24pt vertical spacing and thin separators, no repeated rounded cards, no lightblue outer action-panel:
“关系摘要”
“南山餐饮的 DX 顾问，常驻东京，目前处于需要联系。”
“合作切入点”
Two clearly aligned rows, muted small labels left, 15pt body right:
“对方在找” / “零售直播电商分销伙伴”
“对方能提供” / “跟进消息多语言本地化”
“最近动态”
“暂无记录”
“还没有记录互动。”
Keep the honest empty state quiet with a small clock outline, not an invented timeline or quote.
At bottom after thin separator, two native disclosure rows with DOWN chevrons, titles17pt and muted13pt descriptions:
“完整资料” / “公开介绍、关系价值和来源记录”
“更新联系人” / “状态、标签、互动和私人记录”
Both collapsed and fully visible. No new tabs, phone/email actions, contact-count metrics, location icons, timeline, quotes, sources or bottom navigation. Preserve exact order identity→next action→summary→cooperation→recent→full details→update. Fit all comfortably in 402x874 with native 44pt minimum control touch heights; do not shrink body below14pt to cram. Identity and primary action should be unmistakably more important than subsection labels.
OUTPUT: only the completed redesigned screen. No before/after, explanatory labels, device bezel/body/notch/Dynamic Island/OS status/clock/battery/home indicator/browser chrome/device mask or shadow. No charts, illustrations, fake photos. Clean shippable UI mockup, crisp accurate Chinese, real information architecture.
```

## 3 · inbox

```text
Use case: ui-mockup. Create the actual AFTER-REDESIGN of Orbit's native iOS relationship inbox, SAME visual system as Image2 and Image3, not an audit board or new style option. One app-content portrait screen, logical 402 x 874, preserve aspect ratio at high resolution. Current date 2026-09-08. Visible June dates are existing historical records and MUST remain June, do not relabel them as today.
INPUTS: Image1 existing inbox = edit target/authoritative content. Image2 redesigned contacts list = EXACT palette, typography, native controls and open list style. Image3 redesigned contact detail = same full-width primary button style. Image4 Conversation Transcript = selected reference for clear sender/subject/body/time hierarchy, NOT its red palette, quotes, avatars or new features.
STYLE: warm-white #FFFEFC entire app canvas, ink #20242C, secondary #626874, blue #006DB8, SF/PingFang-like sans. 20pt side margins. Native navigation starts with blue back chevron and small “人脉消息”, compact title “关系收件箱” 26pt semibold below. No big boxed back button. No repeated second large title.
Retain source summary, quiet 13pt text “40 条提醒 · 6 段对话 · 0 条新消息”. Then four compact inline metric columns with moderate 20pt numbers, small gray labels: “40 待处理”, “0 线索”, “40 提醒”, “6 对话”. NOT a dashboard card or four cards, just open typography.
Then two native segmented tabs in single 44pt bar: “待处理 40” inactive, “对话 6” selected. Selected tab subtle blue wash, blue text; avoid multiple saturated count badges. All roles/counts stay intact.
Then full-width 48pt blue “写一条新消息” action with small compose icon, radius10. Below, one compact section-heading line “对话” with small muted “6 段”. Then 44pt pale neutral search field “搜索对话”. Header, stats, tabs, action, and search together take roughly first 375pt; do not replicate large padded containers.
Messages begin around y=390, open white surface, no outer DataCard, NO rounded boxes around each conversation, use thin full-width row separators. Each row about130pt with actual source data:
sender “曾伟” in17pt semibold; right “6月28日 13:00” in12pt regular muted.
subject “与曾伟的关系跟进” in15pt medium.
preview “先复核上下文，再决定下一步。” in14pt regular.
context “复核关系上下文后再决定是否外发” in13pt muted.
Second: sender “胡家明”, date “6月27日 13:00”, subject “与胡家明的关系跟进”, same exact preview and context.
Third: sender “山田千寻”, date “6月26日 13:00”, subject “与山田千寻的关系跟进”, same exact preview and context.
Show three full rows, more conversations remain below the scroll viewport (total6), do NOT invent a fourth person's data or add a fake “load more” control. No avatars, unread dots (there are zero new messages), quote marks or new metadata. Do not remove existing text in pursuit of minimalism. Content order must remain summary→four stats→two tabs→compose→conversation heading/search→threads. Main attention to sender/subject rather than equal-weight blocks; stats visually quiet, compose is the one strong blue action.
OUTPUT: one completed redesigned mobile screen only, no before/after, captions or annotations. NO device bezel/body/notch/Dynamic Island/OS status bar/clock/battery/home indicator/browser chrome/device mask or shadow. No bottom navigation or fake photographs. Precise readable Chinese. This is a usable native communications surface, not a website dashboard.
```

## 4 · inbox-text-correction

```text
Edit this Orbit inbox UI mockup with ONE precise text correction only. In the first conversation row for 曾伟, replace the preview sentence with the exact Chinese text “先复核上下文，再决定下一步。” The character after 复 must be 核 (木 + 亥), NOT 榇 or any other character. Render this sentence exactly like the matching preview in the second and third rows. Preserve every other pixel/layout as closely as possible: all three messages, Chinese names, historical June dates, statistics40/0/40/6, tabs, button, search, portrait aspect ratio, sizes, colors, spacing, complete frame. Do not redesign, add UI, change sender names, or remove text. Single corrected app-content image only.
```

