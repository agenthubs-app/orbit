# 2026-10 改版像素门禁

依据：`docs/designs/redesign-2026-10/sprints/README.md` 的 **RD-16 修订（用户决定 2026-10-11）**——每个画面必须和设计稿画板一模一样，只允许测试数据与设计稿示例数据的**文字内容**不同；验收靠逐像素门禁，不靠目测并排截图。

| 文件 | 作用 |
| --- | --- |
| `compare-redesign.mjs` | Web：按画板定位设计稿 `.web` / `.phone.mweb` 画框截图，同宽同主题截实现的完整页面（含导航壳），整屏 raw + `--grid` 逐带比对 + 归因门禁 |
| `compare-redesign-app.mjs` | App：iOS 模拟器真实截图（不用 react-native-web）↔ 设计稿 App 画板（`.phone` 390×844pt），按点宽缩放对齐后同样比对 |
| `redesign-pixel-lib.mjs` | 两者共用：参数解析、读密码、PNG 缩放 / 裁剪、比对与门禁、三联图 |

0918 新 UI 的 `compare-0918.mjs` 原样保留（只认 `Orbit_0918/*.dc.html`），两套比对口径相同：单通道差 ≥24 记一个不一致像素；逐带 ±12px 上下搜索取最小值。

## 前置

- 设计稿服务：`python3 -m http.server 3320 -d docs/designs`（仓库根 `.claude/launch.json` 的 `designs`）。`--design` 写相对 `http://localhost:3320/redesign-2026-10/` 的文件名（`web.html`、`app.html`、`b8-responsive.html`、`b4-plan-iorbit.html`…），也可写完整 URL。设计稿是普通 HTML + `kit/`，不是 0918 那种自解包 bundle（`dist/` 里那份合并发布版才是 bundle，比对不用它）。
- Web：本地 dev server（`.claude/launch.json` 的 `orbits`，:3000，`.env.local` 指向本机库）。
- App：模拟器开发包（`repos/orbit-app/.env.development.local` 指向 `http://localhost:3000`，不要改 `.env.local`；起 Metro 不带 `CI=1`）。
- 脚本必须在 `repos/orbits` 下运行（解析 playwright / pngjs）；浏览器用系统 Chrome（`--channel chrome`，默认）。

## 找画板：`--list`

```bash
node scripts/visual/compare-redesign.mjs --list --design web.html
#0  web      1440x960  -     ホーム新用户空状态
#17 web      1440x960  -     Task · プラン 概要（進行中 46）大量数据
#21 web      1440x960  dark  ホーム大量数据
node scripts/visual/compare-redesign.mjs --list --design b8-responsive.html
#6  web1024  1024x880  -     Task › プラン · 1024大量数据
#7  mweb390  390x844   -     Task › プラン · 390大量数据
```

画板 = 页面里每个顶层 `.web` / `.phone` 画框（标签取所在 `.board` 的 `.board-label`，状态标签如「大量数据」会粘在后面）。类型：`web`（1440×960）、`web1024`（1024×880，b6 / b8）、`mweb390`（390 手机浏览器，b6 / b8）、`phone`（App 390×844）。`--json` 输出结构化清单。

选画板：`--board "<标签子串>"`（多块命中时取第 0 块并警告），`--board-nth N` / `--board-kind web|web1024|mweb390|phone` 消歧，或直接 `--board-index N`。

## Web：`compare-redesign.mjs`

```bash
node scripts/visual/compare-redesign.mjs \
  --design web.html --board "Task · プラン 概要（進行中 46）" \
  --app "http://localhost:3000/app/tasks?tab=plan" \
  --width 1440 --theme light \
  --login qa@orbit.test --storage <scratchpad>/qa-storage.json \
  --out ~/orbit-sprint-evidence/redesign/R24/run-01/plan-overview-1440-light \
  --grid 100 --attribution scripts/visual/attribution-redesign-R24.json --grid-view plan-overview-1440-light
```

- **宽度 × 主题**：RD-16 要求 1440 / 1024 / 390 × 浅色 / 深色共 6 张。1440 对 `web` 画板，1024 对 `web1024`，390 对 `mweb390`；设计稿没有某个宽度的画板时记「设计稿无此宽度」并请用户拍板，不许拿别的宽度凑。
- **主题**：设计侧把画框的 `data-theme` 设成 `--theme`（kit 的 token 按 `[data-theme]` 级联，深色画板与浅色画板是同一份结构）；实现侧只用 Playwright `colorScheme`（清掉 `localStorage["orbit-theme"]`，让实现处于默认「自動」，与设计稿头像菜单的「外観：自動」一致）。
- **完整页面**：设计侧把画框内部滚动区（`.main` / `.rail` / `.scroll`）展开成自然高度；实现侧**不用** Playwright 的 fullPage，而是取两侧自然高度的最大值 H，把实现的视口直接设成 `宽 × H`、把设计画框高度设成 H 再截——实现的左栏是 sticky + 100vh，fullPage 截图里它只盖住第一屏，「同一块高屏幕」才可比。`--viewport-only` 关掉展开，只比第一屏。
- **画框外壳**：设计侧先把画框搬到页面左上角（外面套一层与原祖先同名类的空壳，保留按分组写的嵌套样式；其余内容隐藏；不滚动就能截——画框原位在文档深处时，带 `backdrop-filter` 的右栏在滚动偏移下文字会错 1px 行，2026-10-12 R07 返工实测），再去掉画框圆角、阴影、注释针（`body.no-pins`）；`mweb390` 另去掉状态栏、Safari 地址栏和 Home 指示条（浏览器 / 系统外壳），并把为 Safari 底栏抬高的胶囊导航放回「视口底边之上同样间距」的位置。实现侧隐藏 Next dev 指示器。
  - **基线不可直接比较**：2026-10-12 起（R07 返工）的门禁数字与此前的 run-01 不可直接比较（搬画框只去掉滚动造成的栅格差，但会改变带底色 / 模糊效果区域的数字）。空壳只复制祖先的 `className`，祖先上的 id、`data-*`、内联 CSS 变量、`:nth-child` 依赖会丢：新 Sprint 首次用某份画板时，先抽一张与旧基线对比，确认画板没有依赖这些。
  - **局部视图用细带**：`--region` 视图建议 `--grid 30`（R07 复核 M6：整块只算一条带时，白底上缺一整块控件 raw 也可能 <0.02）；每个「通过」都要人看过 triptych。
- **登录**：`--login <email>`，密码只从 `--password-env`（默认 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD`）/ `.env.local` 读，不接受命令行明文、不打印。`--storage <文件>` 复用登录态（连续跑几十屏不撞登录限流）；该文件含会话 cookie，放 scratchpad，不要提交。
- **局部**：`--region "x,y,w,h"` 只比一块（例：1440 左栏 `0,0,84,960`、右栏 `1080,0,360,960`），用于导航壳分件验收；画面是否通过仍以整屏数字为准。
- **交互**：`--steps '<JSON 数组>'` 按顺序执行实现侧操作（`{"click":sel}` / `{"keys":"Meta+k"}` / `{"type":"文字"}` / `{"fill":[sel,文字]}` / `{"upload":[sel,文件]}` / `{"hover":sel}` / `{"wait":ms}` / `{"waitFor":sel}`）；`--click "<选择器>"`（可重复，实现侧先点开抽屉 / 弹层）、`--design-click "<画框内选择器>"`（设计侧）、`--wait-for "<选择器>"`、`--design-remove` / `--app-remove`（**只用于临时归因调查，正式数字不许用**）。

## App：`compare-redesign-app.mjs`

```bash
# 推荐 iPhone 16e：390×844pt @3x，与设计画框同尺寸，缩放后像素一一对应
xcrun simctl boot <16e-udid>
xcrun simctl status_bar <16e-udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi
xcrun simctl spawn <16e-udid> defaults write -g AppleLanguages -array ja-JP   # 改完重启 App
# 用 mcp__Claude_Code_iOS_Simulator__control 点到目标画面，等 ≥8 秒，再：
node scripts/visual/compare-redesign-app.mjs --simulator <16e-udid> \
  --design app.html --board "Task · プラン 概要（上）" --theme light \
  --out ~/orbit-sprint-evidence/redesign/R24/run-01/app-plan-overview-light --grid 100
# 或比对已有截图：--shot <png>
```

- 截图按 `宽 / scale` 换成设备点，再等比缩到设计画框宽 390；非 390pt 设备（如 17 Pro 的 402pt）竖向多出的部分计入差异。
- **系统外壳**：设计侧去掉灵动岛与 Home 指示条（硬件 / 系统画的，模拟器截图里没有）；两侧顶部 50pt 状态栏涂成同一灰色不计差异（时间、信号、电池由 iOS 绘制）。要查状态栏字色时加 `--keep-system`。
- 深色：模拟器 `xcrun simctl ui <udid> appearance dark`（App 跟随系统时），或在 App 设置里切换；`--theme dark` 让设计画框也切深色。
- 登录：在模拟器里用 `xcrun simctl pbcopy <udid>` 放密码，在密码框长按 → Paste，不要把密码打进对话或命令行参数。
- 开发包的 LogBox 黄条（「Open debugger to view warnings」）不是产品界面，截图前点掉。

## 门禁与归因

- **整屏 raw ≤ 0.02**。两侧高度不同时，多出来的那一截按全部不一致计入（0918 只比较短的一侧，会让「实现少了一整段」的屏数字反而好看）；带同样按设计稿高度切，设计稿有而实现没有的那一截判 1。
- **`--grid [带高，默认 100]`**：整宽带逐带比对，写 `<out>/cells.json`；超 `--grid-threshold`（默认 0.02）的带必须在 `--attribution` 文件的 `--grid-view` 键下具名，**且理由必须以 `[data]` 开头**（数据文字不同）。0918 的 `[recorded]` / `[shared]` 放行理由在改版里一律不认。
- 归因文件放 `scripts/visual/attribution-redesign-<Sprint>.json`，格式：

  ```json
  {
    "_schema": "\"<grid-view>\": { \"<band>\": \"[data] 看过该带三联图后写的具体理由\" }",
    "plan-overview-1440-light": { "3": "[data] 目标名与分数是本机库真实计划（设计稿示例为シリーズA 資金調達 / 46 点），字号字重位置一致" }
  }
  ```

  理由必须是看过该带 design / app 对照之后写下的；排版、颜色、间距、字号、字重、圆角、阴影、图标、元素有无和顺序有任何不同，都不是 `[data]`，是缺陷，修完再跑。
- 退出码：0 通过；2 用法 / 登录错误；3 画板找不到；5 有超阈值带未以 `[data]` 归因；6 整屏 raw > 0.02。

## 输出

`<out>/design.png`、`app.png`、`diff.png`（不一致像素标红叠在实现图上）、`triptych.png`（设计 | 实现 | diff 三联图，Web 半尺寸）、`cells.json`（逐带结果，按 mismatch 降序）、`result.json`（raw、带数、画板、URL、渲染高度）、`board.json`。App 另有 `simulator-raw.png`（原始 @3x 截图）。

首轮盘点（2026-10-11）用法与结果见 `docs/designs/redesign-2026-10/sprints/maintenance/2026-10-11-pixel-audit.md`。
