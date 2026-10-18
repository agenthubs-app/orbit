# R31b 预检（PLANNER「像素 SC 与预检」第 3 项）

组件小节的「画板」= 01-system 规格格（`compare-redesign.mjs --list-cells --design 01-system.html`，共 48 格，6 格 `mini()` 不比）。
`--style-diff` 在规格格模式下不可用（`runSpecView` 不取样式），改用同一浏览器里逐元素量 `getBoundingClientRect` + computed style（脚本留在本机 scratch，数值写在下表）。

## Web 适用的规格格与取舍

| 小节-格 | 内容 | Web 组件 | 结论 |
| --- | --- | --- | --- |
| c-toast-0 | Toast 5 态 | Toast（ToastPreview） | 比；深色见「待主会话决定」1（RD-17 深色胶囊 vs 规格格浅色胶囊） |
| c-toast-1/2/3 | 手机 / Web 位置示意 | — | `mini()` 缩放，工具拒绝，不比 |
| c-confirm-0/1 | App 居中确认 / 动作表 | — | App 专用（R31a） |
| c-confirm-2 | Web 居中模态 420 | ConfirmDialog / Modal | 比（浮层格，region 492,255,446,390） |
| c-layer-0/1 | App 底部弹层 | — | App 专用 |
| c-layer-2 | Web 弹出层 | Popover + FilterOption + Button + Kbd | 比 |
| c-layer-3 | Web 抽屉「示意比例」 | — | 画的是缩小示意（抽屉宽 42%、frame 640×330），不是实尺寸；Drawer 改用真实画面比：W-R17-P26（b6 #20，520）、W-R24-12（b4 #12，520） |
| c-ai-0/1/2 | AI 确认 / 成功 / 失败卡 | ConfirmCard | 比 |
| c-ai-3 | 匹配 ✓/✕ + AI 建议 chip | — | Web 组件库没有 ✓/✕ 圆钮与 `.chip.sugg`（业务组件，RD-14 由功能 Sprint 做），不比 |
| c-why-0 | 依据「?」 | WhyButton / WhyBody / MacTile / Chip | 比 |
| c-perm-* | 权限说明（手机） | — | `mini()`，不比 |
| c-load-0 | 骨架屏 | Bone | 比 |
| c-load-1 | AI 分步清单 | — | Web 组件库没有分步清单（计划生成页自绘），未比，列入交还 |
| c-load-2 | 流式回答 + 停止 | — | iOrbit 业务件（R21），不比 |
| c-err-0 | 离线横条 → 同步恢复 | OfflineBar | 未比：横条「2秒で閉じます」与「同期待ち」行内标需要标准文案新键（shared/copy 会同步到 App，本线不碰），列入交还 |
| c-err-1 | 区块错误重试卡 | RetryCard | 比 |
| c-err-2 | AI 不可用降级 | DegradedCard | 比 |
| c-err-3 | 字段错误原位展开 | TextField | 未比：kit `.fmsg` 是「粗体首句 + 说明」的珊瑚底块，TextField 的 error 是单行；改结构要动全部表单调用，列入交还 |
| c-sample-0/1 | App 横条 / 拦截 | — | App 专用 |
| c-sample-2 | Web 横条 · 药丸 · 淡化示例 | SampleBar / SampleTag | 未比：Web SampleBar 没有 🧪、标题 + 说明两段、「ガイドを続ける · 4 / 5」与 ✕，药丸（.spill）也没有组件，列入交还 |
| c-chip-0 | 状态 chip 语义表 | Chip | 比 |
| c-pay-0 | 配额 chip + 配额条 + 消耗确认 | QuotaChip / QuotaMeter / Button | 比 |
| c-pay-1/2 | 用尽卡 / 套餐对比表 | — | 业务内容（Web 没有对应组件），不比 |
| c-push-* | 锁屏推送 | — | App / 系统专用 |
| c-kbd-0 | ⌘K 面板底部提示行 | Kbd / Avatar / Icon | 比 |
| c-kbd-1 | 输入框尾部 · 复核页提示行 · tooltip | — | Web 组件库没有 tooltip 组件，未比，列入交还 |
| c-text-0 | 列表行长文案截断 | ListRow / Avatar / Chip | 比 |
| c-text-1/2 | 卡片标题 2 行 / chip 全文气泡 | — | 卡片标题是页面写法、chip 气泡要 tooltip，未比 |
| c-ctl-0 | 开关与选择 | Toggle / CheckCircle / Checkbox / Radio / FilterOption / CategoryTabs | 比；完成勾颜色见「待主会话决定」2 |
| n-* | 导航规范 | 导航壳 | D 线（壳）与 `views/web-R07.json` 负责 |

第一部分（Button、Card 等，没有 sec2 id）没有规格格：Button / IconButton 的尺寸与焦点环借 c-confirm-2、c-layer-2、c-pay-0 里的按钮一起比；其余靠各功能画面。

## token 缺口与近似值

| 项 | kit | 处理 |
| --- | --- | --- |
| Modal 标题 17 | `<b style="font-size:17px">`（b12 W-R24-09b / 11、#320、01-system ②） | 没有语义名的 17 档，用同值的 `--fs-logo`（17），注释写明；不新增 token（`tokens.json` 改动要同步 App，本线与 R31a 并行时不碰） |
| MacTile 圆角 13 / emoji 21 / 17 | `.emo` | 已有 `--r-emo` / `--fs-emoji-md` / `--fs-emoji-sm`，直接用 |
| Avatar lg 19 | `.av.lg` | `--fs-section`（19） |
| 焦点环 | 01-system ② `.focus`：2px 底色间隙 + 2px `--plum-500` | 作用域焦点环改 `--plum-500`（outline 2 + offset 2，测试要求 outline） |
| `[contrast]` | `.lbl` / `.kbd` `--ink-3`、chip `-ink`、珊瑚 `--coral` | 都在 `contrast-substitutions.json` 现有替换里（含 coral-soft 底上的 ink-3），本 Sprint 没有新增替换对 |
