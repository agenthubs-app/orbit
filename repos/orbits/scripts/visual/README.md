# 0918 像素比对

前置：`python3 -m http.server 3320 -d /Users/li/work/orbit/docs/designs`（或 launch.json 的 `designs`）与 dev server（launch.json `orbits-newui`，3100）。

## 认证方式

两种方式二选一：

- **`--cookie`**：浏览器登录 qa@orbit.test 后从 DevTools 复制 `authjs.session-token`（本地 http 为 `authjs.session-token`，https 为 `__Secure-authjs.session-token`）。
- **`--login "email:password"`**：脚本会在截 app 图之前自动打开 `<app origin>/app/account/login`，填写邮箱（占位符「输入邮箱地址」）和密码（占位符「输入密码」），点击「登录」按钮并等待导航完成，再继续截图。适合本地跑冒烟，不用每次手动复制 cookie。

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

## 设计页签映射（`--design-view`）

脚本按 `--design` URL 自动选择页签表；也可用 `--design-table profile|events|ops|auth` 强制选个人中心表 / Events 表 / 运营台表 / 认证弹窗表。

- **Network 表**（`--design` 不含个人中心 URL 编码时）：`overview|pipeline|all|import|analysis` → 概览/关系管线/所有人脉/导入人脉/查看完整分析；不传 `--design-view` 时默认点「概览」。
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

## 通用选项

- `--design-remove "<selector>"`：设计侧在点击序列 / `--design-click*` 之后、截图之前，在页面里删除**所有**匹配元素（`locator.evaluateAll(el => el.remove())`，CSS 与 Playwright 选择器均可）。这是去除设计稿纯演示 UI 的规范做法（如认证弹窗的「演示」切换条）。
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
