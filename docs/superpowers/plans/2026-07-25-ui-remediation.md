# UI 补救计划：审计 P0+P1+P2 全量修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 每个任务是"精确规格 + 验证门"而非全量代码——涉及面太宽，实现者需先读现场再改，但**验证门是硬性的**。

**Goal:** 修完 `docs/superpowers/ui-ux-audit-2026-07-25.md` 的全部 P0（7 项）、P1（7 项）、P2（6 项）。

**对账表**：P0-1..7 → T1/T2/T4；P1-1 → T3；P1-2/3 → T5；P1-4 → T3+T4；P1-5 → T6；P1-6 → T7；P1-7 → T8；P2-1..6 → T9。T10 终验。

## Global Constraints

- 分支 `ui-remediation`（基于 chat-agent 94cd4af）。工作目录 `/Users/li/work/orbit/repos/orbits`。
- 全套件基线 **64 失败**（`npm test` 968/904/64）。任何任务不得新增失败；触碰对应源码的门测试必须全绿。
- dev server 由控制器管理（3000 端口，起停勿动；若 down 记录并跳过 curl）。
- 视觉回归红线：修对比度只调 token 值与消费点，不改布局几何；除任务明示外不改 DOM 结构。
- commit 尾注 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`；每任务一个 commit（T9 可两个）。
- 审计证据文件（值域、file:line）：`.superpowers/sdd/ui-audit-code-report.md`、`.superpowers/sdd/ui-audit-live-findings.md`。

---

### T1 对比度修复（P0-1/2/3/4）+ 返回按钮命名（P0-6）

**改动规格（token 层为主）：**
1. **P0-1 注册胶囊**：`orbit-public-shell.tsx` 中未登录注册 `<a>` 的 `color: "var(--on-dark)"` → `"var(--on-accent)"`。深色 on-accent=#0B0A15 对 #8B7BF0 ≈7:1；浅色 #fff 对 #176a73 ≈6:1。
2. **P0-3 --text-3 浅色值**：`orbit-theme.tsx` 通用浅色块 `--text-3: #7b838a` → `#5B646B`（对 #fff ≈5.4:1，对浅 surface ≥4.6:1）。若同文件另一块（account-auth 专属）也 <4.5 一并调。
3. **P0-2 语义文字色**：`orbit-reference-styles.tsx` 深色块与 `orbit-theme.tsx` 浅色块各新增：`--live-text`（深:#7FE0B4 浅:#0E7A3C）、`--amber-text`（深:#F0C374 浅:#8A5A00）、`--rose-text`（深:#F09AA4 浅:#B4232E）。然后 `grep -rn 'color: "var(--live)"' app` 把**用作文字色**的 `--live/--amber/--rose` 消费点换成对应 `-text` token（背景/圆点用法不动）。
4. **P0-4 徽标**：`inbox/relationship-inbox-panel.tsx` 徽标 `background: "var(--signal, #e5484d)"` → 深浅两主题各定义 `--signal`（深:#E5484D 可保留——深色底上白字须实测；浅:#C8323B），fallback 同步 #C8323B；目标白字 ≥4.5:1。
5. **P0-6**：`register/orbit-real-register.tsx` 的无名返回图标按钮补 `aria-label={t({ en: "Back", zh: "返回" })}`（确认 t 在作用域；否则用双语常量）。

**验证门：** 新建 `tests/ui/orbit-contrast-tokens.test.ts`：解析 orbit-reference-styles/orbit-theme 源码中上述 token 的 hex 值，用 WCAG 公式断言——浅色 `--text-3` 对 #FFFFFF ≥4.5、浅色 `--live-text` 对 #FFFFFF ≥4.5、`--on-accent`(浅) 对 `--accent`(浅) ≥4.5、`--signal`(浅) 与 #fff ≥4.5（把 hex→ratio 的计算函数写进测试）。跑该测试 + `tests/ui/orbit-top-nav-structure.test.ts`。控制器将做浏览器复测。

### T2 checkbox 源头修复（P0-5）

`app/globals.css` 裸 `input` 规则后追加：
```css
input[type="checkbox"], input[type="radio"] {
  background: none; border: 0; border-radius: 0; min-height: 0; padding: 0; width: auto;
}
```
删除两处旧补丁的**尺寸复位部分**（`today/orbit-today-decision-form.tsx:95`、`contacts/all-actions/orbit-all-actions-settings.tsx:37` 的 `minHeight:0,padding:0`——保留各自的 height/width/flexShrink 视觉尺寸设定）。验证：`node --test --import tsx tests/pages/app-today-decision-panel.test.tsx tests/pages/app-all-actions-settings.test.tsx`；curl `events/[id]/register` 页 200；控制器浏览器查 business-card-capture 复选框。

### T3 radius + z-index token 入源码（P1-1 + P1-4 z 部分）

1. `orbit-reference-styles.tsx` 的 `[data-orbit-real-page]` token 块新增（值=运行时实测/原型现值，实现者先在浏览器或原型资产确认 xs/lg/xl 现值再定，已知 sm=10 md=14 pill=999）：`--r-xs/--r-sm/--r-md/--r-lg/--r-xl/--r-pill`。
2. 新建 `app/(app)/app/orbit-z.ts`：`export const ORBIT_Z = { raised: 10, sticky: 100, dropdown: 200, overlay: 300, modal: 400, toast: 500, debug: 900 } as const;` 替换内联 zIndex 字面量（audit C.3 的 10 处：60→dropdown、90/100→sticky、200→modal(toast 用 toast)、300→overlay、1/5/20/40→raised 或删除按语义定）；`orbit-theme.tsx` 主题球 `z-index:9999` → `100`（sticky，弹层之下）。
3. 门测试 `tests/ui/orbit-z-scale.test.ts`：源码 grep 断言 (a) `--r-sm:`/`--r-pill:` 等 6 token 在 orbit-reference-styles.tsx 有定义；(b) `app/(app)/app` 内联 `zIndex: [0-9]` 字面量数 ≤ 2（白名单注明）；(c) 主题球不再 9999。验证后控制器浏览器确认收件箱 sheet 盖过主题球。

### T4 弹层统一（P0-7 + P1-4）

1. **ModalShell 重构**（orbit-account-shell.tsx）：内联焦点陷阱替换为 `useOrbitModalA11y`；容器加 `role="dialog" aria-modal="true"`（label 已有→aria-label）；zIndex 用 ORBIT_Z.modal；新增 prop `variant?: "dialog" | "bottom-sheet"`（bottom-sheet：贴底、上圆角 --r-xl、宽 min(100%,460px)）。
2. **迁移**：`account/orbit-real-account-auth.tsx`（补焦点陷阱——迁入 ModalShell 或直接接 hook+role，取改动小者但必须两全）；`dashboard/orbit-real-party.tsx` PersonDetailOverlay → ModalShell variant="bottom-sheet"；`admin/orbit-real-admin.tsx` CreateEventModal → ModalShell（its hook 用法收进来）。
3. **收件箱 drawer**（保持自有实现）：容器加 `role="dialog" aria-modal="true" aria-label`，zIndex→ORBIT_Z.overlay，its Esc/焦点陷阱已有勿动。
4. 门测试 `tests/ui/orbit-modal-standard.test.ts`：源码断言 (a) ModalShell 含 role="dialog" 与 useOrbitModalA11y；(b) account-auth/party/admin 三文件不再有独立 `addEventListener("keydown"`（各自的 Esc 手写实现删除）；(c) relationship-inbox-panel 含 aria-modal。全套跑 `tests/pages/*.test.tsx` 相关 + 控制器浏览器实测四弹层开合/Esc/Tab 圈。

### T5 按钮体系强制（P1-2 + P1-3）

1. `orbit-reference-styles.tsx`：新增 `[data-orbit-real-page] .btn:focus-visible{outline:2px solid var(--accent-ring); outline-offset:2px}`；新增 `.btn-icon{width:40px;height:40px;padding:0;border-radius:var(--r-sm)}`（继承 .btn 其余状态）。
2. `IconButton` 原语改为渲染 `className="btn btn-icon btn-quiet"`（保留 ariaLabel 强制、variant plain→btn-ghost）。
3. **迁移核心五面**（today、contacts/all-actions、contacts 列表、agent、events explore）：这五个文件内所有 inline-style `<button>`（含 icon 按钮）改用 `.btn` 变体或 `IconButton`；无法直接套的（拖拽手柄、checkbox label 等非按钮语义）豁免并注释。其余页面不动（由 ratchet 看住）。
4. **Ratchet 门** `tests/ui/orbit-button-ratchet.test.ts`：统计 `app/(app)/app` 中 `<button` 总数与含 `className*="btn"` 数，断言非 btn 按钮数 ≤ 迁移后实测值（写死具体数字 + 注释"只许降不许升"）；另断言五个核心文件内非 btn 按钮数为 0（豁免清单常量列出）。

### T6 排版/间距 scale + ratchet（P1-5）

1. token 注释块（orbit-reference-styles.tsx 顶部）写明 scale：fs 11/12/13/14/15/18/22/28、weight 400/500/600/700、lh 1.2/1.5/1.65、gap 4/8/12/16/20/24/32/48、radius 用 --r-*。
2. **snap 四文件**（audit 实测最大偏移源）：`today/` 两组件、`contacts/all-actions/` 三组件、`agent/orbit-real-agent.tsx`、`contacts/orbit-real-contacts.tsx`——文件内 fontSize/fontWeight/gap/borderRadius 字面量就近吸附 scale（21.84→22、12.5→13、13.5→13、650/660/680→600、720/750→700、gap 6→8 等；数值仅按钮/文本几何，图形坐标类如 starfield 不碰——这些文件没有）。
3. **Ratchet 门** `tests/ui/orbit-scale-ratchet.test.ts`：grep 统计全 `app/(app)/app` 的 (a) 非 scale fontSize 值出现次数 (b) 非标准 fontWeight（∉{400,500,600,700,800}）次数 (c) 非 scale gap 次数——各断言 ≤ snap 后实测基线（写死数字），四个 snap 过的文件断言为 0。
4. 跑受影响页全部既有测试 + 控制器截图对比（视觉不应有可感知跳变——13.5→13 级别）。

### T7 表单统一（P1-6）

1. `FormField` 启用：`register/orbit-real-register.tsx`（邮箱字段）、`account/orbit-real-account-auth.tsx`（登录/注册全部字段）、`admin` CreateEventModal 字段迁入 `FormField`（label/helper/error 走原语；视觉如有出入允许给 FormField 加 className 透传）。`events/[id]/register` workspace 字段多、结构复杂：仅统一其错误态标记（下一条），不强迁 FormField，注释豁免。
2. 错误态唯一化：全库 `is-invalid`/`field-error` 手写处（各 2 处）对齐 FormField 的组合（`aria-invalid` + `role="alert"` + `.field-error-text`）。
3. 门测试 `tests/ui/orbit-form-standard.test.ts`：断言 FormField 外部引用 ≥3 文件；`app/(app)/app` 中 `role="alert"` 计数 ≥ 现值；三个迁移文件内不再出现裸 `className="field-error"`。

### T8 globals.css 出全站作用域（P1-7）

1. 先调查：`grep` dev 页与 (app) 页对 `--orbit-*` 变量、`.orbit-page` 等 globals 类的依赖面；浏览器对比引入前后 register/account 表单渲染。
2. 方案（按调查取其一，优先 a）：(a) globals.css 全部规则包进 `@scope`不可用则改为 `.orbit-dev-root` 前缀 + `app/dev/layout.tsx` 挂根类并单独 import；(b) 若 (app) 表单确有依赖，把裸 input 基线规则复制成 `[data-orbit-real-page] input[...]` 收进 orbit-reference-styles 再做 (a)。
3. `app/(app)/app/layout.tsx:6` 移除 `import "../../globals.css"`。
4. 验证：控制器逐页截图比对（register/account/admin/today 表单不得裂）；全套件基线不升。若调查发现依赖面过大不可安全剥离，**允许降级**：globals.css 保留但把裸 `button,input{}` 规则改为 `:where(.orbit-dev-root) button,...` 限定（消除污染即达标），报告中说明。

### T9 P2 六项

1. **P2-1**：`schedule/page.tsx`（531 行）与 `schedule/events/[id]/page.tsx`（274 行）抽出 `orbit-real-schedule-page.tsx` / `orbit-real-schedule-event.tsx`，page.tsx 变薄壳（对齐 34 个页面的模式；纯移动 JSX，零逻辑改动）。
2. **P2-2**：`Icon` 原语补 `sun`/`moon` 两个 stroke path；`orbit-theme.tsx` 切换按钮 ☀/🌙 → `<Icon name>`。
3. **P2-3**：`--ff-tight` 拆分：新增 `--ff-serif`（衬线正文标题）与 `--ff-display`（landing Newsreader）；三处定义与全部消费点按语义改引；`--ff-tight` 保留为 `var(--ff-serif)` 别名（防漏改）。
4. **P2-4**：contacts 首屏 h1→h3 跳级处补层级或降级为 h2；agent 首标题 h2→h1（样式以 class/inline 保持不变）。
5. **P2-5**：`dashboard/page.tsx` 处加导出别名 `OrbitRealDashboard`（= OrbitRealParty）并在 route 使用；文件顶注释说明复用关系。
6. **P2-6**：`event-registration-workspace.tsx:582/805/884`、`agent/orbit-real-agent.tsx:1193/1223` 的手写 boxShadow → 最接近的 `var(--sh-*)`（视觉差异大者允许保留但加 `/* custom-shadow: reason */` 注释豁免，至多 2 处）。
7. 门：既有 nav/schedule/agent 相关测试全绿 + `tests/ui/orbit-p2-gates.test.ts`（sun/moon 存在、切换按钮无 emoji、--ff-serif 已定义、schedule page.tsx 行数 <80）。

### T10 终验

`npm run lint`（新文件零错）→ `npm test`（≤64 失败、零新增）→ 控制器浏览器全面复测（对比度重扫、四弹层、checkbox 三处、z 层级、核心五面截图）→ 整分支终审（最强模型）→ 修 Critical/Important → 合并 chat-agent。

## Follow-up（明确不在本计划）
- P3 四项（姓名截断、641-760 断点缝、9px 标语、sheet 键盘 resize）。
- 非核心页面按钮/scale 迁移（ratchet 看住存量，后续分批）。
