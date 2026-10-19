# R32 handback cleanup — 执行报告（部分完成，待交接）

执行线 `line-a`，开工从 `origin/redesign@ee87af742` 快进；09:16 重放到 `e176a1dd3`，i18n 域清单冲突合并保留上游 `notifications` 与本线 `admin`；23:04 又重放到 `origin/redesign@027477bfe`（上游仅改 Sprint README）；之后重放到 `origin/redesign@4a396f322`，33 个本线提交的 SHA 再映射；收口前再次重放到 `origin/redesign@45060c68b`，35 个本线提交无冲突重放。映射见 `run-01/rebase-range-diff.txt`、`rebase-2-range-diff.txt`、`rebase-3-range-diff.txt`、`rebase-4-range-diff.txt`。仅本地提交，不推送。证据目录：`/Volumes/ORICO/Dev/line-a-evidence/R32/run-01/`。未过项及全量失败保留原状，不能当整体验收通过。

## R29 REVIEW 先修

| 项 | 提交 | 当前证据与边界 |
| --- | --- | --- |
| S1 来源活动详情 | `3e872fa9a` | 本地 QA 来源 13 条规范 overview 均 HTTP 200；16e 原生 A03 → A04 → 详情 → A04 → A03 → 刷新通过，`app/native-navigation.json`。 |
| M1 首次离线公开入口 | `ed5ba7e0e` | 本地故障服务器下冷开 `/admin/access` 显示「接続が必要です」；`app/native-offline-access.json`，聚焦测试 15/15。 |
| M2 清单 | `949b9eaaa` | 登录屏／公开目录／online-only 清单与实际路由对齐，聚焦测试 12/12。 |
| M3 i18n 基线 | `e414f92d2`、`be2593808` | 登记 admin 新域；上游 notifications 与两条 R20a 读失败键重放后逐项排除。重放前、后校准结果均 2/3，英文旧快照余差 619 键，不冒称全绿。 |
| m1 W05 对账 | `c0c79c5e2` | 238 个显示字段前后差异 0；Neon 覆盖率无数据，故只证明不可用状态保持。 |

R29 原 REPORT 的全量零新增失败与未登录原生链仍按 R29 REVIEW 口径单独复核，不由以上定向结果推断已全过。

## SC-R32-01 基线

开工快进到 `origin/redesign@ee87af742`；已按执行 HEAD 复核 R29、R31a、R31b 的提交和交还段。既有不退步键清单是历史基线，新截图另据目标态和自动结果判定：`pass-baseline-app.json`（baseRef `768941864`，124 整屏通过、14 区域通过、91 未过）和 `pass-baseline-web.json`（baseRef `e081084b0`，265 通过、130 未过）。本轮目标清单另有 App 20 屏 / 39 个浅深键（P10 仅浅）、Web 8 屏 / 16 键、R05 11 裁区 / 22 键；不把旧通过键计入本轮通过。App P01～09 有 18 张目标有效图、自动 12 过；P10～20 有 19 张目标有效图、自动 5 过，P14 两张目标状态无效；Web 16 张目标有效图自动 4 过；R05 22 张目标有效裁区自动 **6 过**，其中五张浅色底栏用原生同图重算。相关历史通过键重拍及经同一原生截图重算后，App 87 键全自动 PASS、Web 132 键全自动 PASS；缺块警告另列 SC-R32-07。两端全量测试结果见 SC-R32-08。

## R32 画板预检

`preflight-R05.{md,json,log}` 为 7 个独立画板、覆盖 11 个区域视图；近似 token 2、缺 token 50、自洽提示 0、功能提示 6。`preflight-app.*` 为 20 板；近似 9、缺 149、自洽提示 9、功能提示 29。`preflight-web.*` 为 8 板；近似 9、缺 36、自洽提示 0、功能提示 14。工具提示是核对清单，不是门禁失败。App b9 #2 的「238 人但可见 3 个勾选」是完整选中数与六行画板预览的区别；b4 的人数提示需按具体状态确认。所有设计板、主题和中途态以 PLANNER §5～6 与本轮 suite 为准。

收口 rebase 带入 R14 对 b11／b5 设计稿的通知画板修订：b11 变动限锁屏／秘书设置板与其专用 `.r14sec` 样式，b5 变动限通知设置板与其专用 `.r14app` 样式；R32 使用的 b11 #12／#15、b5 #16 的板序与画面代码未变，故原三联图仍对应同一目标。上游通知服务、契约与测试代码的变动交由收口全量测试验证；不把设计文件名相同直接当本轮目标板已更改。

A-R16-04 的设计 fixture 是 238 条：4 条自动统合、2 条仅名字相似、14 条要确认、218 条原样。页面把「名前が似ているだけの N件」放在自动统合块与相似行之间；旧复核截图中该标签实际可见。R32 保留此条件，待新截图逐带判断余差，不把标签当作缺失项。b4 的 8 条人数提示是静态扫描把「1人 / 3人」目标计数、候补列表可见行及「人脈に 4人」候补数当作同一集合求和；画板源码中这几个值分别位于类型得分、候补表与介绍路线，不能据此改产品计数。实际内容仍以对应画面重拍核对。

首次 R05 单屏试探 `r05-probe-S01` 拍到了 iOS 主屏幕，原因是旧清单的 `orbit://home` 没打开 App。该次 0/2 自动结果无效，未纳入页面差额或通过数。`ca1a196c7` 把 R05 与计划组清单改成原生 `open-path` 路径。第二次试探在首次 `simctl launch` 挂起约 2 分钟，终止后 CoreSimulator 返回 `SimError 405 / server died`；没有新截图，旧 summary 仍是首次无效结果。已结束本线进程并关掉本线模拟器；清理脚本尝试把 `RCT_jsLocation` 还原 :8082，但服务崩溃后无法读回，下一次开机先验证。系统负载下降后重拍，当前 R05 仍未完成。

第三次探针在服务启动前因内置盘／内存未达到 8 GiB／45% 门槛跳过，`r05-probe-queue-3.log` 有明确记录；没有新截图。单屏探针下一轮改用外置临时目录和 6.5 GiB／35% 启动门槛，仍在中途低于 4.5 GiB 时停止；完整 22 图的 8 GiB／45% 门槛未改。门槛是本线运行资源策略，不改变像素通过标准。

第四次单屏探针完成原生 16e 启动并读回原 Metro 地址 `localhost:8082`，但 `simctl io screenshot` 对外置临时目录报 `Operation not permitted`；浅深两行均为 `ERR`，0 张有效截图。退出清理读回 `localhost:8082`，本线 3210／8087／3200 端口关闭、模拟器关机。下轮只让服务使用外置临时目录，截图阶段改回系统 `/tmp`；第四次不计像素失败或通过。

第五次单屏探针在启动前内存低于 35% 而跳过。第六次以系统 `/tmp` 截图并正常启动原生 16e，启动时内置盘约 7.1 GiB，Metro 与 Web 均就绪；截图过程中内置盘跌到 4.5 GiB 以下，守卫停止比对，未写 `summary.json`。退出清理恢复 `localhost:8082`、关闭本线端口并关机；仍无有效 S01 截图。日志为 `r05-probe-queue-5.log`、`r05-probe-queue-6.log` 与 `r05-probe-S01/compare.log`，后续须在资源稳定时重新跑。

第七次探针资源稳定且生成了浅深 `summary.json`，但检查完整模拟器截图发现目标 `/home` 被未登录边界重定向到登录页，裁区只有「閉じる」。工具的 0/2、raw 0.1846／0.1297 是**错误状态**的数字，不纳入 S01 像素结论。当前用本地 QA 帐号的移动登录接口验证会话并恢复到本线 16e，再做第八次单屏探针；只在原生截图出现首页顶栏后跑完整 22 键。

第八次在截图前的本地 QA 移动登录返回 HTTP 401 `UNAUTHORIZED`，原因是该次 Web 服务用了 `ORBIT_MODULE_MODE=mock` 的内存用户库，而 QA 帐号位于本机 `orbit_line_a`。没有生成新图；已将本线测试服务切为 `live` 模式，同时保留 `ORBIT_REDESIGN_MOCK=all` 的只读设计 fixture，第九次先验证 QA 登录和目标页。不连接 Neon 或生产。

第九次本地 QA 移动登录与 `/api/account/me` 均 HTTP 200，原生完整截图确认 `/home` 首页而非登录页；S01 浅深各有 2 条超阈带，raw 0.0828／0.0847，`r05-probe-S01/` 有新三联图。画板显示 10月7日／佐藤样本，当前本机账号显示 10月19日／Orbit，头像首字不同；几何位移估计 0，背景 ΔE 0，仍保留未归因并待完整 22 键核对。第九次是有效失败，不计通过。

随后 R05 全 22 键首次跑完（`r05-full/summary.json`、`compare.html`，310.2 秒）：工具报 1 过、21 未过、0 执行错误。逐张检查发现 S01 浅色第一次启动截到空白裁区，虽有 raw 0.0838，也属**无效状态**。第九次探针的 S01 浅色完整图已确认是已登录原生首页，且本轮 R05 代码未变；把该探针行替换空白行后另建 `r05-valid-22/summary.json` 与 `PROVENANCE.md`。这是保留原始比较行的**派生索引**，明确来自两次拍摄，22 张均为有效目标状态；当时仅 S04 深色自动通过。随后 `5daf5c487` 对 S02/S03/S04/S06/S08 的五张浅色底栏逐带核相同底色／字色、dx/dy 0 与图标字形残差，在**同一原生截图**上重算五键 PASS；`r05-tabs-light-static-attributed/` 留重算三联图，`r05-full/` 留旧 FAIL，派生索引现为 **6/22 PASS**。当前日期／QA 昵称与画板样本不同。S05/S07/S09 顶栏 30–60 带含实时日期，60–90 带有字形残差；深色底栏仍有 ΔE 3.8～4.8 的背景色差。S10 胶囊裁区顶部露出当前 Memo 正文，深色末端另有 2px 边缘色差；S11 マイページ顶栏缺画板「プロフィール完成」副标题且标题相对下移约 7px，属 R18 页面真实缺项，已转 R18 责任线。余 16 键未完成可接受归因或存在真实内容／颜色差，不能把派生 22 张说成一次完整拍摄。

Web 七屏初次队列在 W-R24-03 fixture 就绪、设计抓取开始后，内置盘从约 6.3 GiB 跌到 3.4 GiB；为遵守共享重任务资源边界，结束本线浏览器与 dev server。`W-R24-03/` 只有空的主题目录和运行日志，没有 `summary.json` 或有效截图；七屏均未计通过或失败。`web-gate-queue.log` 记录该次启动，磁盘回稳后须重跑。

第二次 Web 七屏队列在启动前遇到内置盘降至约 3.3 GiB，已取消，未启动本线服务。后续 Web 启动脚本在剩余空间不足 8 GiB 时直接跳过，避免产生无效截图。`34da94d14` 与 `8077160d5` 分别提交了 H2 草稿来源 chip 和 H3 设计预览六行修正；当时 App typecheck 通过，随后有效重拍仍未过，见下表 P10/P11。

第三次 Web 七屏门禁启动并切好 W-R24-03 fixture 后，没有产出 app 截图；同会话 `/app/tasks?tab=plan` 返回 307 到 `/app/profile/onboarding`。原因是门禁 Web 服务设全局 `ORBIT_MODULE_MODE=mock`，而 `readProfileOnboardingAccess` 在非 live 模式报告不可用。已停止本线浏览器和服务、恢复 Next 生成文件；下次以本地 `ORBIT_MODULE_MODE=live` 搭配设计 mock fixture，并在截图前用原 QA 会话读检查目标页必须 HTTP 200。第三次运行没有有效截图，不计页面失败或通过。

第四次 Web 门禁的访问探针返回 200，W01 fixture 就绪；两主题抓图时计划详情接口在开发编译初次请求返回 500，`[data-plan-action=premise]` 定位超时，`summary.json` 两行均只有 `error`，没有截图。该接口随后以同会话返回 200。W02 开始后内置盘降到约 3 GiB，已停止本线进程并确认端口、Next 生成文件清理；W02 没有有效 summary。修订的门禁脚本把 W01～W04 计划接口预热、浅深串行抓取、截图存在性检查和中途磁盘停止条件写成显式约束；两项仍待有效重跑。

W01 单屏第五次队列因内置盘／内存未达单屏 7.5 GiB／35% 门槛直接跳过，`web-w01-queue-5.log` 无截图；多屏门槛仍为 10 GiB／45%，中途低于 4.5 GiB 一律停止。门槛调整仅为单屏定位的资源策略，像素判定标准未变。

随后为 W01 做最多 12 次、每 20 秒一次的资源窗口检查；B 线全量测试与 E 线原生截图同时进行期间，内置盘跌到约 1.4 GiB，12 次均未满足单屏起跑条件，脚本以 75 退出，见 `web-w01-resource-window.log`。该轮没有占用 A 线重任务锁、没有启动本线服务，也没有有效截图；后续需重新取得资源窗口。

W-R24-03 的旧设计 fixture 在背景加入了待确认卡，和 b12 画板的概要页不同。定向红测复现背景待确认数 1；`b56122a2e` 将 `b12-206-premise` 的候补转到关联人员，使背景待确认数为 0、VC 的 4 位候补仍可用。绿测 1/1，首次重放上游后同名绿测也为 1/1（`w01-fixture-rebased-green.log`）。有效首轮 1440 浅深 FAIL，raw 0.0224／0.0191、未归因 7／6 带。夜间 CFO Night 的 19:00 时间落在机会窗口外而改推 SaaS 聚会；按画板增加定向红测，`abb81937d` 只在 `b12-206-premise` fixture 将 CFO Night 保持在今夜，并登记一条当月已用見直し，不改计划正文。两条定向绿测 2/2，Web typecheck:app 退出 0。中间尝试经真实見直し动作令配额余 2，确实重写了计划内容，所得第二轮截图不是画板状态，已撤掉该门禁步骤；第三轮有效图浅／深 raw 0.0215／0.0184、未归因 6／5 带，仍 FAIL。主要未解的是画板未画出的底部活动卡、Modal 内部残差与背景页高；按三轮上限停止 W01 单屏迭代，下一责任为页面后续复核。证据 `W-R24-03/summary.json`、`compare.html` 和 `web-w01-queue-{6,7,8}.log`；不能把 fixture 绿测写成像素通过。

Web 其余七屏 14 张首轮均取得有效三联图，自动 0/14，未归因超阈带共 86 条。加上 W01 第三轮、W03 弁護士活动样本重拍、W04 日期重拍、W07 归因重拍和 W08 只读样本重拍，`web-valid-16/{summary.json,compare.html,PROVENANCE.md}` 派生索引现为 8 屏 16 键有效、自动 4 过；明确跨运行来源。W02 弹窗正文和背景页均有差；W03 主按钮焦点环实际可见且目标说明句在源码中，重拍后还因完整类型标签读字段缺失而少折一行；W04 日期改用正常输入框后同板，但候补与正文仍 FAIL。W05 自绘弹窗虽接近画板，520 规格组件请求尚未交付，不以截图替代组件验收。W06 七位 `7QKMH4T` 加空白第八格在实际弹窗可见；原清单在点击前等 `[role=dialog]`，`24d19ed98` 改为点击后等待，重拍 `compare.log` 无超时；像素仍 FAIL。W07 只比 520 抽屉裁区，逐带归因后两键 PASS。W08 原 QA 账号姓名、头像与画板不同且有缺块探针，后续仅在本机 mock 的 `?design=confirm` 使用画板只读人物样本；原首轮行指标存 `W-R15-12-pre-design-confirm/summary.json`，原图被重拍覆盖，无法再复核。

App H1 九屏首轮在已登录原生 16e 上依序采集；P01～P06 共 12 张有效目标状态图，全部自动 FAIL，P07～P09 当时因内置盘低于单屏 6 GiB 门槛跳过，见 `app-h1-queue-1.log` 与 `app-h1-first-errors.json`。P01 空计划引导卡缺画板的右上薰衣草径向渐变；P04 筛选弹层未预置画板已选但尚未应用的资金调达／SaaS／交流会，中途态不符且弹层顶部约高 16px。`DiscoverPage.tsx` 已作局部修正，App typecheck 退出 0（`app-typecheck-h1-glow-filter.log`），其后 P01/P04 与 P07～09 有效重拍均仍未过，见 `app-h1-valid-18/`。P06 关系图中画板顶点为伊藤、当前 mock 为加藤；同一 App 参加者列表画板又含加藤，不能为截图单改共享名单，按数据模型／画板状态不一致保留未完。

H1 补拍五屏完成后，以两次运行的原始比较行组成 `app-h1-valid-18/summary.json`、`compare.html`、`PROVENANCE.md`：九屏浅深 18 键均有效、自动 0 过；首轮三个资源跳过键不计失败。P04 浅色 raw 0.1116→0.0688、深色 0.0801→0.0586，缺块 9→1，仍分别有 15／13 条未归因带。P01 渐变已出现但 raw 和带数未变。P09 Toast 画板有「元に戻す」，当前服务端交换没有撤回接口，`VenuePage.tsx` 明确禁止仅在本地撤回；这是契约／画板差，交 R27 域／主会话决定，页面不造假。

App H2/H3a 五屏队列 `app-h2h3a-queue-1.log` 的自动行须按截图状态筛选：P10 浅色拍到启动空白帧（raw 0.7762）无效；P11 浅深拍到 `FadeIn` 仍在淡入，文字灰淡且分别有 9／2 缺块，无效；P12 浅色是计划页 loading skeleton（raw 0.6513）无效，深色已到 Popover 但仍 FAIL（raw 0.0835、19 条未归因带，另有画板未列出的「以前のプラン」行）。P20 浅深已到目标 review 态，「名前が似ているだけの 2件」实际可见，raw 0.0615／0.0604、19／20 条未归因带、0 缺块，均 FAIL。P13 未进入截图：`b12-206-premise` fixture 已含一次見直し，runner 再使用一次使余量从画板的 2 降到 1，前置断言停止；不能记页面像素失败。现已增加首次稳定等待，并让 runner 在配额已为 2 时保留状态，四屏另排补拍；首批无效行不纳入通过/失败分母。

补拍 `app-h2h3a-retake-queue-1.log`：P10 浅色弹窗及来源 chip 完整有效，raw 0.0270、9 条未归因带、0 缺块，仍 FAIL；P11 六行预览浅深完整有效，raw 0.0311／0.0303、各 10 条未归因带、0 缺块，仍 FAIL，滤镜 chip 背景与画板仍有色差，不能一概归为字形栅格。P12 浅深 Popover 均有效，raw 0.1252／0.0835、各 19 条未归因带；`c-goals` fixture 本为 b12 #274 还含「以前のプラン」一行，而本轮 b4 #28 画板只画到「この目標を編集」，需在只读 fixture 分出对应状态后重比。P13 的配额前置问题已修，截图却在设计抓取时因依赖的别线 :3320 停服报 `ERR_CONNECTION_REFUSED`，0 有效图；App 门禁现改用本线自启／自停的设计源 :3211 并显式检查就绪，连 P14～P19 一同再跑。两个门禁故障均未计作页面失败。

`app-h3b-queue-1.log` 用本线设计源完成 P13～P19 14 张工具图、0 自动过；逐图检查 P14 虽是实际 App 画面，却仍是旧「話した人を記録」候补选择，不是画板的种类／日期／memo 表单，故 P14 两行对目标状态无效、须等写契约明确。其余 P13、P15～P19 12 张达到各自目标状态且自动 FAIL。P13 的六行反复 padding 使 sheet 顶部高约 24px；`6d9881a42` 将 `PlanOverview` 每行纵向 padding 8→6，定向有效重比浅／深 raw 0.1049／0.0964、21／18 带，仍 FAIL。P15 试增 `PlanProposalSheet` 底部 padding 后，顶部仅升 4px；kit `BottomSheet` 的 80% 高度上限与画板约 87% 冲突，已撤销试验并第三轮按当前代码重拍，仍 FAIL，见 X01e。P12 的 b4 菜单 fixture 与 b12 旧计划行分开，原 `c-goals` 完整数据保持；定向红测目标 fixture 不存在、绿测 2/2，Web typecheck:app 退出 0；最终有效重比仍 FAIL。P16 的四类分析数缺读契约，P17/P18/P19 的画板样本与当前同 fixture 事实差异仍按未过记录；不把正确服务值写死成画板样本。`app-p10-p20-valid-19/` 是跨运行派生索引，19 张目标有效、自动 0 过；P14 两张诊断图不在其中，来源见 `PROVENANCE.md`。

## SC 对照与像素结论

以下是**当前自动门禁状态**，不是整体验收结论。每行 raw 与带数来自对应 `run-01/<view>/summary.json`，P07/P08 与 P20 的同截图重算来源另见派生索引 `PROVENANCE.md`；派生有效索引为 `app-h1-final-18/`、`app-p10-p20-valid-19/`、`web-valid-16/`、`r05-valid-22/`。未归因带按 FAIL 保留；无图、`ERR`、错误目标状态均不计通过。P10 仅浅色画板，深色只作主题回归。

| SC | 画面 | 当前状态／下一步 |
| --- | --- | --- |
| P01 | A-R27-06 | `c3c9f020e` 补空计划卡渐变，`92b707473` 把径向终点按 CSS farthest-corner 改为 156；第三轮浅／深 raw 0.0632／0.0603、16／15 未归因带。取样色已对齐至 1 RGB，但卡／标题／底栏几何仍有 1～3px 实差；三轮用尽，FAIL。旧图见 `A-R27-06-pre-gradient-radius/`。 |
| P02 | A-R27-07 | **浅深 PASS**：原画板与 16e 三联图中少量态三条活动、三个条件提示、筛选 chip 均同内容同色；搜索文字、分数环、emoji／TabBar 原生栅格和 0～3px 位置差逐带记 `[raster]`。R32 归因 JSON 中浅／深 18／17 条超阈带，fresh native 图 raw 0.0480／0.0508、0 未归因、0 缺块，见 `A-R27-07/compare.html`；首次 FAIL 图存 `A-R27-07-pre-attribution/`，一次误写旧归因文件的 retake 存 `A-R27-07-r32-attribution-not-loaded/`，均未充作通过。 |
| P03 | A-R27-08 | **浅深 PASS**：`341885b8c` 对同内容的原生文本、emoji、分数环、玻璃底栏逐带写明 `[raster]`；fresh 16e 浅／深 raw 0.0489／0.0468、17／18 带、0 未归因、0 缺块。旧 FAIL 存 `A-R27-08-pre-attribution/`，现见 `A-R27-08/compare.html`。 |
| P04 | A-R27-09 | `c3c9f020e` 预置未应用的画板选择，`868547c07` 把首个开关上距 14→6px 并把 8px 还给按钮上距；第三轮浅／深 raw 0.0610／0.0508、16／14 未归因带，原缺块探针消失，开关已同 y；上方筛选 chip 仍差 4～8px。三轮用尽，FAIL；旧图 `A-R27-09-pre-toggle-gap/`。 |
| P05 | A-R27-29 | **浅深 PASS**：`e72ec97c5` 为名单人物状态 chip 加页面居中容器，修复真实 y 偏移；`341885b8c` 逐带核原生剩余栅格。fresh 浅／深 raw 0.0327／0.0322、13／14 带、0 未归因、0 缺块，chip y 与画板同位；原 FAIL 存 `A-R27-29-pre-chip-center/`，见 `A-R27-29/compare.html`。 |
| P06 | A-R27-31 | **浅深 PASS，含明示 `[data]` 例外**：b2 #29 同一会場名单尾行是加藤健太，#31 关系图相同顶点却写伊藤直子；`journeyVenue` 用同一 App attendees 保证名单／图自洽，不能在图中假换人。`61567ddaf` 对该顶点记 `[data]`，其余逐带核实 SVG／文字 `[raster]`。新 16e 浅／深 raw 0.0378／0.0372、9／10 带、0 未归因、0 缺块，当前三联图 `A-R27-31/compare.html`；原始 FAIL 存 `A-R27-31-pre-attribution/`。主会话可决定是否修画板 #31 的人名。 |
| P07 | A-R27-33 | **浅深 PASS**：`e72ec97c5` 修复底图人物 chip 的真实纵向错位；第三轮原生浅／深 raw 0.0419／0.0360、14／12 带，旧 chip 带变成 dx 0／dy 0。`341885b8c` 在同一原生截图按核过的 `[raster]` 原因重算为 0 未归因、0 缺块；`app-p07p08-static-attributed/` 保留来源，原 FAIL `A-R27-33-pre-chip-center/`。 |
| P08 | A-R27-34 | **浅深 PASS**：同一 chip 修复后第三轮原生浅／深 raw 0.0291／0.0232、13／11 带；`341885b8c` 在同一原生截图逐带 `[raster]` 重算为 0 未归因、0 缺块。派生 `app-p07p08-static-attributed/` 与原 FAIL `A-R27-34-pre-chip-center/` 均留存。H1 最终有效索引 `app-h1-final-18/` 为 12/18 PASS；余 P01/P04/P09 各浅深 FAIL。 |
| P09 | A-R27-35 | 补拍有效浅／深 raw 0.0531／0.0856、16／17 未归因带；画板 Toast 的「元に戻す」缺撤回契约，不能伪造本地 undo；FAIL。 |
| P10 | A-R12-N09 | **浅色 PASS**：`34da94d14` 补设计来源 chip、`022eeccd0` 对样本头像色；`6d5b7288c` 在原画板与 16e 新三联图逐带复核后给 9 带记真 `[raster]`，同字同框、dx 0～2／dy −1～1、0 缺块，raw 0.0270 仅定位。原始 FAIL 图存 `run-01/A-R12-N09-pre-attribution/`，同一截图单张复核 `A-R12-N09-attributed-light/`，当前代码重新原生拍摄的 PASS 见 `A-R12-N09/compare.html`。暗色只有主题回归，未宣称像素过。 |
| P11 | A-R16-02 | **浅深 PASS**：`8077160d5` 六行预览、`022eeccd0` 样本头像；`d093e7f15` 逐带核实同文／同头像／同 token。两枚筛选 chip 填充的浅色 `#f2eff3`、暗色 `#2e2d33` 两侧相同，原生上缘和首枚宽各差 2px，见 `A-R16-02-filter-chip-pixels.txt`；20 条超阈带均给具体 `[raster]` 理由。新 16e 浅／深 raw 0.0311／0.0303、各 10 带、0 未归因、0 缺块；原始 FAIL 存 `A-R16-02-pre-attribution/`，当前 PASS 三联图见 `A-R16-02/compare.html`。 |
| P12 | A-R25-11 | `e7a115293` 接 Popover，行为 21/21；`24d19ed98` 的只读 `c-goals-b4-menu` 去 b4 #28 未画的旧计划且保留原 fixture；第三轮有效浅／深 raw 0.1003／0.0876、各 19 未归因带，Popover 底比画板短约 13px、背景仍异，X01d 待组件；FAIL。 |
| P13 | A-R24-05 | `e7a115293` 前提 sheet 结构；`6d9881a42` 把六行纵向 padding 8→6 后第二轮有效浅／深 raw 0.1049／0.0964、21／18 未归因带、各 7 缺块，顶部从约 y337 调到 y358，靠近画板 y362。画板把「推測」chip 放在长值的第二行末，现有 `KitChip` 是 `View`，与 `UiText` 兄弟 flex wrap 必落第三行；X01f 请求组件提供行内 chip 形态，余残带也仍需页面重比。FAIL。 |
| P14 | A-R24-13 | 原生浅深打开的是当前「話した人を記録」候补选择态，画板却是面谈种类／日期／memo 表单，**目标状态未到**；比较器 raw 0.2904／0.1561 不纳入像素失败分母。字段写契约缺口已交计划域／Bridge；SC 未完成。 |
| P15 | A-R24-16 | 首轮有效浅／深 raw 0.2667／0.2100、23／22 未归因带；试增页面底部 padding 后 raw 0.2621／0.2094、带数不变，sheet 顶界只升 4px：kit 的 80% 上限与 b4 #6 约 87% 画板冲突。无效 padding 已撤销，第三轮按当前代码重拍回到 raw 0.2667／0.2100、23／22 带；HANDOFF X01e 待主会话定例外／组件参数，FAIL。 |
| P16 | A-R25-01 | 有效浅／深 raw 0.1721／0.1438、各 21 未归因带；画板分数 128、当前真实 fixture 45，四类分析数与服务三类读数不一致。自己申告／人脈读契约待计划域／Bridge；FAIL。 |
| P17 | A-R25-12 | 有效浅／深 raw 0.1008／0.0852、17／16 未归因带；编辑 sheet 结构可达，背景分数 45 与画板 128 仍异。试用既有 `c-goals` 128 分只读样本作第二轮诊断，浅／深 raw 0.1029／0.0873、17／15 带：总分虽同板，服务仍返回「あと10で満点」、話して118／スキップ10，与画板「満点を超えました」、話して80／スキップ10／上乗せ38 的计分口径不合。该试验已撤销，原正式三联图恢复 `A-R25-12/`，试验图留 `A-R25-12-scored-edit-trial/`；不以单个总分对齐掩盖其他差，FAIL。计划域需核对总分／满分／上乘的样本语义。 |
| P18 | A-R24-12 | `d47a80438` 的 b12 弁護士活动 fixture 影响此原生清单，已归档旧有效图 `A-R24-12-pre-law-events/` 并重拍；首次重拍浅色仅启动空白帧（raw 0.7619，不计目标图），暗色有效，诊断留 `A-R24-12-law-events-first-invalid-light/`。`a8cd4f5ff` 把清单等待 12→18 秒后取得最终有效浅／深 raw 0.0703／0.0552、13／12 未归因带，3／3 缺块；确认弹窗文案仍只有「弁護士」而画板为「弁護士（投資契約）」，`PlanPersonTypeDetail` 缺完整标签读字段，背景候补数也异；FAIL。最终 `A-R24-12/compare.html`。 |
| P19 | A-R25-08 | `eb2ecc949` 的 `plan.achieve.body` 去掉确认框中画板未写的「話した人 19人」，三语保留分数定格语义；日文标题按画板断行。针对性行为测试两次先红后绿，确认操作仍走原服务。三轮有效原生浅／深 raw 从 0.1244／0.0974 经正文 0.0854／0.0732 降到最终 0.0770／0.0649；未归因带由各 17 变各 18，缺块探针从 14／11 降到 9／7。确认框已近板，但背景总分虽为 128，分项仍显示「あと10で満点」「話して118」而板为超额／話して80，其他背景及原生字形残差仍在，FAIL。旧图 `A-R25-08-pre-copy/`、中间图 `A-R25-08-pre-title-break/`、最终 `A-R25-08/compare.html`；三轮用尽。 |
| P20 | A-R16-04 | **浅深 PASS（RD25 重拍）**：相似标签、238 总数、6／14／218 分组、两对样本头像同画板。REVIEW 指出的旧图纵向 2～3px 累积位移是布局差，不能归 `[raster]`；已缩小自動統合块纵向内距、固定相似标签行高。新 16e 浅／深 raw 0.0465／0.0454、19／20 带、0 未归因、0 缺块；三联图目检卡片、两行、按钮与下一卡上下缘对齐，剩余带仅字形、头像圆边、描边采样差，逐带归因已重写，见 `A-R16-04/compare.html`。两次启动过渡帧浅色无效图留在 `A-R16-04-RD25-invalid-light/` 与 `A-R16-04-RD25-invalid-light-2/`，旧 PASS 依据留 `A-R16-04-pre-RD25/`；历史 R16 suite 静态重算仍仅指旧图，不充作本次原生通过。 |
| W01 | W-R24-03 | `b56122a2e`、`abb81937d` 修只读背景候补、夜间机会与配额；定向绿测 2/2，1440 浅深第三轮 raw 0.0215／0.0184、未归因 6／5 带仍 FAIL，底部活动卡和弹窗残差待后续页面复核，见 `W-R24-03/compare.html`。 |
| W02 | W-R24-09b | `fbb733be1` 调整记录弹窗正文间距；1440 浅／深 raw 0.0557／0.0425、各 9 带，浅色另有 23 个缺块探针；弹窗与背景仍异。候补行画板要求「東雲キャピタル · プリンシパル · LinkedIn」，但 `PlanTalkedOfflineResult.matches` 契约只有 `company/name/contactId`，服务只返回公司；页面无法从该响应生成角色／来源。后续需计划域扩展读契约及同板只读背景样本再重比；现 FAIL。 |
| W03 | W-R24-11 | 目标句已在源码、按钮焦点环可见；`d47a80438` 将 b12 只读 fixture 错挂的通用活动事实换回弁護士两场示例，定向测试红／绿 1/1；第二轮 1440 浅／深 raw 0.0264／0.0205、各 3 未归因带、缺块 6／4。原首轮 raw 0.0315／0.0253、各 5 带，原图被重拍覆盖。弹窗正文画板用完整「弁護士（投資契約）」，接口仅给 `shortLabel=弁護士`，实际少折一行、高度不同；完整标签读契约待计划域，FAIL。 |
| W04 | W-R24-12 | 已生成首份下书；`8cc113e9d` 第二轮在三个正常日期输入框填画板 10/14～16 后，日期和草稿中的时间同板，1440 浅／深 raw 仍 0.0444／0.0396、10／9 未归因带，另有 28／31 缺块探针。`b4-11-type-vc` 经同一计划服务只读计算四名候补为 95／80／65／65（`run-01/w04-vc-fixture-scores.json`），画板写 88／78／61／52；当前 `recommendScore` 只有 tier／strength／近期接点的离散分档，无法由只读 fixture 得出画板四数，不在页面写死推荐分数。抽屉正文亦有服务模板残差，FAIL；需计划域／主会话核对评分口径和目标样本。首轮图 `W-R24-12-pre-fixed-dates/`，现图 `W-R24-12/compare.html`。 |
| W05 | W-R23-06 | 1440 浅／深 raw 0.0175／0.0157、各 2 带；Modal 520 档 X01a 待组件维护交付，再替换 FlowDialog 与重比；FAIL。 |
| W06 | W-R26-31 | `24d19ed98` 把等待移到点击后；重拍七位 `7QKMH4T` 与空白第八格可见，`compare.log` 无 wait-for 超时，1440 浅／深 raw 0.0254／0.0152、8／4 未归因带。画板此七位态的「開く」呈激活色，页面按 `PARTICIPATION_CODE_LENGTH=8` 禁用按钮；这是目标样本与已定 8 位契约冲突，不能为七位输入启用无效提交。背景数据与其余带也异，FAIL；需主会话修目标状态或明确例外。 |
| W07 | W-R17-P26 | **1440 浅深 PASS**：只裁 520 抽屉，名单、角色变更、理由框与画板同内容同色，测得 dx 0、dy −1～−2；`e44f7edef` 的 R32 Web 归因 JSON 对字形、圆边和底部 2px 截边逐带记 `[raster]`。fresh 浅／深 raw 0.0525／0.0506、7／6 带、0 未归因、0 缺块，见 `W-R17-P26/compare.html`；首轮 FAIL 保存在 `W-R17-P26-pre-attribution/`。 |
| W08 | W-R15-12 | **390 浅深 PASS**：`d21086c26`、`1567084ac` 在本机 mock 专用 `?design=confirm` 显示 b11 #12 的高橋美咲／佐藤健一只读样本，保留同长度 QA 邮箱并仍用真实会话；定向 invite 测试 18/18、Web typecheck:app 退出 0。新浅／深 raw 均 0.0013、0 带、0 缺块，见 `W-R15-12/compare.html`；旧 QA 姓名截图的指标 raw 0.0173／0.0171、各 5 带，见 `W-R15-12-pre-design-confirm/summary.json`，原图被重拍覆盖。 |
| S01 | A-R05-01 顶栏 | 有效浅／深 raw 0.0828／0.0847，各 2 超阈带；10/7 佐藤样本与 10/19 Orbit 本地账号不同，深色副标题颜色仍有差；FAIL。 |
| S02 | A-R05-01 底栏 | 浅色 raw 0.0185、1 带在 `5daf5c487` 逐带核图标／字形、同底色和同位置后以同一原生图重算 PASS；深色 raw 0.0261、1 带，背景 ΔE3.8，FAIL。 |
| S03 | A-R05-02 底栏 | 浅色 raw 0.0198、1 带同截图栅格归因后 PASS；深色 raw 0.0165、1 带背景 ΔE4.8，FAIL。 |
| S04 | A-R05-03 底栏 | 浅色 raw 0.0175、1 带同截图栅格归因后 PASS；深色 raw 0.015、0 带原生直拍 PASS。 |
| S05 | A-R05-04 顶栏 | 浅／深 raw 0.0202／0.0203，各 2 带；实时日期与字形残差，深色日期字色仍异；FAIL。 |
| S06 | A-R05-04 底栏 | 浅色 raw 0.0196、1 带同截图栅格归因后 PASS；深色 raw 0.0186、1 带背景 ΔE4.8，FAIL。 |
| S07 | A-R05-05 顶栏 | 浅／深 raw 0.0195／0.0196，各 2 带；实时日期与字形残差，深色日期字色仍异；FAIL。 |
| S08 | A-R05-05 底栏 | 浅色 raw 0.0191、1 带同截图栅格归因后 PASS；深色 raw 0.0171、1 带背景 ΔE4.8，FAIL。 |
| S09 | A-R05-07 顶栏 | 浅／深 raw 0.0196／0.0197，各 2 带；实时日期与字形残差，深色日期字色仍异；FAIL。 |
| S10 | A-R05-07 底栏 | 浅／深 raw 0.0279／0.0369、1／2 带；当前 Memo 正文露进裁区，深色另有末端 2px 色差；FAIL。 |
| S11 | A-R05-11 顶栏 | 浅／深 raw 0.0528／0.0525，各 2 带；缺副标题且标题下移约 7px，转 R18 页面；FAIL。 |

## 测试、交接和待主会话决定

SC-R32-08 的逐名对账参照 R29 REPORT §「测试」：彼时 Web 全量 7 失败，其中 2 个 R29 旧审计断言随后已定向修复，余 5 个是跨域同名失败；App 全量 12 失败，包含加人屏 9、i18n 域计数 1、邀请点击负载 1、`compute-sync` 日期审计 1。不以总失败数相同代替零新增证明。R32 首轮 App 全量 `run-01/app-full-closeout.log` 为 3227 项、3209 过、16 失败、2 跳过：11 项与 R29 的加人屏／i18n／邀请同名，R29 `compute-sync` 日期审计此轮未再失败；另有 `ink-signal-settings-account` 开关、`relationship-inbox-lifecycle` 选项卡、硬编码文案审计 2 项与计划 skip 操作 1 项。前两项在当前上游文件、且本线未改其代码的定向复跑中 0/2 仍失败（`app-upstream-two-targeted.log`），转各自归属线处理。本线的三项已修：将只读设计样本移入 `src/fixtures/redesign-preview-samples.json`，更新计划测试的现有文案和弹层等待；`app-closeout-targeted.log` 的文案审计 5/5、`app-plan-overview-closeout.log` 的计划套件 25 过／1 预期跳过。第二轮全量 `app-full-closeout-final.log` 为 3227 项、3211 过、14 失败、2 跳过；两项硬编码审计与计划 skip 已转绿，但设计样本最初放在只许同步 token/icon 的 `src/api/design`，新增一项 `design-sync` 失败。移至 JSON fixture 后，`app-preview-fixture-targeted.log` 的 design-sync／文案审计 8/8、App typecheck `app-typecheck-fixture-final.log` exit 0；第三轮同版本全量 `app-full-closeout-final2.log` 为 **3227 项、3212 过、13 失败、2 跳过**：11 项与 R29 同名，两项是前述上游开关与选项卡，新引入的三项及 design-sync 均已转绿。全量仍 exit 1，SC-R32-08 的零新增失败条件不成立。

最终 App 页面间距／名单 chip 改动后的第四轮全量 `app-full-closeout-final3.log` 仍为 **3227 项、3212 过、13 失败、2 跳过**，失败名称与第三轮同一 13 项，未出现本轮页面新失败；命令 exit 1，历史项与上游两项仍需归属线处理。最终 App typecheck `app-typecheck-final.log` exit 0。

P19 确认框文案与日文断行修复 `eb2ecc949` 后再跑 App 全量 `app-full-closeout-final4.log`：**3227 项、3212 过、13 失败、2 跳过**，同一 11 项 R29 旧失败及两项不在本线改动内的开关／选项卡失败；目标达成链通过。命令 exit 1，严格零新增条件仍未满足；同版本 `app-typecheck-final4.log` exit 0。P19 针对性测试先因旧正文、再因旧标题断行分别红，修后两次绿；原生第三轮仍 FAIL，见 SC-P19。

Web 全量 `run-01/web-full-closeout.log` 执行 7751 项、6733 过、1011 跳过、7 失败。R29 曾有的 `manifest generation`、`merging fills empty fields`、`only the dev route imports`、名片上传 e2e 与 R12 review m9 五项同名重现；两个 R29 旧后台审计失败不再出现。新失败是 `orbit-0918-anchor-colour` 的六域链接数 32 < 40，以及 `orbit-button-ratchet` 的非 `.btn` 按钮数 84 > 79。两项被扫描的 `*-0918` 源码和按钮列表均不在本线相对 `origin/redesign` 的 Web 改动中；该次全量时本线在 `app/(app)/app` 下只改了计划页 `PlanTypeDialogs.tsx`、`TypeDetail.module.css`，后续新增的邀请只读样本不涉及 `*-0918` 链接或按钮数，故归各自 Web 维护线核对，不越线扩大本轮页面修复。Web `typecheck:app`、lint、typecheck 分别见 `web-typecheck-app-closeout.log`、`web-lint-closeout.log`、`web-typecheck-closeout.log`，均 exit 0。全量 7 项不报作通过，也不能满足 SC-R32-08 的零新增失败。

W08 只读样本加入后第二轮全量 `web-full-closeout-final2.log` 为 **7751 项、6730 过、1011 跳过、10 失败**：原 7 项之外新增三条 `no-hardcoded-copy` 审计，均指向本轮放在 `orbit-2026/invite-landing` 下的样本常量文件。`1567084ac` 将该只读数据移到已有的 `app/i/_landing` fixture 区域，页面仍只通过本机 mock 条件调用；同版本 `no-hardcoded-copy` 加 invite 定向测试 25/25、W08 浅深 fresh 重拍保持 PASS。第三轮最终 Web 全量 `web-full-closeout-final3.log` 为 **7751 项、6732 过、1011 跳过、8 失败**，前述三条本线 copy 审计均消失。原 7 项仍同名；新增一项 `event-registration-plan-sync` 的「失败同步后状态仍 recommended」断言实际得 `registered`，单独定向复跑同样失败，相关测试和服务均不在本线相对 `origin/redesign` 的改动中，转事件／计划维护线。Web `typecheck:app`、lint、typecheck 的最终日志 `web-typecheck-app-final.log`、`web-lint-final.log`、`web-typecheck-final.log` 均 exit 0。全量 exit 1，SC-R32-08 零新增条件仍未达到。

`d47a80438` 的 W03 只读 fixture 修复及其测试加入后，Web 第四轮全量 `web-full-closeout-final4.log` 为 **7752 项、6734 过、7 失败、1011 跳过**。新增的 b12 弁護士活动测试通过；上轮单独重现的 `event-registration-plan-sync` 本轮转绿，说明该项在并行全量环境下不稳定，不能据一次通过宣布根因已修。7 个失败名称与 W08 修正后的首轮相同：5 项 R29 同名及 `anchor-colour`、`button-ratchet` 两项不在本线页面改动内的审计。全量仍 exit 1；零新增相对 R29 的严格条件仍未满足。

最终 Web `typecheck:app`、lint、typecheck 串行执行均 exit 0，日志 `web-typecheck-app-final4.log`、`web-lint-final4.log`、`web-typecheck-final4.log`。App 的 `app-full-closeout-final3.log` 后先改门禁启动等待与 Web 只读 fixture，再改 P19 确认文案；所以以 P19 后重新执行的 `app-full-closeout-final4.log` 和 `app-typecheck-final4.log` 作为最后 App 代码状态的验证。

SC-R32-07 相关既有通过键基线为 App 87、Web 132（`run-01/{app,web}-related-pass-keys.json`，来自各自 R31a/b 历史报告，不是本轮通过数）。Web `web-plan-B` 12 视图 / 24 键已用独立 3210 服务、只读 fixture 与原画板重拍：24 个唯一键、24 自动 PASS、0 错误、24 张新三联图，`run-01/web-related-web-plan-B-run/{summary.json,errors.json,compare.html}`。Web `web-invite-R15` 4 视图 / 8 键同样 8 个唯一键、8 自动 PASS、0 错误，新三联图见 `run-01/web-related-web-invite-R15-run/`；其中 W-R15-09 的邀请码邀请页已目检目标态。Web `web-R17` 28 视图 / 52 键也为 52 个唯一键、52 自动 PASS、0 错误，`run-01/web-related-web-R17-run/`；空主催中心与在线受付截图已目检目标态。Web `web-plan-A` 10 视图 / 20 键均唯一且自动 PASS、0 错误；同名 W-R24-02 的 1440／1024／390 三种宽度分目录保存，`run-01/web-related-web-plan-A-run/`。任何未跑、错态或错误行均不计通过。

Web `web-plan-C` 13 视图 / 25 键与 `web-R26` 2 视图 / 3 键也全部自动 PASS、0 执行错误，见各自 `run-01/web-related-*-run/{summary.json,errors.json,compare.html}`。合计 Web **132/132 唯一键自动 PASS、0 缺键、0 未归因带失败**，逐组交叉核对见 `run-01/web-related-regression-status.json`。W-R23-01 旧清单的 `[data-plan-goal-card]` 已不存在，首轮虽通过仍有等待超时；复制清单改等同一页面真实输入框后单屏补拍，浅深 raw 均 0.0006、0 带且 `compare.log` 无超时，见 `run-01/web-related-web-plan-B-retake-W-R23-01/`。`run-01/web-related-final-132/` 是六组原始行加这两条补拍行的派生索引，`PROVENANCE.md` 保留来源。132 个自动 PASS 中有 64 键带缺块探针警告（共 303 个区域；如 W-R25-12 头像预览 48×48 区），需按索引 `missing` 字段逐图复核；自动通过数不代替语义或主会话复核。

App `app-R27` 15 视图 / 30 键在已登录原生 16e 上重拍：30 唯一键全部自动 PASS，0 执行错误、0 缺图；搜索状态已目检，`run-01/app-related-app-R27-run/{summary.json,errors.json,compare.html}`。运行退出后本线 3210／3211／8087／3200 服务关闭，16e 关机，原 Metro 地址读回 `localhost:8082`。其他 App 相关组仍在收口，不用 R27 的 30 键推断全体 87 键通过。

App `app-add-R12` 的原始组因持久化扫描引导、手动点按的目标态和一次尚未填姓名的表单而有错误／错态，原始 `summary.json` 原样保留。重置本地扫描引导后 A-R12-N10/N10d 两键补拍自动 PASS；原生 16e 手动走到 A-R12-15 浅深已填表单、A-R12-18 深色保存 Toast、A-R12-04 浅深失败 sheet，再用原画板逐张比较，五键均自动 PASS。`run-01/app-related-add-R12-final-19/{summary.json,PROVENANCE.md,compare.html}` 按来源选择 19 个唯一、目标态有效且有三联图的历史键，**19/19 自动 PASS**；A-R12-18 Toast 测试在本地 QA 数据中保存了测试联系人，未涉及生产。App `app-import-R16` 原始组八键中六键自动 PASS、A-R16-04 两键 FAIL；`2c0e1a6f6` 在新原生 P20 图核对全部带后，用同一截图和旧 R16 suite 静态重算两键 PASS，原 FAIL 原样保留。`app-plan-A` 两键自动 PASS，截图可见原生计划概览目标态。`app-plan-B` 自动组因 A-R23-05 需要点按而明确跳过该屏，其余 16 键自动 PASS；手工进入原生「2/3 · チーム」目标态后的浅深补拍 raw 0.0511／0.0491、各 16 带均有归因且自动 PASS，三联图目检目标态有效。`run-01/app-related-plan-B-final-18/{summary.json,PROVENANCE.md,compare.html}` 因而为 18 个唯一有效键、18 自动 PASS。原自动组的跳过错误保留在 `errors.json`。

`app-plan-C` 的自动组 8 键目标态有效且自动 PASS；A-R25-03 浅深首拍停在「iOrbit で見直す」确认弹层，比较结果不计。原生点入前提页后补拍，浅／深 raw 0.0778／0.0742、20／19 带均有归因、自动 PASS，派生 `run-01/app-related-plan-C-final-10/` 因而有 10 个唯一键。两张补拍仍报告缺块探针 8／5，三联图可见本地进度 7/11、剩余 3 次与画板 9/14、剩余 2 次不同；这是样本状态残差，保留视觉复核，不以自动 PASS 证明数据一致。合并后 `run-01/app-related-final-87/{summary.json,status.json,PROVENANCE.md,compare.html}` 覆盖 **87/87 唯一历史键、87 自动 PASS、0 FAIL、0 缺键**。其中两张 A-R16-04 行来自同一新原生截图经历史 R16 suite 重算，原组 FAIL 仍留在 `app-related-app-import-R16-run/`。16 个自动 PASS 键仍带缺块探针警告（共 42 个区域，见索引 `missing` 字段），需逐图复核；不把自动结果等同于无差异验收。

Bridge 四栏（由协调者决定是否写入根台账；本地 `line-a`，未推送）：

| 本端版本 | 另一端影响 | 未完成项 | 验证范围 |
| --- | --- | --- | --- |
| App R29 S1 `3e872fa9a` | Web/API 路径、契约未改；App 来源活动详情消费现有规范 Event Core ID | R29 全量与其余 REVIEW 项独立验收 | 本地 QA 13 条详情 HTTP 200，16e 原生打开／返回／刷新链；未连生产 |
| Web 邀请只读画板态 `d21086c26`、`1567084ac` | App 与共享邀请契约无改动；Web 仅本机 mock `?design=confirm` 使用 b11 #12 姓名／头像，登录邮箱仍来自 QA 会话 | 正式邀请兑换与跨端连接结果仍需原责任线业务复核，不以此像素通过替代 | W08 390 浅深 raw 均 0.0013、0 带／缺块、PASS；Web invite 与 copy audit 定向 25/25、typecheck:app exit 0 |
| Web 主办抽屉 `e44f7edef`、提案门禁 `8cc113e9d` | App／共享契约无改动；W07 仅归因文字与边界残带，W04 正常输入日期复现画板样本 | W04 候补表／抽屉正文及其他 Web FAIL 键仍待页面收敛；W07 通过限 520 宽裁区 | W07 fresh 1440 浅深 2/2 PASS、原 FAIL 保留；W04 第二轮 0/2 PASS、日期同板但其他残带未解 |
| Web/App 计划设计 fixture `d5f36b515`、`0f2fa88b2`、`b56122a2e`、`abb81937d`、`24d19ed98`、`d47a80438`；App 页面 `e7a115293`、`6d9881a42`、P19 文案 `eb2ecc949`；Web 页面 `fbb733be1`；App 门禁等待 `a8cd4f5ff` | 双端只读演示状态中的分数、候补与弹层内容会变；共享 HTTP/Schema 未改，线上写入语义不变 | P14 面谈种类／memo 写契约、P16 自己申告／人脈读契约；W02 候补角色／来源、W03/P18 完整类型标签读字段；W05 Modal 520 与 X01/X02 组件请求；P12/P13/P15～19 与 W01～05 有效目标图仍像素 FAIL | App 计划页行为 21/21、P12 fixture 2/2、W01 fixture 2/2、W03 fixture 1/1、App/Web 定向 typecheck 退出 0；App P12/P13/P15～19 与 Web W01～05 浅深截图见 SC 表。P19 fresh 原生 raw 0.0770／0.0649 仍 FAIL；跨端业务回读未完成 |
| App 加人只读预览 `34da94d14`、`8077160d5`、`022eeccd0`、`2c0e1a6f6`；App 活动发现 `c3c9f020e`、`92b707473`、`e72ec97c5`、`868547c07` 与逐带归因 `61567ddaf`、`c842b2ef4`、`341885b8c` | Web 页面与接口无变更；正式导入计数及头像默认配色不变 | P01/P04/P09 共 6 键 FAIL；P09 Undo 服务契约缺口，P14/P16 计划契约缺口另列 | App 原生 H1 12/18、P10/P11/P20 5/5 有效键自动 PASS；P07/P08/P20 同截图重算来源留痕，App typecheck 与全量日志见 SC-R32-08；未声称真实导入链通过 |
| R05 裁区 `5daf5c487` | 只增门禁逐带理由，App/Web 运行代码及共享契约无改动 | 深色底栏背景 ΔE3.8～4.8、S10 Memo 露底、S11 R18 副标题仍需对应责任线 | 16e 22 张有效裁区，6 PASS／16 FAIL；五张浅色底栏同原生截图重算，旧 FAIL 留存 |

上述版本均是本地 `line-a` 提交，未推送；协调者可以据此核对另一端影响，不能把路由或类型通过记为业务对齐。

本轮代定 D-R32-01：b2 #29 会場名单与 b2 #31 关系图的同一上方节点分别写加藤／伊藤。按 PLANNER A-1 的数据自洽优先级，`journeyVenue` 不拆成两份人名；App 保持加藤，P06 对这一节点明记 `[data]`，其余带按真实像素复核。只读 fixture 未改、正式关系数据未改；主会话若修画板 #31，人名应与 #29 统一，见 `run-01/A-R27-31/`。

计划页定向浏览器测试 `plan-review-screens.test.tsx`：重放前、后均 21 通过、0 失败、1 个截图测试按开关跳过；日志 `run-01/plan-focused.log`、`plan-focused-rebased.log`。同一任务首次 App typecheck 报四处新样本头像的严格可选 `tone` 传参错误，`022eeccd0` 改为仅有色值才传，随后独立 App `npm run typecheck` 退出 0。09:16 重放上游后的 App `npm run typecheck`、Web `npm run typecheck:app`、Web `npm run lint` 和 Web `npm run typecheck` 均退出 0，日志分别为 `app-typecheck-rebased.log`、`web-typecheck-app-rebased.log`、`web-lint-rebased.log`、`web-typecheck-rebased.log`；W01 定向测试也已重跑。M3 旧快照复测从 2/3、余差 621 键恢复到 2/3、余差 619 键，恢复的是同基线失败，不是绿测。最后的两端全量与类型／lint 结果以上方 SC-R32-08 的收口日志为准。

M3 过滤测试文件改动后另启的 App typecheck 在 B/D 线全量测试并行、系统可用内存降至 6% 时由本线主动终止（退出 143，`app-typecheck-m3-filter.log`）；它不计通过。资源恢复后 App typecheck 已在 `app-typecheck-fixture-final.log` 退出 0；P01/P04/P05 页面样式改动后又以 `app-typecheck-final.log` 在最终运行代码状态退出 0。

组件及契约转出当前均为**待交付**，不能记作页面通过：X01a `Modal` 520 宽供 W-R23-06；X01b 报表链接分段的 href／焦点／当前页语义；X01c 搜索 tablist 与 `aria-controls`；X01d App `PopoverRow` 禁用态供 A-R25-11；X01e 的 P15 画板约 87% 高 sheet 与 kit 80% 上限冲突，待主会话决定是否给组件单屏例外；X01f App 前提长文本末尾同一行的 chip 形态供 P13。X02 的 `c-ai-3`、`c-load-1`、`c-err-0`、`c-err-3`、`c-sample-2`、`c-kbd-1`、`c-text-1`、`c-text-2` 八组各自待 A 线组件维护，`c-err-0` 标准文案键实现时须同步 App。HANDOFF G23/G23b 与 DEFERRED-A 保持 pending。计划域另有 P14 面谈种类／memo 的写契约缺口、P16 自己申告／人脈统计的读契约缺口；已交计划域／Bridge 协调者，页面不伪造持久化或服务计数。

## SC-R32 收口判定

| 条目 | 判定与证据 |
| --- | --- |
| SC-R32-01 | **完成基线登记**：R29/R31a/R31b、开工与四次上游重放、既有通过键和本轮目标键分开记账；本报告开头及 `run-01/pass-baseline-*.json`。 |
| SC-R32-02 | **完成通知／来源登记**：HANDOFF 已先写 R32 接手通知，R31b §6-1～10 分列页面、组件或显式并项；对应行的 `done` 只用于已有自动通过和提交证据，其他保留部分／待交付。 |
| SC-R32-03 | **完成预检**：R05、App、Web 各自 `preflight-*.{md,json,log}`；功能提示和画板矛盾已进本报告与 HANDOFF，未把提示当门禁通过。 |
| SC-R32-04 | **未完成**：本轮 App H1 12/18、H2/H3/H4/H5 5/19 有效目标键自动 PASS，P14 两键未到目标态；Web 4/16 PASS。其余有效键全部保留 FAIL，逐项 raw／带数／下一责任见上表。 |
| SC-R32-05 | **部分**：R05 新区域 suite 覆盖 11 裁区、22 有效键，当前 6/22 PASS。深色底栏实色差、S10 内容露入和 S11 缺副标题仍未过；原图、派生索引、同截图重算来源分开保存。 |
| SC-R32-06 | **部分**：定向计划交互 21/21 与 App 完成目标／切换操作测试通过；R29 S1 原生详情往返、M1 离线入口链已验证。P09 Undo、P14 面谈写入、W05 语义组件与 W06 七位激活状态尚不满足目标，不能称全行为通过。 |
| SC-X01 / SC-X02 | **待 A 线组件维护与主会话决定**：X01a～f 和八组 X02 按缺件、调用屏、维护责任写入 HANDOFF G23/G23b 与 DEFERRED-A；请求已登记，不算交付。 |
| SC-R32-07 | **自动门禁复核完成，语义复核待主会话**：历史 App 87/87、Web 132/132 唯一键自动 PASS、0 缺键，派生索引保留原组错误／补拍来源；Web 64 键、App 16 键仍有缺块探针警告，详见上节。主会话需独立重跑失败／改动键和至少 20% 通过键，检查裁区与归因。 |
| SC-R32-08 | **未完成零新增全量条件**：两端类型检查与 Web lint 通过；App 全量仍有历史和上游失败，Web 全量仍有历史和非本线页面审计失败。逐名、退出码和最终日志见上节；不把定向绿测推成全量绿。 |
| SC-R32-09 | **完成本线交接材料，Sprint 未验收**：HANDOFF / DEFERRED-A 的已过项有 SHA 和证据，未过项明示责任、数值和路径；上方 Bridge 四栏列本端版本、另一端影响、未完成与验证范围。根 `bridge/status.md`、`bridge/handoffs.md` 留协调者更新。 |

已用满单屏三轮仍 FAIL 的 P01/P04/P15/P19 与 W01 不再在本线重复空拍。P09 需撤回契约，P14/P16/W02/W03/P18 需计划域读写字段，W04 与 P17/P19 需计分样本口径，W06 需七位画板状态决定；X01/X02 和 R05 壳、S11 R18 页面由相应责任线处理。其余未过键仍需按 SC 表逐带复核；本线不把无法归因的色差和缺块改判通过。主会话独立复核与业务回读均未执行，所有这些均保留未完成状态。

本线仅作本地路径提交，未推送、未连接 Neon／生产、未部署；付费 AI 调用 **0**。本线启动的 3210、3211、8087、3200 服务及 16e 模拟器在最后原生门禁退出时关闭，Metro 地址读回 `localhost:8082`。收口全量以 `app-full-closeout-final4.log`、`web-full-closeout-final4.log` 为准；App typecheck `app-typecheck-final4.log`、Web typecheck:app／lint／typecheck 的 `*-final4.log` 均退出 0。
