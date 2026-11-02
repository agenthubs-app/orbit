# Sprint 0147 报告：首页小组件长按拖动换位置

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `cc9bea8b4`。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 落点按实测矩形计算，宽窄混排准确 | 通过 | `tests/home-widget-model.test.ts` 新增 3 条，用 358 宽的网格（整宽 + 两个 48% 小组件 + 整宽）：右边的小组件拖到顶部 → 第 1 位；左边小组件横拖到右边 → 两个小组件互换；整宽组件往下拖一行 → 落在两个小组件**之后**（不会把它们拆开）；拖出两端落到首位 / 末位；抖几像素不换位；每个落点下其他组件的让位偏移量也逐个核对 |
| 02 普通模式长按进入编辑并开始拖；完成后保存新顺序 | 通过 | `tests/offline-pages-home.test.tsx` 新增 2 条（浏览器里真按住、移动、松开）：在「人脉」上按住 650ms → 出现「完成」和每个组件的 ×，往上拖到「今日待办」松开 → 「人脉」排第一；接着 × 删「秘书建议」、+ 加「笔记」都照常；点「完成」后 PUT `/api/home/layout` 的 `app` 顺序是 `network, today, planScore, nextEvent, memo`。另一条：先移动再按住的快速滑动不会进入编辑；按住不动再松开，弹出原来的长按菜单（编辑首页 / 大小 / 从首页移除），不进编辑 |
| 03 phoneweb 截图：拖动中让位、松手后顺序 | 通过 | 见第 6 节 |
| 04 全量与类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试：落点纯函数 3 条在原代码上失败（函数不存在）；页面测试第一条在原代码上失败（长按不进编辑，等不到「完成」）。第二条在原代码上就通过，它是防止长按菜单丢掉的回归保护。

## 3. 改了哪些文件
| 文件 | 改动 |
|---|---|
| `src/screens/home/home-widget-model.ts`（:22–72） | 删掉旧的 `dragTargetIndex`（约 100px 粗阈值）。新增 `homeGridFlow`：按各组件实测的宽高，照首页网格的规则（能放下就同一行、放不下换行、行间距 12、两端对齐）排出每个组件的位置。新增 `homeDropPlan`：把被拖的组件依次试放到每个位置，重新排一遍，选它的落位离手指下组件中心最近的那个；距离差不多时选让其他组件移动最少的那个。同时给出每个组件为预览要移动的偏移。两个函数标了 `"worklet"`，拖动时在 UI 线程上算 |
| `src/screens/home/HomeWidgetsScreen.tsx`（:101–106、:153–160、:229–328） | 删掉 `PanResponder` 拖动、`dropTarget` 虚线框和组件外层的长按 `UiPressable`。新增 `useWidgetDrag`：用 onLayout 记下每个组件的矩形和网格宽度。`DraggableWidget` 改用 gesture-handler 的 `Gesture.Pan().activateAfterLongPress(…)`（首页上 400ms，编辑模式里 220ms，和原来一样），被拖的组件用 reanimated 跟手（UI 线程），其他组件按 `homeDropPlan` 的偏移用动画让位；松手提交顺序。抖动动画原样保留，放在里层的 `Animated.View`。读屏的「上移 / 下移 / 大小」动作、×、+ 都没动。保存逻辑没动：还是点「完成」时走原来的 `save`（断网存本机草稿） |
| `tests/helpers/stubs/react-native-gesture-handler.js` | 测试替身：配置了 `activateAfterLongPress` 的 Pan 用指针事件模拟（按住到时间才开始、提前移动就失败、松开结束），浏览器测试能真拖；其他手势照旧不响应，不影响已有测试 |
| `tests/helpers/offline-page-harness.ts`（:105） | 假客户端记下 PUT 请求体（`putBodies`），和 0143 记 POST 体一样 |
| 测试 | 见第 2 节；旧的 `dragTargetIndex` 三条断言随函数删掉 |

## 4. 判断
- **按住不动再松开 → 弹出原来的长按菜单，不留在编辑模式。** PLANNER 说长按进入编辑并开始拖。如果按住不动松开也一直留在编辑模式，原来长按出来的菜单（尤其是改大小「小 / 中」）就没有入口了——编辑模式里只有读屏能改大小。所以照 iPhone 的做法：按住约 0.4 秒组件就浮起、开始抖、跟手；只要拖动了，松手后留在编辑模式等「完成」；完全没动就松开，退出刚进入的编辑（没有改动，不保存），弹出菜单。在编辑模式里按住不动松开，什么也不变。
- **长按时间**：首页上 400ms（原来长按菜单就是 400ms），编辑模式里 220ms（原来拖动就是 220ms）。没有改成 500ms。
- **落点用实测宽高加网格规则重新排**，而不是直接拿别的组件现在的矩形比：大小不同的组件换位后整行会重排（例如整宽组件插进两个小组件之间会把它们拆成两行），只有重排才能算对位置和让位动画。让位偏移用「新排法减旧排法」算，所以即使行高被拉伸，模拟和实际有一点差，静止的组件也不会错位。
- **松手那一刻**被拖的组件直接到新位置（不是滑过去），其他组件的偏移和新顺序在同一帧清掉，避免闪一下。距离很小（最多半个格子），所以没有再加回位动画。
- **网页上的触摸**：手势区域设了 `touchAction="pan-y"`，这样手机浏览器里在组件上竖着滑还能滚动页面。代价是：手机浏览器里长按后**竖着**拖，可能被浏览器当成滚动接走；横着拖不受影响。原生 App 不受这个影响（拖动开始后页面滚动会关掉，和原来一样）。

## 5. 命令与结果
在 `repos/orbit-app`：
- `npx tsc --noEmit`：0 错误。
- 定向：`tests/home-widget-model.test.ts` + `tests/offline-pages-home.test.tsx` 22 条全过。
- 全量 `npm test`（第一次）：**3423 条，3417 通过，4 失败，2 跳过**。3 条是已知的（`api-schema-sync`、`contract-sync`、`route-parity`）；多出的 `personal-schedule-interactions` 里「localized repeat options…」单独跑这个文件两次都是 75/75 通过，0146 报告里也记过它在机器忙时偶发失败。重跑全量结果见下一行。
- 全量 `npm test`（重跑）：**3423 条，3418 通过，3 失败，2 跳过**，只剩 3 条已知失败。
- 原生打包检查：用 babel（platform ios）转换两个改动的文件，`homeGridFlow`、`homeDropPlan`、三个手势回调和动画样式都被 worklets 插件转换（6 处），说明 babel-preset-expo 自动加的 worklets 插件在原生上生效；根目录 `app/_layout.tsx` 已有 `GestureHandlerRootView`。测试环境里 reanimated / gesture-handler 用的是已有替身，所以让位动画本身靠 phoneweb 截图验证。

## 6. 运行时检查（phoneweb）
- 服务器：本 worktree 的 orbits，`next dev` 在 8092，连本机新建的空库 `orbit_0147_runtime`（`db:migrate:live` + `db:migrate:sync-revision`），`ORBIT_MODULE_MODE=live`，没有 AI key。
- App：`expo export --platform web`，`scripts/phoneweb-server.cjs` 在 8091，上游 8092。Chromium 390×844，日语。经 HTTP 注册 `qa0147@example.test` 后在登录页登录。
- 用 Playwright 鼠标真拖（按下、停 700ms、分 10 步移动、松开），记录每个组件标题的位置：
  - 按住后出现「完了」（进入编辑）。
  - 「人脈」拖到两个小组件那一行时：「プラン スコア」「次のイベント」从 y=315 让到 y=482，「人脈」跟着手指在 y=313。
  - 继续拖到顶部：「今日やること」从 148 让到 315。
  - 松手后顺序：人脈、今日やること、プラン スコア + 次のイベント、秘書から。点「完了」后 `GET /api/home/layout` 返回 `network, today, planScore, nextEvent, secretary`；刷新页面后顺序不变。
  - 小组件互换：「次のイベント」横拖到「プラン スコア」上，拖动中两者互换位置，松手后保持。
  - 快速滑动不进入编辑；按住不动松开弹出菜单（ホームを編集 / サイズ / ホームから外す）。
  - 全程没有页面报错。
- 截图（本目录）：
  - `0147-before.png`：拖动前
  - `0147-dragging-over-pair.png`：拖到小组件那一行，两个小组件已经让到下面
  - `0147-dragging-over-top.png`：拖到顶部，「今日やること」让到下面
  - `0147-dropped.png`：松手后（编辑模式中）
  - `0147-after-reload.png`：点「完了」并刷新后，顺序保持
  - `0147-dragging-small-swap.png`：两个小组件拖动中互换
  - `0147-hold-menu.png`：按住不动松开后的菜单
- 组件内容显示「今は読み込めません」：临时库是空的、只跑了两组迁移，和 0146 一样，不影响拖动。
- 收尾：8091、8092 已停；3000 没碰。`orbit_0147_runtime` 已删除。`repos/orbit-app/dist` 是导出产物（git 忽略）。

## 7. 提交
- `4ec6e4c73` feat(app): long-press a home widget to edit and drag it, others slide aside
- 本报告单独一个 docs 提交。

## 8. 未决
1. 没有在真机（iOS / Android）上验证，只有 phoneweb 和 babel 转换检查。UI 线程跟手、原生上和页面滚动的配合需要真机确认。
2. 手机浏览器里长按后竖着拖可能被页面滚动接走（见第 4 节最后一条）；Playwright 用的是鼠标，模拟不出这一点。
3. 「离开页面时保存」：现有逻辑只在点「完成」时保存，编辑中离开页面不会保存，这次没有改。
