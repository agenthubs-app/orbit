# APP-01 底部导航：完整提示词与输入

日期：2026-09-11。使用内置 ImageGen，五次独立调用；未使用 CLI/API fallback。首次生成建立统一首页基准，后四次以该图为编辑基准，只要求改变底栏。

## 输入图片

1. `../2026-09-08-redesigned-screens/01-contacts-list-after.png`：已有 Orbit 视觉语言。
2. `references/meetup-official-connections.png`：Meetup 官方 2023 年新闻稿第 3 页的完整渲染，借鉴左侧截图底栏。
3. `references/paypay-partner-home.png`：Y!mobile 官方 PayPay 设置说明截图，借鉴中央主要操作层级。
4. `01-quiet-native.png`：仅后四次附带，用来保持首页文本与构图一致。

实际调用时外部参考来自本次临时下载／渲染路径；上方路径为已保存的等字节项目副本。首次生成基准的原始全局文件亦保留。

每次发送的完整提示词为：公共提示词 +（后四次的一致性约束）+ `DESIGN DIRECTION:` + 对应方向。以下保留原文。

## 公共提示词

```text
Use case: ui-mockup. Generate a realistic production-quality native Orbit iOS mobile HOME screen, with the BOTTOM NAVIGATION as the design subject. Concept art for review only. One independent design, not a collage. Target logical dimensions 390 x 844, render crisply at high resolution while preserving the exact aspect ratio. App content only: NO phone body/bezel, device shadow, notch, Dynamic Island, OS status bar, clock/signal/battery indicators, home indicator, browser chrome, rounded-device mask, mockup background, arrows, annotations, option numbers or concept name.
Actual references: Image 1 is the existing approved Orbit contacts design, used ONLY for brand typography, blue action color, understated thin separators and open surfaces; do not copy its contact list content or its back arrow. Image 2 is Meetup's official 2023 press image (the left screenshot's bottom navigation), used ONLY to study balanced icon+label spacing and clear active state. Image 3 is PayPay's official partner onboarding screenshot, used ONLY to study how the central primary action is distinguished; ignore its red rectangular tutorial callout and outer white margins. Do NOT copy Meetup/PayPay logos, brand red/pink, screen content or proprietary icon shapes.
Hard approved navigation contract: Exactly five left-to-right bottom items, labels VERBATIM: "首页" "人脉" "IORBIT" "活动" "我的". Home is the only selected destination. IORBIT is an ACTION which opens a full-screen AI workspace, not an active fifth tab. The other four are permanent root destinations. No sixth tab, no floating extra chat launcher, no bottom message or calendar tab. Every item must have a visible persistent label and a believable minimum 44x44 logical-pixel touch area. Four destination icons: house, two people, event/calendar, person. Central action icon: simple original orbital-loop line icon, no sparkle, no chatbot face, no QR code, no PayPay-like letter mark. Current home has no back arrow. Bottom bar must not overlap content. Reserve bottom safe-area space without drawing an OS home indicator.
Existing Orbit light theme: background #F7F6F3, bar/surface #FFFEFC, primary ink #20242C, secondary text #626874, action blue #006DB8, soft blue #E3F2FC, thin separator #E5E4E0. Keep this same brand across variants. No gradients, glass blur, neon, luminous orb, heavy shadows, finance dashboard, marketing slogans or all-caps promotional copy. Use modern native sans-serif / PingFang SC. Body text 15px, section labels 18px, page title 26px, nav labels 12px (IORBIT may be 11px). Crisp human-readable Simplified Chinese.
FIXED HOME CONTENT for fair comparison: Same information, order, left alignment and approximate positions across all variants. Top margin 24, horizontal inset 22. Small "ORBIT" wordmark upper-left, an unobtrusive inbox outline button upper-right. Page title "首页", date underneath "9月11日 周五". Section "近期日程" with small right text link "查看日历": two airy agenda rows separated by hairline. First row time "14:30", title "与林悦聊合作", subtitle "线上会议 · 30 分钟". Second row time "明天 10:00", title "项目讨论", subtitle "线上 · 45 分钟". Next section "待办事项" with two simple outline-checkbox list rows: "发送项目介绍" and "确认下周会面时间". Last supporting section "推荐活动", right link "全部", one compact event row with a small 72px photo of a quiet modern Tokyo cafe interior without people, title "周末产品交流会", metadata "9月12日 周六 · 14:00" and "东京 · 涩谷". No more content. Keep all content above y=710 so navigation and safe area fit comfortably. Don't make each row a card or add metrics. The date anchor is Friday September 11, 2026 in Asia/Tokyo; tomorrow is Saturday September 12, 2026. All schedule/person/event text is fictional visual sample data, not claims about real user data. No in-image disclaimer or extra labels.
Concentrate design variation in the bottom 110 logical pixels: bar geometry, icon/label arrangement, selected-state treatment and central action emphasis. Keep the home content visually quiet and approximately identical. Deliver one attractive plausible app screenshot with the whole bottom navigation clearly legible.
```

## 后四次一致性约束

```text
Image 4 is the newly generated Orbit Home anchor. Preserve its HOME CONTENT above the bottom navigation, including all text, font sizes, separators, cafe photo and spacing, as closely as possible. Only replace the bottom-navigation area with the new design direction. Do not generate a new cafe photo, change wording, add UI or alter the page title. This anchor controls page consistency; Images 1–3 remain brand/reference inspiration. Keep whole image at the same ratio.
```

## quiet-native

```text
Concept name for internal guidance only: Quiet Native. A calm full-width flat bottom tab bar seamlessly anchored to the bottom, subtle hairline across its top, no pill container and no raised/circular floating action. Five equal-width columns, each icon above its label, generous lateral spacing. Home uses a solid blue house and blue label; other destination icons are medium-gray outlines. Central IORBIT has a 36px soft-blue rounded-square backdrop behind a dark-blue orbital-loop icon, stays within the same icon baseline, its dark-blue label below. Clearly an action yet only mildly emphasized. Bar content approximately 64px tall plus 28px safe-area padding. Professional, mature and quietly distinctive.
```

## lifted-action

```text
Concept name for internal guidance only: Lifted Action. A full-width softly rounded-top white dock with four low-key destination columns in pairs flanking a gently raised CENTRAL compact blue rounded-rectangle action. The central action is a 54x48px squircle (14px radius), protruding 10px above the bar, not a huge circle. It contains one white orbital-loop icon; label IORBIT below within bar. Barely perceptible shadow under central action only, no deep scallop/notch copied from PayPay. Home selected with blue icon+label and a tiny 3px dot, other destination icons gray. Central action is easy to reach but does not dominate the home content. Stable 4+1 rhythm, polished native payment-app usability translated to Orbit blue.
```

## floating-island

```text
Concept name for internal guidance only: Floating Island. One single inset floating dock, 14px from each screen edge, about 74px tall, 26px outer radius, 22px above screen bottom, opaque warm-white with a hairline boundary and only a tiny soft elevation. All five items live INSIDE this same dock and have equal visual baselines; nothing protrudes above it. Home selected through a soft-blue small pill behind its icon (not the whole item); its blue label remains below. Central IORBIT has a compact solid-blue 36px rounded square around the white orbital-loop icon with the persistent IORBIT label under it. Others gray outline icons+labels. Plenty of width for all five; no clipped labels. Contemporary but buildable, not glassmorphism.
```

## grouped-bridge

```text
Concept name for internal guidance only: Grouped Bridge. A deliberately separated 2+1+2 bottom composition on the page's warm-gray bottom surface. Left opaque white mini-dock contains Home and Contacts, central standalone 54px BLUE circle contains a white orbital-loop icon and has IORBIT label immediately underneath, right opaque white mini-dock contains Events and My. The left and right mini-docks each have 18px corner radii, two icon-above-label columns, subtle thin outlines, almost no shadow. All five have touch-friendly widths and sit in one coherent bottom band, not stacked rows. Home has a pale-blue selected-area tint within the left mini-dock; only central action is solid blue. This separate treatment makes four destinations and one action unmistakable without changing their left-to-right order. Do not connect all pieces into a single pill and do not add a second launcher.
```

## compact-inline

```text
Concept name for internal guidance only: Compact Inline. A compact full-width native navigation strip anchored to bottom, warm-white, hairline at top, approximately 54px action row plus 28px safe area. Unlike conventional icon-over-label layouts, each of the four destination items has a small 17px icon NEXT TO its 12px text on the same horizontal baseline; each item remains a separate minimum-44px target. Exactly five items fit the 390px width in order Home Contacts IORBIT Events My. Home selected as a soft-blue compact rounded rectangle containing blue icon + 首页. IORBIT is a distinct 68x38px solid-blue horizontal capsule with small white orbital-loop icon and white IORBIT text, centered within the row, NOT raised. Other destinations use gray icon+text inline. Clear dense utility, readable labels, substantial space above for content, no second label row, no floating dock. Width budgeting: about 70,70,78,70,70px within 16px side padding.
```

