# Sprint R43 — 选可约时间：一周 30 分钟格子 + 拖选（App + Web）

日期 2026-11-17 · 依据：用户定稿原型 `docs/designs/contact-reach-2026-11/index.html` ⑧（App）⑨（Web）（提交 aad73dea7）。
用户裁决（2026-11-17）：拖出的连续格子 = **一段可约时间**，按会面时长切成候选；先原型后代码；两端一起改。

## 范围

替换「插入候选时间」弹层里的选时段方式（只改 insert 模式；改期 `MeetingProposalModal` 不带 `mode` 的原路径、`MeetingProposalSheet` 不动）：

- Web：`repos/orbits/app/(app)/app/orbit-2026/calendar/MeetingSlotPicker.tsx`（+ `meeting-slot-picker.module.css`）。现为 1 小时网格单点。
- App：`repos/orbit-app/src/screens/calendar/MeetingSlotPickerSheet.tsx`。现为按天列表单点。
- 共用计算：`repos/orbits/shared/compute/meeting-slots.ts`（改完 `cd repos/orbit-app && npm run sync:contract` 同步，`contract-sync` / `compute-sync` 测试按字节比对）。
- 调用方：Web `network/ContactReachModal.tsx`、App `screens/network/ContactReachScreen.tsx`（只改邮件段落的生成，见 D5）。

## 规则（照原型，不得自行改）

- **D1 格子**：一周一张表，列 = 「可约时间」里的星期（`settings.weekdays`），行 = 设置的起止每 30 分钟（`availabilityGrid(..., durationMinutes: 30)` 给每格状态）。‹ › 翻周，本周起，最远今天 +14 天（与现行一致）。过去 / off 格子画虚线、不可涂；busy 斜纹、不可涂；unknown 可涂（沿用现有「未確認」样式与图例）。
- **D2 点选**：按下后未移动就抬起 = 点。点未涂格 → 从该格起往下涂「会面时长」那么多格（30→1 格、60→2、90→3），遇到不可涂格或行尾就停在那里（可能短于时长，按 D4 显示为短段）。点已涂格 → 删除该格所在的整段（同一天连续已涂格）。
- **D3 拖选**：按下后移动 = 拖。以按下格与当前格为对角的矩形（可跨天）；起点格未涂 = 涂，已涂 = 擦。矩形里不可涂的格子跳过（段自然断开）。拖动中实时预览（涂 = 深灰预览、擦 = 浅色预览），抬起才生效。
  - App：格子区域内按下即开始拖，不需要长按；格子区域禁止滚动（Web 用 `touch-action:none`；RN 用 PanResponder / Gesture 在格子容器上接管，坐标换算到格），表在弹层内一屏放下（行高 20pt），不与弹层 / 页面滚动冲突。
  - Web：pointer 事件 + `setPointerCapture`；键盘：格子可 Tab 聚焦，Space/Enter = 点（D2）。
- **D4 段 → 候选（站内信）**：段 = 同一天连续的已涂格。每段从段首起按「会面时长」切成**不重叠**的候选（10:00–12:00 · 60 分 → 10:00、11:00；余下不足一个时长的尾巴不发）。比时长短的段整段不发，画空心框（白底 + 深色描边）。候选按时间先后编号，**最多 5 个**发出，第 6 个起格子变浅色（#B9B3C0 一类，用 token）并提示「最多 5 个，浅色的 N 个不会发出」。少于 `minimum`（站内信 3）时提示「至少要 3 个时间，再涂一段」并禁用「插入」。改时长 = 重新切，已涂格不动。
- **D5 邮件（名片联系人，minimum=1）**：同一张表、同样操作；插入正文时**按段写**，不切候选、不限 5 个；只写长度 ≥ 时长的段。新增共用函数 `formatMeetingRangesText(ranges, {language, timeZone, durationMinutes, medium})`，首行与行格式：
  - ja：`以下の時間帯のうち、{n}分ほどお時間をいただけますでしょうか（オンライン）。` / `・11/18（水）9:00–11:00`
  - zh：`以下时间段里，任选 {n} 分钟您是否方便？（线上）` / `・11/18（周三）09:00–11:00`
  - en：`Would any {n} minutes within these times work for a {medium} call?` 一类（按现有 introLine 的 medium 措辞改写）/ `- Wed, Nov 18, 9:00–11:00`
  - 时间格式、星期、medium 后缀**沿用现有 `slotLine` / `introLine` 的写法**（同语言内与旧段落风格一致）；`replaceMeetingSlotsText` 必须能找回并替换新段落（凭 previous 原文，以及无 previous 时的段落形状识别：把新首行模板加进识别）。
- **D6 视觉**：照原型——已涂段连成整块（相邻格之间无缝、段首/段尾圆角），段内候选分界画一条细白线，候选首格左上角小号编号；图例：可约 / 已有安排 / 已过·不可约 / 未確認（有 unknown 时） / 已选 / 超出 5 个。颜色全部用两端现有 token，不写裸色值（Web 改 CSS 后跑 css-tokens 检查）。
- **D7 汇总**：Web 右栏实时列「会发出 N 个时间 · 各 M 分钟」+ 编号列表 + 提示；App 表下一行紧凑写法「会发出 N 个 · 各 M 分钟　1 周三 10:00　2 …」+ 提示。邮件模式汇总改为列段（「会写进正文的时间段」）。按钮「插入 N 个时间」（邮件：「插入 N 段时间」）。
- **D8 预选**：打开时沿用 `seedMeetingSlots` 的 3 个空档，把它们作为 3 段已涂（每段 = 时长）。`initial`（重开弹层）优先用 `initial.ranges`，旧数据只有 `slots` 时把 slots 当段。
- **D9 交回数据**：`MeetingSlotSelection` 加 `ranges: MeetingSlot[]`（已涂段，按时间排序，含短段以便重开还原）；`slots` = D4 发出的候选（≤5，排序）。站内信发送仍只用 `slots`（服务端 3–5 个不变，不改后端）。App 本机草稿 / Web sessionStorage 里旧的 selection 没有 `ranges` 要能读（当缺省）。
- **D10 文案**：三语，Web 进 `copy/task.ts`（`kind` 照现有）、App 进 i18n calendar；去 AI 感规则（标签说过的词值里不再说，按钮不配说明句）。删除不再使用的旧键（按天列表 / 1 小时网格专用的）。

## 不做

改期弹层、服务端、收件箱提议卡、可约时间设置页、公开预约页。

## 验收（SC）

| SC | 内容 | 证据 |
| --- | --- | --- |
| SC-R43-01 | 共用函数：`formatMeetingRangesText` 三语全文断言；`replaceMeetingSlotsText` 能替换新旧两种段落；切候选纯函数（建议 `sliceMeetingCandidates(ranges, durationMinutes, max)` 返回 {sent, extra, short}）覆盖整除 / 有尾巴 / 短段 / 超 5 / 跨天排序。App sync 后 contract/compute sync 测试通过。 | `tests/scheduling/meeting-slots.test.ts` 扩充 |
| SC-R43-02 | Web：点 = 涂一个时长、点已涂 = 删整段、竖拖 / 斜拖跨天、从已涂起拖 = 擦、busy/off 跳过、改时长重切、超 5 变浅 + 提示、<3 禁用、邮件模式按段插入正文、重开还原 ranges；改期回归（meeting-proposal-modal ja/zh/en、first、flow、calendar-workspace、meeting-availability）全绿。 | `tests/ui/contact-reach.test.tsx` 改写 / 新增 |
| SC-R43-03 | App：同 SC-02 的行为（用模拟手势：按下 / 移动 / 抬起换算到格）、20pt 行高一屏放下、离线规则不变。 | `tests/contact-reach-screen.test.tsx` 改写 / 新增 |
| SC-R43-04 | 两端定向测试改前改后对照，新增失败 0；orbits `tsc -p tsconfig.build.json` 0 错；App `tsc` 错误列表与改前一致；copy:qa forbidden 不增；css-tokens 通过。 | 基线对照 |

## 上下文包（Generator 先读这些，别全仓库搜）

- 原型：`docs/designs/contact-reach-2026-11/index.html` 末尾 ⑧⑨ 的 `<script>`（交互的参考实现，规则以本文件为准）。
- 现实现：上面「范围」里列的 4 个文件 + `calendar/meeting-slot-text.ts`（Web）/ App 同名工具、`scheduling-availability-client.ts`（两端）。
- R40 报告的 `meeting-slots.ts` 交接段：`docs/designs/redesign-2026-10/sprints/contact-reach/R40/REPORT.md`。
- R41 / R42 报告（偏离与裁决）：同目录 `R41/REPORT.md`、`R42/REPORT.md`。

## 纪律

- 改函数前跑 GitNexus impact（`node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`），HIGH/CRITICAL 写进报告。
- 共用工作区：另一个会话正在改 App 的 `AppScreen.tsx`、`Segmented.tsx`、`shell-navigation.ts` 等——**不要碰、不要提交这些文件**；提交一律 `git commit -- <路径>`，提交前 `git diff --cached --name-only` 确认只有自己的文件。
- zsh 不分词：多个测试文件用 bash 数组或直接列出；测试命令见各仓库 package.json。
- 不 push、不部署、不改服务端。
- 结束时把「提交 SHA 列表 / SC 结果与证据 / 基线对照数字 / GitNexus 风险 / 偏离与假设」作为最终回复交回（报告由主会话落盘）。
