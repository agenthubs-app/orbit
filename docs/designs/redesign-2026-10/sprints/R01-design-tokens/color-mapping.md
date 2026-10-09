# R01 对照表：旧颜色 → 新颜色

**状态：待产品负责人确认（RD-07）。确认前不改任何代码里的名字。**
编制：小雨（执行会话），2026-10-09，分支 `redesign-R01-design-tokens`。
新值来源：`repos/orbits/shared/design/tokens.json`（设计稿 `kit/tokens.css` 原值 + 文字加深版 + 补齐项）。色块对照页：同目录 [`color-mapping.html`](color-mapping.html)，截图在 `~/orbit-sprint-evidence/redesign/R01/run-01/`。

「用到」= 当前代码里的引用次数（App 按 `colors.X` 统计，Web 按 `var(--x)` 统计）。改名一次完成，不保留旧名字（RD-06）。

## 需要确认的 12 个要点

| # | 要点 | 推荐做法（已写进下面的表） | 对标 |
| --- | --- | --- | --- |
| 1 | 强调色：App 旧蓝 `#0A5CFF`、Web 旧紫 `#8B7BF0` / 浅色青绿 `#176a73` 全部变成设计稿灰紫 | 旧代码里 `accent` 大多用作文字和按钮底，所以接到**文字版** `accent-text`（浅色 `#6C6087`，比设计原值 `#6E628A` 深一点点，才能在 `accent-soft` 上过 4.5:1）；设计原值 `accent` 留给新组件画图形 | Material 3 / Apple HIG：同一色相分「容器色」和「上面的文字色」两档 |
| 2 | 描边变淡：App `border` / `border2` / `hairline`、Web `--border` 系全部 → `line`（6% 透明） | 按设计原则「层次靠浅色块，不靠描边」；卡片靠白卡 + 浅灰粉页面底区分 | 设计稿 01-system 分层原则 |
| 3 | 旧「最弱文字」`text4` / `--text-4` 本身不达标（约 3.2:1） | 升到 `ink-3-text`（变深、可读）；设计稿 `ink-4` 只做装饰，不再给文字用 | WCAG 2.2 AA 1.4.3 |
| 4 | 成功绿 `live` → `ok-text` / `ok-soft` | 绿色只表示完成（RD-17）。旧代码里少数把绿色当分类色的地方（人脉「emerald」分类、日程「个人」图例）暂时也会是完成绿，到 R11 / 功能 Sprint 重做时再换马卡龙 | — |
| 5 | 错误红 `rose` / `--rose` / `--danger` → `coral-text` | 设计稿的 `rose` 是数据图用的豆沙色，不是红色，旧 `rose` 不能直接沿用名字；文字用 `coral-text`（浅色 `#B83E23` 砖红，深色 `#F29C88`） | — |
| 6 | 文字加深版的取值（见「新 token」表 ★ 行） | 只把亮度往下调到刚好 ≥4.5:1（留 0.1 余量），色相不变 | — |
| 7 | 步骤圆点里的数字：设计稿是 `ok` 绿底白字，浅色只有 3.1:1 | 新增 `on-ok`：浅色用深色字 `#1E1A24`（5.5:1），深色用 `#19181C`；勾号图标仍可用白色（图形只需 3:1） | — |
| 8 | 字号：App 页面大标题 30 → 24、正文 15 → 14、标签 12 → 11.5 | 按 01-system 层级（Title 22–26 / Body 13–14 / Label 11.5）；字号整体略小一号 | — |
| 9 | Web 现在默认是「星空深色」 | 改成跟随系统；浅色 = 设计稿浅色。**星空首页（iOrbit 首页 starfield 场景）固定用新深色**，到 R21 重做 | — |
| 10 | Web 登录页和 Agent 页各有一套独立配色 | 删除独立配色，跟随新 token | — |
| 11 | Web 0918 各域（人脉、活动、iOrbit、个人、引导）样式表里写死的 2,802 处十六进制颜色 | **不在本 Sprint**（PLANNER「不做」）：它们不是 token，这些页面在功能 Sprint 重做前保持旧颜色，只有外层壳换新色。文件清单见文末 | — |
| 12 | 内部开发页 `/dev/**`（`app/globals.css` 的 `--orbit-color-*`、`shared/ui/theme.ts`） | 不是产品页面，不改，静态扫描排除 | AGENTS.md「Dev Capability Surfaces」 |

## 新 token（tokens.json）

★ = 补齐项（设计稿没有，本源补上）。文字列的对比度按「最难的底色」计算。

| 名字 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `bg` | `#F7F5F7` | `#19181C` | 页面底色 |
| `fog-a` | `rgba(206, 192, 236, 0.38)` | `rgba(120, 100, 170, 0.16)` | 背景雾 · 薰衣草（装饰） |
| `fog-b` | `rgba(240, 205, 218, 0.34)` | `rgba(160, 100, 125, 0.12)` | 背景雾 · 烟粉（装饰） |
| `fog-c` | `rgba(214, 228, 246, 0.28)` | `rgba(90, 120, 170, 0.1)` | 背景雾 · 冷雾（装饰） |
| `surface` | `#FFFFFF` | `#242328` | 卡片面 |
| `surface-2` | `#F2EFF3` | `#2E2D33` | 卡内浅色块、输入框底、凹陷区 |
| `surface-3` | `#EAE6EC` | `#393840` | 轨道、分隔块、骨架闪光 |
| `line` | `rgba(40, 30, 50, 0.06)` | `rgba(255, 255, 255, 0.06)` | 极淡分隔线和描边 |
| `glass` | `rgba(255, 255, 255, 0.62)` | `rgba(44, 42, 50, 0.62)` | 毛玻璃面（底栏、浮层） |
| `glass-line` | `rgba(255, 255, 255, 0.7)` | `rgba(255, 255, 255, 0.08)` | 毛玻璃描边 |
| `ink` | `#1E1A24` · 14.99:1 | `#F3F0F6` · 12.09:1 | 正文、标题 |
| `ink-2` | `#5E5866` · 6.01:1 | `#BDB6C4` · 6.92:1 | 次级文字 |
| `ink-3` | `#9C95A4` | `#85808C` | 标签色原值：只用于图标、装饰 |
| `ink-3-text` ★ | `#6F6778` · 4.74:1 | `#9A959F` · 4.66:1 | 标签、说明、时间等小字（ink-3 的文字加深版） |
| `ink-4` | `#C4BEC9` | `#5A5660` | 最弱装饰：箭头、虚线、占位图形；不用于文字 |
| `plum-900` | `#4F4466` | `#E7E0F3` | 灰紫 900：数据图最深一档；强调色的按下态 |
| `plum-700` | `#6E628A` | `#CFC4E6` | 灰紫 700：主强调色原值 |
| `plum-500` | `#8E82A9` | `#A79BC4` | 灰紫 500：数据图 |
| `plum-300` | `#BDB3D2` | `#6F6589` | 灰紫 300：数据图、焦点环 |
| `plum-100` | `#E9E4F2` | `#35303F` | 灰紫 100：数据图最浅一档 |
| `rose-700` | `#9C6C79` | `#EBC4CD` | 豆沙 700：数据图 |
| `rose-500` | `#B98995` | `#D4A3AF` | 豆沙 500：目标、进度 |
| `rose-300` | `#DDBFC6` | `#7E5B64` | 豆沙 300：数据图 |
| `rose-100` | `#F5E8EB` | `#3A2F33` | 豆沙 100：数据图最浅一档 |
| `accent` | `#6E628A` | `#CFC4E6` | 强调色原值：图形、大号粗体 |
| `accent-text` ★ | `#6C6087` · 4.60:1 | `#CFC4E6` · 7.71:1 | 强调色文字版：链接、强调文字、强调按钮底 |
| `accent-soft` | `#E9E4F2` | `#35303F` | 强调色浅底：选中态、强调 chip 底 |
| `on-accent` | `#FFFFFF` · 5.56:1 | `#1E1A24` · 8.05:1 | 强调色（accent / accent-text）上的文字 |
| `mac-pink` | `#F8E4EA` | `#3B2D33` | 马卡龙 粉：小面积类型底（要フォロー） |
| `mac-apricot` | `#F7ECDD` | `#3A3229` | 马卡龙 杏：小面积类型底（注意） |
| `mac-blue` | `#E2ECF8` | `#2B3340` | 马卡龙 蓝：小面积类型底（関係構築） |
| `mac-teal` | `#DCF0EA` | `#28372F` | 马卡龙 青：小面积类型底（協業） |
| `mac-lav` | `#ECE6F7` | `#332D40` | 马卡龙 薰衣草：小面积类型底（iOrbit / 推進中） |
| `mac-pink-ink` | `#A55F72` | `#EBB3C2` | 粉色原值：图标、装饰 |
| `mac-apricot-ink` | `#9A6B33` | `#E6C595` | 杏色原值：图标、装饰 |
| `mac-blue-ink` | `#4C6D96` | `#A9C4E6` | 蓝色原值：图标、装饰 |
| `mac-teal-ink` | `#3D7D6A` | `#9FD3BF` | 青色原值：图标、装饰 |
| `mac-lav-ink` | `#6E5C9A` | `#C9BBEB` | 薰衣草原值：图标、装饰 |
| `mac-pink-text` ★ | `#945465` · 4.65:1 | `#EBB3C2` · 7.31:1 | 粉底上的文字 |
| `mac-apricot-text` ★ | `#8B602E` · 4.72:1 | `#E6C595` · 7.66:1 | 杏底上的文字（注意、提醒） |
| `mac-blue-text` ★ | `#4A6B93` · 4.61:1 | `#A9C4E6` · 7.11:1 | 蓝底上的文字（信息） |
| `mac-teal-text` ★ | `#387361` · 4.67:1 | `#9FD3BF` · 7.48:1 | 青底上的文字 |
| `mac-lav-text` ★ | `#6E5C9A` · 4.71:1 | `#C9BBEB` · 7.42:1 | 薰衣草底上的文字 |
| `coral` | `#E58A76` | `#F29C88` | 珊瑚原值：超标、警告的图形 |
| `coral-soft` | `#FBE7E1` | `#42302C` | 珊瑚浅底：错误、删除提示底 |
| `coral-text` ★ | `#B83E23` · 4.70:1 | `#F29C88` · 5.85:1 | 错误、删除、警告文字；危险按钮底 |
| `ok` | `#5E9E86` | `#8CC7AF` | 完成绿原值：完成图形（勾、步骤圆点） |
| `ok-soft` ★ | `#E3F1EA` | `#24352D` | 完成浅底 |
| `ok-text` ★ | `#447361` · 4.66:1 | `#8CC7AF` · 6.72:1 | 完成、成功文字 |
| `on-ok` ★ | `#1E1A24` · 5.46:1 | `#19181C` · 9.17:1 | ok 底上的文字（步骤数字） |
| `on-image` ★ | `#FFFFFF` | `#FFFFFF` | 照片上的白色文字和图标（两套主题都是白） |
| `on-image-badge` ★ | `#1E1A24` · 17.09:1 | `#1E1A24` · 17.09:1 | 照片上白色角标里的深色文字（两套主题相同） |
| `scrim` ★ | `rgba(30, 20, 40, 0.28)` | `rgba(0, 0, 0, 0.55)` | App 弹层遮罩 |
| `scrim-web` ★ | `rgba(30, 20, 40, 0.22)` | `rgba(0, 0, 0, 0.55)` | Web 抽屉、模态遮罩 |

TS 命名规则：去掉连字符改驼峰，数字接在后面（`ink-3-text` → `ink3Text`，`plum-700` → `plum700`，`surface-2` → `surface2`）。

## App：37 个颜色 key（`src/design/tokens.ts`）

| 旧 key | 旧值 浅 / 深 | → 新 key | 新值 浅 / 深 | 用到 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `accent` | `#0A5CFF` / `#A2AFD3` | `accentText` | `#6C6087` / `#CFC4E6` | 426 | 旧强调蓝 → 灰紫。旧代码里 accent 大量用作文字和按钮底，所以接到文字版（≥4.5:1） |
| `accentHover` | `#084FDE` / `#B1BDDB` | **删除** | — | 0 | 没有使用，删除 |
| `accentPress` | `#0642BC` / `#8F9DBE` | **删除** | — | 0 | 没有使用，删除 |
| `accentRing` | `rgba(10,92,255,0.32)` / `rgba(162,175,211,0.36)` | **删除** | — | 0 | 没有使用，删除 |
| `accentSoft` | `#EEF3FF` / `#394156` | `accentSoft` | `#E9E4F2` / `#35303F` | 25 |  |
| `accentSofter` | `#F5F8FF` / `#2D3446` | `accentSoft` | `#E9E4F2` / `#35303F` | 61 | 设计稿只有一档强调浅底，与 accentSoft 合并 |
| `amber` | `#876020` / `#C7A16D` | `macApricotText` | `#8B602E` / `#E6C595` | 45 | 「注意」在设计稿里是杏色马卡龙 |
| `amberSoft` | `#F5EEDF` / `#352E25` | `macApricot` | `#F7ECDD` / `#3A3229` | 35 |  |
| `bg` | `#FFFFFF` / `#191C22` | `bg` | `#F7F5F7` / `#19181C` | 11 | 页面底从纯白变成浅灰粉，卡片（surface 白）因此能浮起来 |
| `bgSoft` | `#F5F7FA` / `#191C22` | **删除** | — | 0 | 没有使用，删除 |
| `bgSunken` | `#EEF0F4` / `#15181D` | `surface2` | `#F2EFF3` / `#2E2D33` | 8 | 凹陷区 = 设计稿「卡内浅色块」 |
| `border` | `#E6E8EE` / `#343943` | `line` | `rgba(40, 30, 50, 0.06)` / `rgba(255, 255, 255, 0.06)` | 292 | 设计原则「层次靠浅色块，不靠描边」：线变得很淡 |
| `border2` | `#EEF0F4` / `#424955` | `line` | `rgba(40, 30, 50, 0.06)` / `rgba(255, 255, 255, 0.06)` | 31 | 同上，合并 |
| `borderStrong` | `#B9BDC4` / `#626D7D` | `ink4` | `#C4BEC9` / `#5A5660` | 8 | 输入框描边用设计稿最深的装饰色 |
| `canvas` | `#FFFFFF` / `#191C22` | `bg` | `#F7F5F7` / `#19181C` | 4 |  |
| `caution` | `#876020` / `#C7A16D` | `macApricotText` | `#8B602E` / `#E6C595` | 1 | 与 amber 相同 |
| `hairline` | `#EEF0F4` / `rgba(240,240,236,0.10)` | `line` | `rgba(40, 30, 50, 0.06)` / `rgba(255, 255, 255, 0.06)` | 39 |  |
| `ink` | `#0B1220` / `#F0F0EC` | `ink` | `#1E1A24` / `#F3F0F6` | 429 | 主按钮底也用它（深色按钮 + 白字） |
| `live` | `#437563` / `#89B5A0` | `okText` | `#447361` / `#8CC7AF` | 83 | 成功 / 完成文字；绿色只表示完成（RD-17） |
| `liveSoft` | `#E9F1EC` / `#25352F` | `okSoft` | `#E3F1EA` / `#24352D` | 46 |  |
| `muted` | `#6B7280` / `#B2B7C1` | `ink2` | `#5E5866` / `#BDB6C4` | 9 |  |
| `onAccent` | `#FFFFFF` / `#171C2A` | `onAccent` | `#FFFFFF` / `#1E1A24` | 98 |  |
| `onImage` | `#FFFFFF` / `#FFFFFF` | `onImage` | `#FFFFFF` / `#FFFFFF` | 11 | 照片上的白字，两套主题都是白（补齐项） |
| `imageBadgeText` | `#0B1220` / `#20242C` | `onImageBadge` | `#1E1A24` / `#1E1A24` | 6 | 照片上白色角标里的字（补齐项） |
| `rose` | `#B42318` / `#D28D98` | `coralText` | `#B83E23` / `#F29C88` | 98 | 错误 / 删除。设计稿的 rose 是数据图用的豆沙色，不是红色，所以接到 coral |
| `roseSoft` | `#F7E9EC` / `#3A2930` | `coralSoft` | `#FBE7E1` / `#42302C` | 22 |  |
| `sky` | `#476B92` / `#96B6D5` | `macBlueText` | `#4A6B93` / `#A9C4E6` | 25 | 信息蓝 → 蓝色马卡龙文字 |
| `skySoft` | `#E9EFF5` / `#273443` | `macBlue` | `#E2ECF8` / `#2B3340` | 19 |  |
| `surface` | `#FFFFFF` / `#22262E` | `surface` | `#FFFFFF` / `#242328` | 100 |  |
| `surface2` | `#F5F7FA` / `#272C35` | `surface2` | `#F2EFF3` / `#2E2D33` | 100 |  |
| `surface3` | `#EEF0F4` / `#303743` | `surface3` | `#EAE6EC` / `#393840` | 25 |  |
| `text` | `#0B1220` / `#F0F0EC` | `ink` | `#1E1A24` / `#F3F0F6` | 149 | 与 ink 合并 |
| `text2` | `#3C4658` / `#B2B7C1` | `ink2` | `#5E5866` / `#BDB6C4` | 120 |  |
| `text3` | `#6B7280` / `#A4A9B4` | `ink3Text` | `#6F6778` / `#9A959F` | 444 | 设计稿 ink-3 太浅（2.5:1），文字用加深版 |
| `text4` | `#8B93A5` / `#969EAB` | `ink3Text` | `#6F6778` / `#9A959F` | 108 | 旧 text4 本身就不达标（3.2:1）；设计稿 ink-4 只做装饰，所以文字一律升到 ink-3-text |
| `tint` | `#EEF3FF` / `#2D3446` | `accentSoft` | `#E9E4F2` / `#35303F` | 1 |  |

## App：圆角与字号

| 旧 | 旧值 | → 新 | 新值 | 说明 |
| --- | --- | --- | --- | --- |
| `radius.card` | 12 | `radius.xl` | 24 |  |
| `radius.control` | 12 | `radius.md` | 14 | 按钮仍保持圆角矩形；胶囊按钮在 R04 组件里做 |
| `radius.input` | 12 | `radius.md` | 14 |  |
| `radius.lg` | 18 | `radius.lg` | 20 |  |
| `radius.md` | 14 | `radius.md` | 14 |  |
| `radius.pill` | 999 | `radius.pill` | 999 |  |
| `radius.sheet` | 24 | `radius.sheet` | 34 |  |
| `radius.sm` | 10 | `radius.sm` | 10 |  |
| `radius.xl` | 24 | `radius.xl` | 24 |  |
| `radius.xs` | 7 | `radius.sm` | 10 | 设计稿最小圆角 10 |
| `typography.display` | 30 | `font.size.title` | 24 | 页面大标题；设计稿 22–24 / 900 |
| `typography.title` | 22 | `font.size.titleSm` | 20 |  |
| `typography.section` | 15 | `font.size.cardTitle` | 14.5 | 卡片标题 14.5 / 800 |
| `typography.body` | 15 | `font.size.body` | 14 | 正文 13–14 |
| `typography.small` | 13 | `font.size.bodySm` | 13 |  |
| `typography.caption` | 12 | `font.size.label` | 11.5 | 标签 11.5 |

`spacing`、`layout`、`rowRoleStyles` 不是设计稿命名范围，名字不变；`shadows` 继续是「无阴影」，另加 `float`（设计稿唯一阴影）。

## Web：产品变量层

涉及 `orbit-reference-styles.tsx`（星空重映射层、审计层、Agent 页层）和 `orbit-theme.tsx`（浅色层、登录页层）。各层用同一套旧名字，改名规则相同；改完后这些层的颜色值全部删除，统一由 `orbit-2026/tokens.css` 提供。旧值列出两个代表层：默认深色（星空）和浅色主题。

| 旧变量 | 旧值 深 / 浅 | → 新变量 | 新值 浅 / 深 | 用到 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `--accent` | `#8B7BF0` / `#176a73` | `--accent-text` | `#6C6087` / `#CFC4E6` | 323 | 同 App：旧强调多用于文字和按钮底，接文字版 |
| `--accent-hover` | `#9C8EF5` / `#125b63` | `--plum-900` | `#4F4466` / `#E7E0F3` | 4 | 按下 / 悬停用灰紫最深一档 |
| `--accent-press` | `#7A69E6` / `#0e4b52` | `--plum-900` | `#4F4466` / `#E7E0F3` | 3 | 同上 |
| `--accent-soft` | `rgba(139,123,240,0.16)` / `#eef7f6` | `--accent-soft` | `#E9E4F2` / `#35303F` | 115 |  |
| `--accent-softer` | `rgba(139,123,240,0.09)` / `#f4f8f7` | `--accent-soft` | `#E9E4F2` / `#35303F` | 61 | 合并为一档 |
| `--accent-ring` | `rgba(139,123,240,0.42)` / `rgba(23,106,115,0.28)` | `--plum-300` | `#BDB3D2` / `#6F6589` | 9 | 焦点环 |
| `--on-accent` | `#0B0A15` / `#ffffff` | `--on-accent` | `#FFFFFF` / `#1E1A24` | 8 |  |
| `--accent-grad` | `渐变` / `#176a73` | `--accent-text` | `#6C6087` / `#CFC4E6` | 1 | 设计稿不用渐变，改纯色 |
| `--accent-grad-bar` | `渐变` / `#176a73` | **删除** | — | 0 | 没有使用，删除 |
| `--ink` | `#F2F0FB` / `#171a1c` | `--ink` | `#1E1A24` / `#F3F0F6` | 228 |  |
| `--text` | `#ECEAF6` / `#2b3034` | `--ink` | `#1E1A24` / `#F3F0F6` | 122 | 与 ink 合并 |
| `--text-2` | `#A6A3BD` / `#687078` | `--ink-2` | `#5E5866` / `#BDB6C4` | 238 |  |
| `--text-3` | `#9793B8` / `#5B646B` | `--ink-3-text` | `#6F6778` / `#9A959F` | 334 | 文字加深版 |
| `--text-4` | `#6E6A8F` / `#969da3` | `--ink-3-text` | `#6F6778` / `#9A959F` | 50 | 同 App text4 |
| `--bg` | `#06050D` / `#ffffff` | `--bg` | `#F7F5F7` / `#19181C` | 87 |  |
| `--bg-soft` | `#0D0B1E` / `#ffffff` | `--bg` | `#F7F5F7` / `#19181C` | 30 | 合并 |
| `--bg-sunken` | `#08070F` / `#fafbfb` | `--surface-2` | `#F2EFF3` / `#2E2D33` | 31 | 同 App bgSunken |
| `--surface` | `#12101F` / `#ffffff` | `--surface` | `#FFFFFF` / `#242328` | 160 |  |
| `--surface-2` | `#171430` / `#f7f8f8` | `--surface-2` | `#F2EFF3` / `#2E2D33` | 128 |  |
| `--surface-3` | `#1D1936` / `#f1f3f3` | `--surface-3` | `#EAE6EC` / `#393840` | 51 |  |
| `--border` | `rgba(150,145,200,0.14)` / `#e6e9eb` | `--line` | `rgba(40, 30, 50, 0.06)` / `rgba(255, 255, 255, 0.06)` | 269 | 同 App border |
| `--border-2` | `rgba(150,145,200,0.22)` / `#d9dee1` | `--line` | `rgba(40, 30, 50, 0.06)` / `rgba(255, 255, 255, 0.06)` | 51 |  |
| `--hairline` | `rgba(150,145,200,0.10)` / `#e6e9eb` | `--line` | `rgba(40, 30, 50, 0.06)` / `rgba(255, 255, 255, 0.06)` | 20 |  |
| `--border-strong` | `rgba(150,145,200,0.34)` / `#c7cdd1` | `--ink-4` | `#C4BEC9` / `#5A5660` | 21 |  |
| `--live` | `#34C98E` / `#16a34a` | `--ok-text` | `#447361` / `#8CC7AF` | 32 |  |
| `--live-text` | `#7FE0B4` / `#0E7A3C` | `--ok-text` | `#447361` / `#8CC7AF` | 6 |  |
| `--live-soft` | `rgba(52,201,142,0.14)` / `rgba(22,163,74,0.12)` | `--ok-soft` | `#E3F1EA` / `#24352D` | 32 |  |
| `--amber` | `#E0B472` / `#b45309` | `--mac-apricot-text` | `#8B602E` / `#E6C595` | 13 |  |
| `--amber-text` | `#F0C374` / `#8A5A00` | `--mac-apricot-text` | `#8B602E` / `#E6C595` | 7 |  |
| `--amber-soft` | `rgba(216,176,106,0.15)` / `rgba(180,83,9,0.12)` | `--mac-apricot` | `#F7ECDD` / `#3A3229` | 14 |  |
| `--rose` | `#F0718B` / `#be123c` | `--coral-text` | `#B83E23` / `#F29C88` | 40 | 同 App rose |
| `--rose-text` | `#F09AA4` / `#B4232E` | `--coral-text` | `#B83E23` / `#F29C88` | 5 |  |
| `--rose-soft` | `rgba(224,65,95,0.17)` / `rgba(190,18,60,0.12)` | `--coral-soft` | `#FBE7E1` / `#42302C` | 23 |  |
| `--danger` | `#F0718B` / `#be123c` | `--coral-text` | `#B83E23` / `#F29C88` | 32 | 危险操作 |
| `--danger-soft` | `rgba(224,65,95,0.17)` / `rgba(190,18,60,0.12)` | **删除** | — | 0 | 没有使用，删除 |
| `--on-danger` | `#0B0A15` / `#ffffff` | **删除** | — | 0 | 没有使用，删除 |
| `--signal` | `#C8323B` / `#C8323B` | `--coral-text` | `#B83E23` / `#F29C88` | 1 |  |
| `--sky` | `#6FA8F8` / `#1d4ed8` | `--mac-blue-text` | `#4A6B93` / `#A9C4E6` | 12 |  |
| `--sky-soft` | `rgba(45,127,240,0.17)` / `rgba(29,78,216,0.12)` | `--mac-blue` | `#E2ECF8` / `#2B3340` | 6 |  |
| `--on-dark` | `#FFFFFF` / `#ffffff` | `--on-image` | `#FFFFFF` / `#FFFFFF` | 12 | 深色面 / 照片上的白字 |
| `--scrim` | `rgba(4,3,10,0.62)` / `rgba(23,33,31,0.40)` | `--scrim-web` | `rgba(30, 20, 40, 0.22)` / `rgba(0, 0, 0, 0.55)` | 6 | Web 遮罩 22%（深色 55%） |
| `--glass-bar` | `rgba(10,8,18,0.78)` / `#ffffff` | `--glass` | `rgba(255, 255, 255, 0.62)` / `rgba(44, 42, 50, 0.62)` | 2 |  |
| `--glass-chip` | `rgba(16,13,32,0.86)` / `#ffffff` | `--glass` | `rgba(255, 255, 255, 0.62)` / `rgba(44, 42, 50, 0.62)` | 1 |  |
| `--sh-xs / --sh-sm / --sh-md` | `多层阴影` / `none` | （去掉阴影） | — | 57 | 设计稿不用阴影；用到处改为 none |
| `--sh-lg / --sh-pop` | `多层阴影` / `none` | `--shadow-float` | — | 40 | 浮层统一用设计稿唯一的浮起阴影 |

## Web：圆角、字号、字体变量

| 旧变量 | 旧值 | → 新变量 | 新值 | 用到 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `--r-xs` | 7px | `--r-sm` | 10px | 10 | 设计稿最小圆角 10 |
| `--r-sm` | 10px | `--r-sm` | 10px | 45 |  |
| `--r-md` | 14px | `--r-md` | 14px | 43 |  |
| `--r-lg` | 18px | `--r-lg` | 20px | 8 | 值改为设计稿 20 |
| `--r-xl` | 24px | `--r-xl` | 24px | 2 |  |
| `--r-pill` | 999px | `--r-pill` | 999px | 73 |  |
| `--fs-11` | 11px | `--fs-caption` | 11px | 1 |  |
| `--fs-12` | 12px | `--fs-label` | 11.5px | 2 |  |
| `--fs-13` | 13px | `--fs-body-sm` | 13px | 3 |  |
| `--fs-14 … --fs-28` | — | **删除** | — | 0 | 没有使用，删除 |
| `--lh-tight / --lh-body` | 1.25 / 1.55 | **删除** | — | 0 | 没有使用，删除（新：--lh-title 1.35、--lh-body 1.55） |
| `--ff` | Noto Sans SC… | `--font` | 按语言 | 52 | 见「字体」 |
| `--ff-serif / --ff-display / --ff-tight` | Noto Serif SC / Newsreader | `--font` | 按语言 | 94 | 去掉衬线体（RD-09） |
| `--ff-mono` | JetBrains Mono | `--font-num` | SF Pro Rounded | 25 | 数字、元信息用设计稿的数字字体 |

`--sp-*`、`--ctl-*`、`--tap-min`、`--z-*` 不是颜色 / 圆角 / 字号，名字不变。

## Web：其他两处颜色源

`app/layout.tsx` 根样式（公开页、登录前页面用）：

| 旧变量 | 旧值 | → 新变量 |
| --- | --- | --- |
| `--orbit-ink` | `#17211b` | `--ink` |
| `--orbit-muted` | `#52645b` | `--ink-2` |
| `--orbit-field` | `#f3f6f4` | `--bg` |
| `--orbit-line` | `#d6ddd8` | `--line` |
| `--orbit-deep` | `#245b4e` | `--accent-text` |
| `--orbit-signal` | `#b85a42` | `--coral-text` |

`orbit-0918-tokens.ts`（`orbit-landing-0918.tsx`、`o/orbit-real-organizer-public.tsx` 引用）：改为引用新 CSS 变量，常量对象按新名字重写。

| 旧常量 | 旧值 | → 新 token |
| --- | --- | --- |
| `ORBIT_0918_COLORS.ink` | `#0E1225` | `ink` |
| `ORBIT_0918_COLORS.text2` | `#3B3F7A` | `ink-2` |
| `ORBIT_0918_COLORS.text3` | `#6B6F99` | `ink-3-text` |
| `ORBIT_0918_COLORS.text4` | `#9FA3C4` | `ink-3-text` |
| `ORBIT_0918_COLORS.pageBg` | `#FBFBFE` | `bg` |
| `ORBIT_0918_COLORS.panel` | `#ECEEFB` | `surface-2` |
| `ORBIT_0918_COLORS.panelSoft` | `#F7F7FD` | `surface` |
| `ORBIT_0918_COLORS.border` | `#E8E9F6` | `line` |
| `ORBIT_0918_COLORS.borderStrong` | `#DDDEFA` | `ink-4` |
| `ORBIT_0918_COLORS.accent` | `#4B4FC7` | `accent-text` |
| `ORBIT_0918_COLORS.accentDeep` | `#2E3270` | `plum-900` |
| `ORBIT_0918_FONTS.serif` | `Noto Serif SC` | `font（删除衬线）` |
| `ORBIT_0918_FONTS.sans` | `Noto Sans SC` | `font` |

## 字体（RD-09）

| 语言 | 字体栈 |
| --- | --- |
| 日文（默认，未知语言也用它） | Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, -apple-system, BlinkMacSystemFont, system-ui, sans-serif |
| 中文 | PingFang SC, Noto Sans SC, Hiragino Sans GB, -apple-system, BlinkMacSystemFont, system-ui, sans-serif |
| 英文 | -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif |
| 数字 | SF Pro Rounded, -apple-system, SF Pro Display, system-ui, sans-serif |

Web 删除 Noto Serif SC、Newsreader、JetBrains Mono 的使用；Noto Sans JP 用 Google Fonts，只加载 400 / 500 / 700 / 800，只在根 layout 加载一次（删掉现在 4 处重复插入）。App 用 iOS 系统字体，不打包字体。

## 已知例外：0918 写死颜色（不在本 Sprint）

`app/(app)/app/` 下共 2,802 处十六进制颜色，分布在 75 个文件。下列文件在功能 Sprint 重做前保持旧颜色：

| 文件 | 写死颜色数 |
| --- | --- |
| `app/(app)/app/contacts/network-0918/network-shell.tsx` | 380 |
| `app/(app)/app/events/events-0918/events-shell.tsx` | 311 |
| `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts` | 246 |
| `app/(app)/app/events/ops-0918/ops-shell.tsx` | 225 |
| `app/(app)/app/contacts/card-batch-0918/card-batch-styles.ts` | 177 |
| `app/(app)/app/profile/onboarding-0918/onboarding-styles.ts` | 152 |
| `app/(app)/app/orbit-reference-styles.tsx` | 130 |
| `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts` | 121 |
| `app/(app)/app/profile/profile-0918/profile-shell.tsx` | 112 |
| `app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts` | 106 |
| `app/(app)/app/orbit-theme.tsx` | 66 |
| `app/(app)/app/orbit-starfield-mobile.tsx` | 64 |
| `app/(app)/app/orbit-starfield-desktop.tsx` | 63 |
| `app/(app)/app/start/start-guide-styles.ts` | 62 |
| `app/(app)/app/events/ops-0918/ops-model.ts` | 56 |
| `app/(app)/app/agent/iorbit-0918/iorbit-plan-card-styles.ts` | 52 |
| `app/(app)/app/contacts/network-0918/network-import-styles.ts` | 42 |
| `app/(app)/app/account/auth-0918/auth-modal.tsx` | 33 |
| `app/(app)/app/agent/iorbit-0918/console-styles.ts` | 29 |
| `app/(app)/app/orbit-landing-0918.tsx` | 27 |
| `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx` | 26 |
| `app/(app)/app/events/events-0918/events-model.ts` | 25 |
| `app/(app)/app/profile/goal-editor/goal-editor.tsx` | 23 |
| `app/(app)/app/orbit-starfield-mobile-logic.ts` | 19 |
| `app/(app)/app/o/orbit-real-organizer-public.tsx` | 19 |
| `app/(app)/app/orbit-starfield-desktop-logic.ts` | 18 |
| `app/(app)/app/events/events-0918/community-card.tsx` | 18 |
| `app/(app)/app/contacts/network-0918/network-import.tsx` | 18 |
| `app/(app)/app/events/[id]/register/event-registration-workspace.tsx` | 16 |
| `app/(app)/app/profile/profile-0918/profile-legacy-settings.tsx` | 15 |
| `app/(app)/app/orbit-global-ask/orbit-global-ask-styles.ts` | 11 |
| `app/(app)/app/orbit-0918-tokens.ts` | 11 |
| `app/(app)/app/contacts/network-0918/network-model.ts` | 11 |
| `app/(app)/app/contacts/network-0918/contact-value-line.tsx` | 11 |
| 其余 41 个文件 | 各 <10 |

其中 `orbit-reference-styles.tsx`、`orbit-theme.tsx` 的十六进制属于本 Sprint 要删的变量层，第 4 步后会大幅减少；星空首页场景（`orbit-starfield-*`）的星空画面颜色属于场景插画，保留。

## 确认记录

| 日期 | 确认人 | 结论 | 修改意见 |
| --- | --- | --- | --- |
| | 产品负责人 | 待确认 | |
