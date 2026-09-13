# 跨页面五案：实际生成输入

本轮采用内置 ImageGen，每套是一张包含六页的对比板。五次成功调用分别传入下面的公共输入，加对应方向说明；没有将五个方向混在一次生成中。编号按生成图在对话中的显示顺序绑定，不是图内的页面编号。

五次成功调用都传入这五个本地图片路径：

1. `/Users/xzhao/Projects/orbit/repos/orbit-app/docs/designs/2026-09-11-home-directions-v3/02-split-day.png`
2. `/Users/xzhao/Projects/orbit/repos/orbit-app/docs/designs/2026-09-08-redesigned-screens/figma-after-board.png`
3. `/Users/xzhao/Projects/orbit/repos/orbit-app/docs/designs/2026-09-06-chat-ui/reading-canvas.png`
4. `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/app-wide-style/after/task4/orbit-task4-calendar-normal-verified.png`
5. `/Users/xzhao/Projects/orbit/repos/orbit-app/.tmp/app-wide-style/after/task5/orbit-task5-final-profile.png`

初次尝试附七张图被工具的五图上限拒绝，没有产生图片。随后使用现有联系人设计板合并列表／详情参考，不新造拼图，改为上述五图。下列为成功调用的输入。

## 公共输入

```text
Use case: ui-mockup.
Create a realistic, production-quality mobile UI presentation board for Orbit. This image is ONE coherent design direction shown across SIX DIFFERENT APP SCREENS, not six alternative ideas. The user explicitly requests five multi-page design directions; this call produces one such direction. Stay within the existing product identity. This is a restrained cross-app typography and density refinement, NOT a new brand or an information-architecture redesign.

TARGET DIMENSIONS / COMPOSITION
Request a high-resolution portrait canvas 2368 x 3488 px, with six equally sized tall app viewports arranged in a precise THREE-COLUMN, TWO-ROW grid. Each screen is designed as a 390 x 844 logical-pixel mobile viewport; preserve that exact tall aspect ratio when uniformly scaling. Fill the board with these six panels, narrow neutral gutters, and a small descriptive board heading. No perspective, phone bodies, bezel, notch, Dynamic Island, OS status bar, clock, battery, home indicator, rounded device mask or device shadow. The board labels are outside the app surfaces. All six complete screens must fit, with fully visible bottom edges, and no clipping. Render small Chinese type sharply enough to inspect when zooming the board. Do not simplify each screen to a few giant cards.

REFERENCE ROLES
Image 1 (02-split-day): the USER-APPROVED HOME DESIGN, primary reference for compactness, blue/white/gray identity and EXACT floating bottom navigation style. Do not reproduce or redesign the home screen in this board. Retain its bottom navigation for ROOT pages only, with exact labels and order: 首页 | 人脉 | IORBIT | 活动 | 我的. Central IORBIT has the blue rounded-square Orbit icon. Active root changes per screen. Root pages have no back arrow.
Image 2: the existing three-page contact design board. Use ONLY its left contacts-list and middle contact-detail panels for structure and existing controls. Ignore the right inbox panel and ALL Figma/editor chrome. The old oversized titles/avatars/gaps must become compact; the old interaction editor is superseded by the notes-centered rules below.
Image 3: the approved continuous-reading AI conversation. Keep article-like responses and pale quoted questions; reduce typography and spacing modestly, never make it a tiled dashboard.
Image 4: the actual calendar. Preserve day/week/month controls and a real time grid; compact header and spacing. Ignore old dates and OS chrome.
Image 5: the actual profile. Preserve identity, offering/seeking, bio and editable profile fields. Ignore old large text, account values and OS chrome.
The events list is grounded in the small event rows of Image 1 and its existing search/status-filter structure inspected separately; no separate events screenshot is attached in this call.
Other references are secondary to Image 1 and these current requirements. Do not copy real names/account values from source images. Use ONLY the fictional content supplied below.

DESIGN SYSTEM / HARD BOUNDARIES
Light theme only for comparison. Existing blue primary #006DB8 (the home's brighter active blue is acceptable), ink #20242C, secondary #626874, white/off-white surface #FFFEFC, subtle inset #F3F3F2, light divider #E5E4E0. Native SF/PingFang-like sans typography. No downloaded display fonts, new palette, decorative large portraits, gradients, hero photography or new business features.
Compact text targets at 390px logical width: main page heading about 17-18pt, section headings 14-15pt semibold, list primary text 13-14pt, secondary text 11-12pt; readable long AI text around 14pt with 20-22pt line-height. Target values are visual guidance, not a claim of measured native typography. Preserve hierarchy with weight and alignment, not giant headings. Approximate horizontal insets 16-18pt. Tappable targets remain about 44pt even if their text is small.
This user explicitly rejected sparse giant-card layouts. Override generic generous-whitespace / one-hero-only defaults: show the complete specified realistic list content densely, without clipping or removing functionality. Do not mechanically shrink all content. Keep logical module order and user tasks unchanged.

ALL SIX SCREENS, IN EXACT ROW-MAJOR ORDER
Top left — ROOT 人脉列表:
Compact header 人脉 with scan and add-contact icons at right, search 搜索姓名、公司. Keep existing 深度搜索 / 关系搜索 as compact secondary text controls, then filter line 行业 / 进展 / 行动 / 更多. Ten plain compact contact rows, modest 28-32pt avatars/initials, name primary, role/company secondary, subdued chevron. Fictional rows:
林悦 — 产品设计师 · 云间工作室
陈默 — 产品经理 · 山海科技
周宁 — 市场负责人 · 松石咨询
许妍 — 创业者 · 白露设计
李珊 — 用户研究 · 谷雨科技
王安 — 软件工程师 · 北辰工作室
苏禾 — 品牌设计 · 夏木设计
赵乔 — 运营经理 · 远山科技
顾言 — 创业者 · 晨光工作室
宋岚 — 产品顾问 · 栖云咨询
Do not add fabricated relationship scores or sales stages. Bottom floating nav from Image 1, 人脉 active.

Top middle — SECONDARY 人脉详情:
Outside-panel caption may say 人脉详情 · 后期笔记关联, but no implementation labels inside the app. Small back arrow to 人脉, compact title 人脉详情, text action 编辑资料. Compact identity 林悦, 产品设计师 · 云间工作室, Tokyo; no enormous avatar.
Keep identity first, then readable sections 基本资料 (身份 产品设计师, 公司 云间工作室, 行业 设计服务), 资料备注 (用户填写的称呼：林老师), 简介 (关注产品体验与跨团队协作。), 合作信息 (可提供 设计研究与原型验证; 正在寻找 产品与工程合作伙伴), 关联笔记 with three READ-ONLY compact rows:
9月10日 · 合作方向讨论 / 和林悦、陈默确认产品试点范围。
9月8日 · 产品交流会记录 / 讨论了访谈对象与后续安排。
9月4日 · 初次沟通 / 了解彼此的工作与合作兴趣。
A note row can have chevron to original note. No 添加备注, 写互动, 记录互动, interaction textarea, save-note button, or inline note composer on this screen. Editing identity/profile notes is available only through 编辑资料. This is a FUTURE-state preview of the confirmed notes design, not claiming it has shipped. NO bottom tab bar on secondary pages.

Top right — ROOT 活动发现:
Compact header 活动, search 搜索活动、地点或主题; compact status tabs 即将 / 进行中 / 历史 / 全部. Secondary small existing link 我负责的活动 (fictional owner test account; not a new feature). Four tidy event rows with small landscape thumbnail, title, date/time, venue and status 可报名:
周末产品交流会 — 9月12日 周六 14:00 — 东京·涩谷
设计师午间聚会 — 9月13日 周日 12:00 — 东京·代官山
创业者交流夜 — 9月15日 周二 18:00 — 东京·丸之内
产品与工程圆桌 — 9月18日 周五 19:00 — 东京·五反田
Keep all four visible without huge empty areas; use realistic small café/meeting thumbnails, not illustrations as interface decoration. Bottom floating nav, 活动 active. No invented interest, ticket-price or attendance-count features.

Bottom left — SECONDARY 日历:
Back to 首页 and compact heading 日程. Keep 日 / 周 / 月 segmented control with 日 active, small 今天 action. Date anchor is 2026-09-11 Friday Asia/Tokyo; week strip MUST read 周一7 周二8 周三9 周四10 周五11 周六12 周日13, with Friday11 selected. Show a properly spaced daily time grid for 09:00–18:00 containing 10:00 陈默·需求复盘 (30分钟), 14:30 林悦·合作沟通 (30分钟), 16:00 周宁·项目讨论 (45分钟); visual block heights align with the time scale. Use short blue/slate blocks, preserve whitespace proportional to actual empty time, not arbitrary giant header space. No checkmarks that imply a schedule is a completed task. NO bottom tab bar on this secondary page.

Bottom middle — ROOT 我的资料:
Compact header 我的 and settings gear. Modest avatar with fictional name 程川, 产品经理 · 星野工作室, small 编辑资料 action. Show offering/seeking and bio then an OPEN basic-profile edit section as in existing profile (not a new unrelated settings menu):
我能提供: 产品研究 / 需求梳理
我在寻找: 设计合作 / 技术交流
一句话简介: 记录工作中的交流，也寻找能一起做事的人。
基本资料 form with clearly labeled editable fields 姓名 程川, 行业 互联网, 公司 星野工作室, 职位 产品经理 and 保存资料 button. Show labels clearly and sufficient input/touch height; this screen demonstrates typography in forms. No contact-interaction note composer. No new membership/credits/streak statistics. Bottom floating nav, 我的 active.

Bottom right — FULL-SCREEN IORBIT:
Small back/close, IORBIT and conversation title 交流会准备. A pale blue user quote with thin left rule: 帮我整理明天交流会的准备事项。
Continuous readable answer (not chat bubbles, not a dashboard), with three modest headings and paragraphs:
先准备一个具体问题
选一个正在推进的项目，说清楚目前卡在哪里。把背景控制在几句话内，给对方留下提问的空间。
带上可分享的材料
准备一页项目介绍和一个能快速演示的原型。不必一次讲完全部功能，先确认对方最关心的部分。
会后记下约定
交流结束后整理讨论内容与下一步，再决定是否创建待办或日程。不要把尚未确认的想法写成已约定事项。
A compact referenced event row 周末产品交流会 / 9月12日 周六 14:00 / 东京·涩谷 / 查看活动, and subtle copy/feedback controls. Bottom single compact multiline composer 继续聊聊… with + and send arrow. NO global bottom navigation, NO huge ORBIT branding or huge article headings.

All names, roles, notes, events and conversations are fictional design fixtures. No new functionality beyond existing approved navigation/profile controls and explicitly marked future note readback. Distinguish the SIX pages clearly, but apply ONE cohesive direction throughout the board. Small outside captions can name page types; the top board heading should be the direction's descriptive name, without any option/variant number.
```

## 1. 清晰原生

文件：`01-clear-native.png`。

```text
DIRECTION NAME: 清晰原生. Closest to the approved Split Day home: clean white base, uninterrupted open sections, almost no containers, hairline row dividers, quiet gray secondary text and crisp blue actions. Contact list rows at around 48pt with bold 13.5pt names; compact left-aligned 17pt headers. Event rows have restrained thumbnails with no enclosing card. Profile fields and calendar segments keep subtle neutral surfaces. Compactness comes from small headers and measured whitespace, not heavy outlines. The overall impression is a mature iOS productivity application, direct and quietly precise.
```

## 2. 浅蓝分区

文件：`02-blue-chapters.png`。

```text
DIRECTION NAME: 浅蓝分区. Keep every page's same section order and controls, but use very pale blue slim SECTION-HEADER BANDS and small blue section labels to make dense content scannable. Do not color every row or introduce a new palette. White content areas with shared blue-tinted group headings visually echo the blue today column on the approved home. Compact 13pt list names, 14.5pt section titles, 17pt page titles. Rows are separated primarily by alignment and subtle tint, not boxes. Profile labels sit above clean understated fields. AI remains mostly white article text with small pale-blue section anchors. More visible group cues than 清晰原生, still restrained.
```

## 3. 对齐索引

文件：`03-aligned-index.png`。

```text
DIRECTION NAME: 对齐索引. Same page structure and blue-gray identity; prioritize aligned metadata and compact information columns. Contact rows align name/role blocks to a strict vertical grid; event date and time have a narrow fixed-width metadata column beside thumbnail/title; contact detail has tidy label/value alignment, and profile fields align to common baselines. Fine slate dividers and tiny blue active markers, square-ended section rules, almost no shadows. 13pt primary text, 11.5pt metadata, 17pt page headings. This is a precise compact index, not a spreadsheet or desktop table. Avoid any new sorting/state controls. Preserve the soft floating root nav unchanged; do not make the root navigation angular.
```

## 4. 柔和分组

文件：`04-soft-groups.png`。

```text
DIRECTION NAME: 柔和分组. A restrained grouped-native treatment within the same blue-gray identity. Very light neutral page base with white grouped surfaces, 10-12pt corner radii. Group whole logical sections, NEVER each contact row and NEVER cards inside cards. Contact list is one shared white group, event list uses compact independent rows with slightly clearer group boundaries, contact detail identity remains open then compact grouped profile/notes sections; inputs remain spacious enough to use. Blue actions, 14pt primary names, 12pt secondary, 17pt page headings. Lower visual noise through grouping but still ten contacts and four events visible. No shadows except the approved floating root nav.
```

## 5. 文字节奏

文件：`05-type-rhythm.png`。

```text
DIRECTION NAME: 文字节奏. Keep the current blue-gray brand and exact page/module order; differentiate with typographic rhythm instead of tinted containers. Slightly stronger semibold 17pt page headings, tight 13.5pt list names, calm 11.5pt metadata, thin short divider rules and carefully grouped text. Main names/titles pull forward while chrome recedes. Compact text-only contact rows with very small avatars, moderately spaced form labels, event thumbnails small and editorially aligned, contact detail reads as a tidy profile document. AI body stays 14pt with comfortable 21pt leading and clear small headings. This is product-native typography, NOT a magazine poster, serif redesign or giant editorial hero. No decorative capitals, pull quotes, dark theme or palette change.
```

