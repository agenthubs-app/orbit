# Orbit Web UI/UX 系统性审计报告

日期：2026-07-25 ｜ 分支：chat-agent ｜ 方法：代码静态盘点（全量 grep + 逐文件走查，见 `.superpowers/sdd/ui-audit-code-report.md`）+ 浏览器实测（1280×800 与 390×844，深浅两主题，computed style 定量普查，见 `.superpowers/sdd/ui-audit-live-findings.md`）。本报告只诊断，未改任何代码。

---

## 一、总体诊断

**这套 UI 的问题不是"没有设计系统"，而是"设计系统存在但没人被迫使用它"。**

证据链：`.btn` 按钮体系定义完整（7 种变体 + hover/active/disabled/loading/danger 状态齐全，orbit-reference-styles.tsx:573-669），但 222 个 `<button>` 里只有 61 个（27.5%）使用它；`IconButton` 和 `FormField` 两个共享原语设计完善但**外部使用为 0 次**；共享 `ModalShell` + `useOrbitModalA11y` a11y hook 都存在，但 4 个主要对话框里只有 1 个复用。于是每个页面各写各的：全站实测 16+ 种字号（含 21.84px、12.5px 这类手调值）、10 种字重（含 650/660/680/720/750 非标准值）、24 种圆角写法、22 种 gap 值、9 个孤立 z-index 字面量。

视觉大方向（暖纸色/星空深色、衬线标题、胶囊 chip）是统一的、有辨识度的——远看协调，细看每个组件的几何参数都在漂移。深浅双主题结构完整（token 双套定义 + data-theme 切换），但对比度从未按主题独立校验过：实测浅色 5 处、深色 3 处 WCAG AA 违规，包括深色下"注册"主 CTA 只有 3.4:1。

**一个架构级隐患**：核心设计 token（`--r-*` 圆角等）的定义不在任何源码文件里，而是藏在 `public/orbit-reference/orbit-reference.html` 原型资产内、运行时抽取注入。代码里 152 处引用 grep 不到定义（本次代码审计一度误判为"全站圆角失效"）。开发者无法发现、无法修改、无法演化这些 token——这是"系统存在但无人使用"的根本原因之一：**系统本身是隐形的**。

## 二、最大的不统一来源（根因排序）

1. **Token 事实源不可见**：圆角等基础 token 定义在原型 HTML 资产里，运行时注入；代码里只见 `var(--r-sm)` 不见 `--r-sm: 10px`。写新组件的人（包括 AI）看不到可用值域，只能拍数字。
2. **四套 token 系统同时加载**：`orbit-reference-styles.tsx`（`--bg/--accent/…`，产品层）、`orbit-theme.tsx`（浅色覆盖）、`app/globals.css`（`--orbit-canvas/…`，dev workbench 用但全站引入）、`app/layout.tsx` 内联 globalStyles（`--orbit-ink/…`，第四套前缀）。同一页面四套变量并存，`globals.css` 的裸 `button,input{…}` 规则还会污染一切未被 `[data-orbit-real-page]` 覆盖的控件（checkbox bug 的根源）。
3. **inline style 是默认写法**：无 Tailwind、无 CSS Modules，样式 = 手写 CSS 字符串 + `style={{}}`。没有任何 lint/类型约束阻止 `fontSize: 21.84` 这种值进入代码。
4. **共享组件零强制力**：`ModalShell`/`IconButton`/`FormField` 存在但采用率 0-30%，新代码默认复制邻近页面的手写样式（包括复制它的错误）。
5. **补丁文化留痕**：checkbox 污染 5 处里逐个修了 2 处（today、all-actions），3 处仍裸奔；弹窗遮罩曾因全局 reset 失效（P0），修法是给 4 个不同类名逐个补 `background:var(--scrim)` 而不是收敛为一个组件——代码注释自证（orbit-reference-styles.tsx:1909-1914）。

## 三、问题清单（按优先级）

### P0 — 功能性/可访问性缺陷，建议立即修

| # | 位置 | 问题 | 真实依据 | 根因 | 修改建议 |
|---|---|---|---|---|---|
| P0-1 | 全站深色主题顶栏「注册」主 CTA（orbit-public-shell.tsx 账号区 + orbit-theme.tsx accent 值） | 主按钮文字对比度 3.4:1 < 4.5:1 | 深色实测 13.5px/600 白字紫底 3.4:1 | 深色 `--accent` 亮度偏高、`--on-accent` 未按主题校验 | 深色主题单独调 `--accent`（加深）或 CTA 文字改深色；在 token 层修，一处生效全站 |
| P0-2 | contacts 关系强度 chip「强关系」（orbit-real-contacts.tsx） | 12.5px/600 绿字 3.3:1 | 浅色实测 | 语义色 `--live` 直接当文字色用在浅背景 | 定义 `--live-text`（加深版）用于文字，`--live` 只用于点/背景 |
| P0-3 | today 列表副行（"Meridian AI" 等，orbit-real-today.tsx 用 --text-3） | 13px 副文本 3.5:1 | 浅色实测 | `--text-3` 浅色值过浅，凡 13px 以下用它即违规 | 调 `--text-3` 浅色值至 ≥4.5:1（对 --surface）；全站受益 |
| P0-4 | 全站顶栏：语言分隔符"/"（2.7:1）与铃铛徽标"7"（3.9:1，深浅两主题同挂） | 装饰符可豁免但徽标是信息载体 | 两主题实测 | 徽标红底白字尺寸小、红色偏亮 | 徽标底色加深至 4.5:1；分隔符加 aria-hidden（已有）可降级接受 |
| P0-5 | `contacts/business-card-capture-workspace.tsx:761,809`、`events/[id]/register/page.tsx:328` | 3 处 checkbox 仍被全局裸 `input{min-height:40px;width:100%;border;padding}` 污染，渲染成 40px 高全宽边框盒 | globals.css:87-102 无 type 排除；5 处用点仅 2 处手工修过 | 逐案例打补丁而非源头修复 | 在 globals.css 加一条 `input[type="checkbox"],input[type="radio"]{width:auto;min-height:0;padding:0;border:0;background:none}`，然后删掉 today/all-actions 两处手工内联覆盖 |
| P0-6 | `register/orbit-real-register.tsx`（返回图标按钮，38h 胶囊） | 无 accessible name（textContent 空、无 aria-label） | 实测 census `no-name` | 手写 icon 按钮不走 `IconButton`（它强制 ariaLabel prop） | 补 aria-label；根治见 P1-3 |
| P0-7 | `account/orbit-real-account-auth.tsx:147-152`、`dashboard/orbit-real-party.tsx:676-720`（PersonDetailOverlay） | 两个对话框**无 Tab 焦点陷阱**；且全部弹层（含收件箱 sheet）无 `role="dialog"`/`aria-modal` | 代码走查 + 实测（sheet z=300 无 role） | 4 处各自手写 Esc 监听，只有 admin 用了共享 `useOrbitModalA11y` | 统一接入 `useOrbitModalA11y`（focus trap+Esc+归位齐备）并在容器加 role/aria-modal；根治见 P1-4 |

### P1 — 系统性不统一，建议本迭代内修（先 token 后组件）

| # | 位置 | 问题 | 真实依据 | 根因 | 修改建议 |
|---|---|---|---|---|---|
| P1-1 | token 层 | `--r-*` 六个圆角 token 定义藏在 `public/orbit-reference/orbit-reference.html`，源码 0 定义、152 处引用、仅 1 处带 fallback | grep 0 命中定义；运行时 getPropertyValue 实测 sm=10/md=14/pill=999 | 原型资产被当作运行时 token 源 | 把全部 token 定义**迁入** orbit-reference-styles.tsx 的 `[data-orbit-real-page]` 块（值照抄运行时现值），原型资产降级为纯参考 |
| P1-2 | 全部 36 页 | 按钮遵守率 27.5%：161 个 inline-style 按钮，高度 29/30/36/40/44/48 六档、圆角 7/8/9/10/11/16 并存；同文件 orbit-real-contacts.tsx:784/840/1288/1309 四种圆角写法 | 代码 census + 实测按钮抽样 | `.btn` 无强制力 | 见「五、统一规则」按钮规范；分批迁移，新代码即日起只许用 `.btn` 变体 |
| P1-3 | ≥38 处手写图标按钮 | `IconButton` 原语 0 使用 | grep 仅命中定义文件 | 原语无人知晓 | 决定：启用（迁移 38 处）或删除原语二选一；建议启用——它自带 ariaLabel 强制与统一尺寸 |
| P1-4 | 5 套弹层实现 | ModalShell(3 处)/Drawer(收件箱)/CreateEventModal/AccountAuth/PersonDetailOverlay 各写遮罩+Esc；遮罩写法 2 种；z-index 9 个字面量（1/5/20/40/60/90/100/200/300/9999）无 scale；**主题悬浮球 z=9999 压在收件箱 sheet(z=300) 之上**（实测截图） | 代码 C 节 + 实测 | 无弹层标准 | 见「五」弹层规范 + z scale；主题球降到 overlay 之下 |
| P1-5 | 全站排版 | 字号 22 个离散值（21.84/12.5/13.5/11.5/14.5/10.5…）、字重 10 个值（650/660/680/720/750）、lineHeight 19 个值、gap 22 个值 | grep 完整分布 + 实测逐页 census | 无 scale、inline 无约束 | 见「五」type/spacing scale；先 lint 禁增量，再分批 snap |
| P1-6 | `FormField` 0 使用；错误态 4 种写法并存（is-invalid/field-error/role=alert/aria-invalid 各 1-6 处）；42 处 placeholder vs 37 个 label | 表单无统一路径 | 代码 F 节 | 原语无强制力 | 表单统一走 FormField（其设计已含 label+helper+error+aria 组合） |
| P1-7 | token 加载架构 | 四套变量系统全站并存；globals.css（dev 用）被 `app/(app)/app/layout.tsx:6` 全站引入 | 代码 A.3 | 历史分层未清理 | globals.css 移到 `app/dev/layout.tsx` 引入；根 layout 的 globalStyles 缩小作用域或并入产品 token |

### P2 — 一致性打磨，排队修

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| P2-1 | `schedule/page.tsx`（531 行）、`schedule/events/[id]/page.tsx`（274 行） | 全站唯二不走「薄壳 page + orbit-real-* 组件」模式的页面，裸 JSX 写在 route 文件里 | 抽出 orbit-real-schedule-page.tsx，对齐仓库模式 |
| P2-2 | `orbit-theme.tsx` 主题切换按钮 | 图标是 emoji ☀/🌙，全站其余图标为统一 stroke SVG（Icon 原语） | 换 Icon（sun/moon 需补两个 path） |
| P2-3 | `--ff-tight` 三处定义语义漂移（衬线→Newsreader→=--ff） | 同名 token 含义随上下文变化 | 拆成 `--ff-serif` / `--ff-display` 两个语义 token |
| P2-4 | heading 层级：contacts h1→h3 跳级、agent 首标题 h2 | 实测 | 修正标签层级（样式用 class 保持不变） |
| P2-5 | 路由/组件命名：`dashboard/page.tsx` 渲染 `OrbitRealParty` | 代码 A.1 | 更名对齐 |
| P2-6 | 阴影 ~20% 手写（event-registration-workspace 三处 color-mix 投影、agent 两处） | 收敛到 --sh-* 五档 |

### P3 — 低风险观察项

- 联系人姓名移动端截断偏激进（"Kenji Wat…"，390px 实测）——列宽/字号权衡后再定。
- 641-760px 区间：桌面导航 + 单列内容的断点缝（前次终审已备案）。
- 品牌标语 9px/3.8:1——ui 基准原样，属品牌装饰，可豁免或整体放大至 10px。
- 收件箱 sheet 宽度可拖但无 role="separator" 键盘等价操作。

## 四、按钮与弹层专项结论

**按钮**：规范已存在且质量不错——`.btn` 44h/15px/600 + primary/dark/soft/ghost/quiet/danger/danger-soft 七变体 + sm/lg 尺寸 + disabled/loading/active 状态。缺的只有 `.btn:focus-visible` 专属环（现靠全局兜底）。**问题纯粹是 72.5% 的按钮不用它。** 实测同层级动作规格漂移：today 主按钮 44h/r10、contacts 操作 36h/r7、agent 发送 40h/r8、events 回看 30h/r7——四页四个标准。**建议：不新建体系，把 `.btn` 当唯一标准强制执行**，仅补 focus-visible 规则与 `.btn-icon`（吸收 IconButton）。

**弹层**：五套实现三种关闭行为两种遮罩写法，a11y 覆盖参差（2/4 无焦点陷阱、全部无 role="dialog"）。共享件（ModalShell + useOrbitModalA11y）功能上已够用但互相不引用、覆盖率 30%。**建议：合并成一个 `OrbitModal`（variant: dialog | sheet | bottom-sheet），内置 scrim/Esc/焦点陷阱/role/关闭按钮/移动端行为**，四个手写弹窗全部迁入；z-index 建 scale（见下）。

## 五、推荐统一规则（值全部取自现有实际使用峰值，非重新设计）

```
/* Typography scale（8 档，snap 目标） */
--fs-caption: 11px;  --fs-body-sm: 12px;  --fs-body: 13px;  --fs-body-lg: 14px;
--fs-title-sm: 15px; --fs-title: 18px;    --fs-headline: 22px; --fs-display: 28px;
/* 半像素值（12.5/13.5/…）与 21.84 全部就近吸附 */

/* Weight（4 档） */ 400 / 500 / 600 / 700   /* 650~750 → 600 或 700 */

/* Line-height（3 档） */ --lh-tight: 1.2; --lh-normal: 1.5; --lh-relaxed: 1.65;

/* Spacing（4px 网格 8 档） */ 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48
/* 6,7,9,11,13 等 → 就近吸附 */

/* Radius（迁入代码并定死，值=当前运行时实测） */
--r-xs: 7px; --r-sm: 10px; --r-md: 14px; --r-lg: 18px; --r-xl: 24px; --r-pill: 999px;
/* 内联数字 8/9/11/12/13/16 → 就近吸附到 token */

/* Z-index scale */
--z-raised: 10; --z-sticky: 100; --z-dropdown: 200; --z-overlay: 300;
--z-modal: 400; --z-toast: 500; --z-debug: 900;
/* 主题悬浮球从 9999 降至 --z-sticky；收件箱 sheet=--z-overlay；ModalShell=--z-modal */

/* Shadow：沿用现有 --sh-xs/sm/md/lg/pop 五档（遵守率已 80%，只做收尾迁移） */

/* Color 语义补充（现有 token 之上） */
--live-text / --amber-text / --rose-text: 各语义色的"文字级"加深版（≥4.5:1）
深色主题独立校验 --accent 与 --on-accent、--text-3
```

**按钮规范**：`.btn`（44h）+ `.btn-sm`（36h）+ `.btn-lg`（52h）为仅有的三档高度；变体沿用现有七种；新增 `.btn-icon`（40×40，强制 aria-label）；补 `.btn:focus-visible` 环。
**弹层规范**：`OrbitModal` 单组件三形态；标题/正文/footer 结构固定；按钮顺序 [次要…主要] 右对齐；X 恒在右上；scrim 恒 `var(--scrim)` + blur(4px)；移动端 dialog→bottom-sheet 自动降级；宽度档位 440/560/720。

## 六、实施顺序（先根后叶，均可独立成批落地）

1. **第 0 批（半天，立即）**：P0 全部——4 处对比度 token 级修色、checkbox 全局排除规则（顺带删 2 处旧补丁）、返回按钮 aria-label、2 个弹窗接入 useOrbitModalA11y + 全部弹层补 role/aria-modal。全是点状修改，互不依赖。
2. **第 1 批（design tokens）**：radius token 迁入源码；z-index scale 落地并替换 10 处字面量；语义文字色补充；--ff-tight 拆分。此批**不改任何布局**，纯定义搬家，风险最低。
3. **第 2 批（shared components）**：OrbitModal 合并五套弹层；`.btn` 补 focus/icon 变体；FormField/IconButton 启用；globals.css 出全站作用域。每项配源码级回归测试（仓库已有 tests/ui 的 source-gate 模式可复用）。
4. **第 3 批（逐页 snap，分四波）**：today+all-actions（代码最新）→ contacts 五页 → events 三页 → agent/home/profile/admin。每波做：按钮迁 `.btn`、字号/字重/间距/圆角吸附 scale、heading 层级修正。用「本页 census 违规数」做完成度量（现值已留档可对比）。
5. **第 4 批（防回归）**：加一条 CI 级 source-gate 测试：grep 禁止新增非 scale 字面量（fontSize/fontWeight/gap/borderRadius/zIndex 白名单校验）——这是把"系统有但没人用"变成"不用过不了 CI"的关键一步。

---
附录索引：代码证据全文 `.superpowers/sdd/ui-audit-code-report.md`（36 路由清单、按钮/弹层/表单逐项 file:line）；运行实测全文 `.superpowers/sdd/ui-audit-live-findings.md`（逐页字号/圆角/按钮/对比度分布）。
