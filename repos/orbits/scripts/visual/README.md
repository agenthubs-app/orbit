# 0918 像素比对

前置：`python3 -m http.server 3320 -d /Users/li/work/orbit/docs/designs`（或 launch.json 的 `designs`）与 dev server（launch.json `orbits-newui`，3100）。

## 认证方式

两种方式二选一：

- **`--cookie`**：浏览器登录 qa@orbit.test 后从 DevTools 复制 `authjs.session-token`（本地 http 为 `authjs.session-token`，https 为 `__Secure-authjs.session-token`）。
- **`--login "email:password"`**：脚本会在截 app 图之前自动打开 `<app origin>/app/account/login`，填写邮箱（占位符 `you@company.com`）和密码（占位符 `••••••••`；Orbit_0918 登录弹窗的设计占位），点击「登录」按钮并等待导航完成，再继续截图。适合本地跑冒烟，不用每次手动复制 cookie。

两者互不冲突：都传时先设置 cookie，再走登录流程（一般只用其中一种）。

## 用法

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/Network%20v2.dc.html" --design-view all \
  --app "http://localhost:3100/app/contacts" \
  --login "qa@orbit.test:<password>" \
  --out /tmp/network-all
```

判定：mismatch ≤ 0.02 且 diff.png 中红色只出现在真实数据文字/数字区域（不得出现在布局线、圆角、间距、色块）。

## 归因模式 `--grid` 与填充门禁 `--require-rows`（2026-09-23 合并前终审 5）

整屏一个 `mismatch` 只回答「差多少」，回答不了「差在哪一条」。六个域的数字先前都只过
「框级残差」这一条，而**框是人手挑的**——0.3389 的 plan aside 标题缺陷因此在两个任务里
没被发现，`actions` / `plan` 在账本为空时也照样记过了数字。这两个开关把这两个口子堵上。

- `--grid [带高px]`（默认 100）：把 diff 切成固定高度的**整宽带**，对每条带各做一次
  `dy` 搜索（`--grid-dy`，默认 ±12：内容整体上下挪几像素不该让每条带都变红），取该带的
  最小 mismatch 与对应 dy，按 mismatch 降序写 `<out>/cells.json`。
- `--grid-threshold`（默认 0.02）+ `--attribution <file>` + `--grid-view <key>`：任何超阈值
  且**没有在归因文件里点名**的带 → 打印带号与区间，以 exit 5 失败。归因文件是 committed
  JSON（本域是 `scripts/visual/attribution-0918-iorbit.json`），形如
  `{ "<view>": { "<band>": "理由" } }`。理由必须是看过该带 diff.png 之后写下的具体原因；
  写不出来就别登记，让门禁继续失败。
- `--require-rows "<selector>[:最少行数]"`（默认 1）：截完应用侧之后数一遍该选择器的命中
  数，不够就**不出数字**，以 exit 3 失败。用于主列表为空的屏（`actions` 用
  `[data-orbit-agent-action-entry]`，`plan` 用 `.ir-task-no`），防止「空账本 = 只剩壳 →
  残差很小 → 记成通过」。

### 各域归因文件（2026-09-23 网格归因复核）

| 域 | 归因文件 | 视图数 / 超阈值带 |
| --- | --- | --- |
| iOrbit | `scripts/visual/attribution-0918-iorbit.json` | 7 / 71 |
| Network | `scripts/visual/attribution-0918-network.json` | 8 / 92 |
| 个人中心 | `scripts/visual/attribution-0918-profile.json` | 4 / 29 |
| Events 参会者侧 | `scripts/visual/attribution-0918-events.json` | 15 / — |
| 运营台 | `scripts/visual/attribution-0918-ops.json` | 8 / — |
| 认证四态弹窗 | `scripts/visual/attribution-0918-auth.json` | 6 / — |

归因理由前缀统一四类：`[data]` 同结构真实内容不同 / `[recorded]` 命中台账已记偏差（必须写出条目出处）/
`[shared]` 跨域共用件（顶栏 +2px、全局 iOrbit 悬浮球、Next dev 叠加件）/ 缺陷（不登记，直接修）。

> **Network `analysis` 视图的可访问名**：设计 122 行那颗按钮写的是「查看完整分析 →」（带箭头）。
> `261507b4` 给页签点击加 `exact: true` 之后，映射表里不带箭头的写法再也点不中，该视图会以 locator
> 30s 超时崩掉——2026-09-23 复核时修正为真实可访问名。改设计表映射时请照抄设计源码里的文本。

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/iOrbit.dc.html" --design-view actions \
  --app "http://localhost:3100/app/agent/actions" --login "qa@orbit.test:<password>" \
  --out /tmp/iorbit-grid-actions \
  --grid 100 --grid-view actions --attribution scripts/visual/attribution-0918-iorbit.json \
  --require-rows "[data-orbit-agent-action-entry]"
```

## 设计页签映射（`--design-view`）

脚本按 `--design` URL 自动选择页签表；也可用 `--design-table profile|events|ops|auth|iorbit` 强制选个人中心表 / Events 表 / 运营台表 / 认证弹窗表 / iOrbit 表。

- **Network 表**（`--design` 不含个人中心 URL 编码时）：`overview|pipeline|all|import|analysis` → 概览/关系管线/所有人脉/导入人脉/**「查看完整分析 →」**（`analysis` 不是主页签，是概览屏 122 行的深色按钮，可访问名带箭头，必须照抄）；不传 `--design-view` 时默认点「概览」。
- **个人中心 表**（`--design` 含 `%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83`，即「个人中心」，或传 `--design-table profile`）：`profile|settings|connect` → 个人资料/iOrbit 设置/连接；**不传 `--design-view` 时不点击任何页签**（停在设计稿默认视图）。
  - `persona`（编辑商务画像）不是页签，映射表里没有它：先用 `--design-view profile` 或不传 `--design-view` 停在「个人资料」，再加 `--design-click "text=编辑商务画像"` 点进商务画像编辑视图。

页签点击统一用 `getByRole("button", { name, exact: true })`（个人中心设计里「连接」页签与卡片上的「连接」按钮同名，需要 `exact` 避免误点）。

- **Events 表**（`--design` 含 `Events.dc.html`，或传 `--design-table events`）：不是页签映射，而是**每视图一段设计侧点击序列**（详情/现场/回顾在设计稿里都要从列表卡片点进去）。序列执行完后仍会执行 `--design-click` / `--design-click2`（弹窗视图靠它们再点一层，例如参会者 `text=山本健`、交换 `text=申请交换联系方式`）。**应用侧不点击，全部走 URL**。
  - `discover`（默认，不传 `--design-view` 也是它）：无点击 → 应用 `/app/events`
  - `mine`：`getByRole("button", { name: "我的活动", exact: true })` → 应用 `/app/events?scope=registered`
  - `detail`：`text=AI 产品从 0 到 1` → 应用 `/app/events/<id>`
  - `live`：detail 序列 → `text=进入活动现场` → 应用 `/app/events/<id>/live`
  - `recap`：第一个 `text=回看活动` → 应用 `/app/events/<id>?view=recap`
  - 步间固定等待 300ms（设计稿 renderVals 重绘）；传了表外的 `--design-view` 会以 usage error 退出。

- **运营台 表**（`--design` 含 `%E8%BF%90%E8%90%A5%E5%8F%B0`，即「运营台」，或传 `--design-table ops`；文件名 `Events 运营台.dc.html` 也含 `Events`，运营台判定优先于 Events 表）：同 Events，**每视图一段设计侧点击序列**（设计稿的运营台子页都要从活动中心第一张卡「进入运营 →」点进去；抽屉由「更多 ⌄」直接 `openDrawer`，无子菜单）。序列后仍会执行 `--design-click*`。**应用侧不点击，全部走 URL**（主办方账号登录）。
  - `hub`（默认，不传 `--design-view` 也是它）：无点击 → 应用 `/app/events/center`
  - `ops`：`getByRole("button", { name: "进入运营 →", exact: true })`（第一张卡）→ 应用 `/app/events/<id>/operations`
  - `match`：ops 序列 → 页签 `匹配与分组` → 应用 `/app/events/<id>/operations?tab=match`
  - `people`：ops 序列 → 页签 `参会者` → 应用 `/app/events/<id>/operations/admission`
  - `checkin`：ops 序列 → 页签 `签到` → 应用 `/app/events/<id>/operations/check-in`
  - `form`：ops 序列 → 页签 `报名设置` → 应用 `/app/events/<id>/operations/experience`
  - `report`：ops 序列 → 页签 `数据报告` → 应用 `/app/events/<id>/analytics`
  - `drawer`：ops 序列 → `更多 ⌄` → 应用 `/app/events/<id>/operations?drawer=roles`
  - 页签点击全部 `getByRole("button", { name, exact: true })`；步间固定等待 300ms；传了表外的 `--design-view` 会以 usage error 退出。

- **认证弹窗 表**（`--design` 含 `%E9%A6%96%E9%A1%B5`，即「首页」（`Orbit 首页.dc.html`），或传 `--design-table auth`）：同 Events，**每视图一段设计侧点击序列**。设计稿的弹窗由头部「登录」链接（`<a href="#" onClick=openLogin>`，`getByRole("link", { name: "登录", exact: true })`）打开；四态切换靠弹窗底部「演示」条（设计 465–472 行，纯演示 UI）里的按钮，**限定在演示条容器内**（`div:has(> span:text-is('演示'))`）点击，因为演示条的「登录」与弹窗主按钮同名，且设计稿没有 `role=dialog` 可以限定。**应用侧不点击，全部走 URL，未登录访问，无需 `--login`**。
  - `landing`（默认，不传 `--design-view` 也是它）：无点击 → 应用 `/app`（落地页基线，用作弹窗残差的扣除基准；配 `--viewport-only`）
  - `login`：头部链接 `登录` → 应用 `/app/account/login`
  - `register`：login 序列 → 演示条 `注册` → 应用 `/app/account/signup`
  - `forgot`：login 序列 → 演示条 `找回` → 应用 `/app/account/forgot-password`
  - `reset`：login 序列 → 演示条 `新密码` → 应用 `/app/account/reset-password#token=<43 位 [A-Za-z0-9_-] 假 token>`（只到表单态，不提交）
  - `reset-invalid`：login 序列 → 演示条 `失效链接` → 应用 `/app/account/reset-password`（无 token → 链接已失效态）
  - 步间固定等待 300ms；传了表外的 `--design-view` 会以 usage error 退出。弹窗比对建议同时传 `--viewport-only`（全页截图会让落地页底图稀释弹窗差异）和 `--design-remove "div:has(> span:text-is('演示'))"`（去掉演示条，应用侧不实现它）。

- **iOrbit 表**（`--design` 含 `iOrbit.dc.html`，或传 `--design-table iorbit`）：同 Events，**每视图一段设计侧点击序列**，但七个视图的入口**都在概览屏（设计默认视图）上，各只点一次**。注意入口的 role 不同：`actions` / `plan` 是 `<a href="#" onClick>`（`getByRole("link")`），其余是 `<button>`（`getByRole("button")`），全部 `exact: true` + `.first()`。**应用侧不点击，全部走 URL**。

  | `--design-view` | 设计侧点击（设计行号） | 应用侧 URL |
  | --- | --- | --- |
  | `home`（默认） | 无点击 | `/app/agent` |
  | `chat` | button `进入对话页 →`（243） | `/app/agent?session=<id>`（见下「chat 会话种子」） |
  | `actions` | **link** `查看建议与行动 →`（179） | `/app/agent/actions` |
  | `plan` | **link** `查看完整日程 →`（83） | `/app/agent/plan` |
  | `strategy` | button `帮我制定推进计划`（68） | `/app/agent/strategy` |
  | `contacts` | button `我该先联系谁`（67） | `/app/agent/strategy?view=contacts` |
  | `history` | button `◷ 历史记录`（242） | `/app/agent`（应用侧自行打开抽屉，如 `--click ".orbit-agent-history-btn"`） |

  - `history` **必须配 `--viewport-only`**：抽屉是 `position:fixed`，全页截图会把两侧不同的页面高度算进分母，数字失真。另外「◷ 历史记录」在概览屏最下方，Playwright 点击前会把它滚进视口，而设计的 `openHistory`（与 `go()` 不同）不会 `scrollTo(0,0)` —— 所以脚本在该视图点击后会自动把设计侧滚回顶部，让底图与应用侧一致（抽屉 fixed，不受影响）。
  - 「◷ 历史记录」在概览 / 对话 / 工作策略 / 联系人建议四屏都有同名按钮；序列停在概览屏，`.first()` 取的就是设计 242 行那颗。
  - 归因建议：先跑一遍 `home` 作基线，再用 `history` 的 `--viewport-only` 数字扣除（沿用认证弹窗的落地页基线做法）。
  - 步间固定等待 300ms；传了表外的 `--design-view` 会以 usage error 退出。

### chat 会话种子（`seed-iorbit-chat-session.mjs`）

`chat` 视图不能靠真实 LLM 应答（字节不稳定）。用种子脚本经**真实写接口** `POST /api/ai/conversations/sessions` 写一条确定性会话，再截 `/app/agent?session=<id>`，走真实恢复路径：

```bash
node scripts/visual/seed-iorbit-chat-session.mjs
# 默认账号 qa@orbit.test 在验证库 orbit_newui_events_20260922 里是存在的（2026-09-22 的数据准备
# 建的），默认值可直接用；只有换库 / 换账号时才需要覆盖：
node scripts/visual/seed-iorbit-chat-session.mjs \
  --email participant.a@orbit.example.test --password-env ORBIT_DEMO_ORGANIZER_PASSWORD
```

- 选项：`--origin`（默认 `http://localhost:3100`）、`--id`（默认 `iorbit-visual-chat-0918`）、`--email`（默认 `qa@orbit.test`）、`--password-env`（默认 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD`）、`--env-file`（默认 `.env.local`）。
- **密码只从 `.env.local` / 同名环境变量读，不接受命令行明文，脚本也从不打印它。**
- 写入的会话形状由 `orbit-real-agent.tsx` 的 `isStoredAgentMessage`(:514) / `parseStoredAgentMessage`(:570) 校验：assistant 行必须同时带 `items` / `kind`（`people|events|todos`）/ `panelTitle`。内容逐字取设计 chat 屏（272–303 行），**只写会话存储，不往活动 / 联系人库里造任何数据**。
- 输出最后两行是 `app=<可直接喂给 --app 的 URL>` 与 `session=<id>`；重复执行是幂等覆盖（同一 id）。

### 账本种子（`seed-iorbit-ledger-fixtures.ts`，任务 7 新增）

`actions` / `plan` 两个视图的左栏来自操作账本（`agentActionsV2`）。验证库里该账号原本一条都没有，
两屏会落到空态，像素数字只能对上「壳 + aside + 段头」。跑这两个视图前先种：

```bash
node --import tsx scripts/seed-iorbit-ledger-fixtures.ts --email qa@orbit.test
node --import tsx scripts/seed-iorbit-ledger-fixtures.ts --email qa@orbit.test --mode verify
```

四条账本条目分别落在三档（`awaiting_confirmation` / `approved` / `deferred`）加一条当天
`completedAt` 的 `completed`（进度环的分子），每条都带 `operations[0].operationType`、`whyNow`、
`evidenceChips` 与 `preview`。脚本只调运行时服务自身的 API（`createRun` / `proposeAction` /
`approveAction` / `deferAction` / `processOutbox`），不写表、不绕状态机，同 id 重跑幂等。

示例（iOrbit · chat 视图）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/iOrbit.dc.html" --design-view chat \
  --app "http://localhost:3100/app/agent?session=iorbit-visual-chat-0918" \
  --login "qa@orbit.test:<password>" \
  --out /tmp/iorbit-chat
```

示例（iOrbit · history 视图，必须 `--viewport-only`，且应用侧 URL 必须带 `?history=1` —— 少了它抽屉不会打开，比对出来是 0.69 而不是 0.04）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/iOrbit.dc.html" --design-view history --viewport-only \
  --app "http://localhost:3100/app/agent?history=1" \
  --login "qa@orbit.test:<password>" \
  --out /tmp/iorbit-history
```

## 通用选项

- `--design-remove "<selector>"`：设计侧在点击序列 / `--design-click*` 之后、截图之前，在页面里删除**所有**匹配元素（`locator.evaluateAll(el => el.remove())`，CSS 与 Playwright 选择器均可）。这是去除设计稿纯演示 UI 的规范做法（如认证弹窗的「演示」切换条）。
- `--app-remove "<selector>"`：应用侧对应项（点击之后、截图之前删除所有匹配元素）。只用于**归因**设计外的附加件（如认证弹窗的 Google 钮 `.au-google`、眼睛钮 `.au-eye`），得到框级非数据残差；台账正式数字仍以不传本项的 raw 为准。
- `--viewport-only`：两侧只截视口（`width` × 900），不截全页。用于弹窗类比对，避免全页落地页把弹窗差异按比例稀释。

示例（认证弹窗 · login 视图）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/Orbit%20%E9%A6%96%E9%A1%B5.dc.html" --design-view login \
  --design-remove "div:has(> span:text-is('演示'))" --viewport-only \
  --app "http://localhost:3100/app/account/login" \
  --out /tmp/auth-login
```

示例（运营台 · ops 视图）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/Events%20%E8%BF%90%E8%90%A5%E5%8F%B0.dc.html" --design-view ops \
  --app "http://localhost:3100/app/events/<id>/operations" \
  --login "organizer@orbit.example.test:<password>" \
  --out /tmp/ops-ops
```

示例（Events · detail 视图）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/Events.dc.html" --design-view detail \
  --app "http://localhost:3100/app/events/<id>" \
  --login "participant.a@orbit.example.test:<password>" \
  --out /tmp/events-detail
```

示例（个人中心 · profile 视图）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83.dc.html" --design-view profile \
  --app "http://localhost:3100/app/profile" \
  --login "qa@orbit.test:<password>" \
  --out /tmp/profile-smoke
```

示例（个人中心 · persona 视图，从个人资料页点「编辑商务画像」进入）：

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83.dc.html" \
  --design-click "text=编辑商务画像" \
  --app "http://localhost:3100/app/profile?view=persona" \
  --login "qa@orbit.test:<password>" \
  --out /tmp/persona-smoke
```
