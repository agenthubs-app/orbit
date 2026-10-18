# Sprint PX1 — 像素收口轮 1（R11a / R11b / R21）

**Plan revision:** 1（2026-10-19；事实以 `origin/redesign@d33a9f2707063e091af427dbfea20f30891429e2` 为准，执行前按符号重查）。**模式:** existing-codebase / single-generator；E 线执行者 **Codex**，worktree `/Volumes/ORICO/Dev/worktrees/orbit/redesign-e`、分支 `line-e`。本文件编制在 `redesign`，只创建本目录 GOAL / PLANNER，未实施、未提交、未推送。
**单一目标:** 补齐因 fixture / 模拟器 API 地址未跑的 R11a Web + App、R11b App 门禁，并收口 R21 Web 六图 / App 五图的逐带差异；本线能修的页面缺陷修掉，别线文件给明确交还。**易读目标:** [GOAL.md](GOAL.md)。
**进入条件:** R11a / R11b / R21 的已交实现和 R31a / R31b 组件已在执行基线；没有以 R11b Web 六图既有 PASS 代替 App 的验收。**判定:** README RD-29 覆盖决定表 §20 中旧的 Web raw 限制，两端均按逐带合法归因判定，raw 只记参考值。

## 0. 给 Codex 的执行说明

1. **工作线。** 在 `redesign-e` 的 `line-e` 开工，先 `git pull --rebase origin redesign`，确认工作树和未提交的他线改动；记录两端 HEAD。Web `:3800`、独立 `distDir=.next-line-e`，Metro `:8088`，本机库 `orbit_line_e`，新建 iPhone 16e Simulator **`Orbit PX1 16e`** 并记 UDID。别占 :3300 / :3700、别用别线模拟器或数据库。证据目录 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-e/PX1/run-01/`（可把 `~/orbit-sprint-evidence/redesign/PX1` 链到这里）。不连 Neon、生产、不部署、不动生产变量或 TestFlight；开发用 fixture 不产生付费 AI 调用，实际调用数记入 REPORT。
2. **阅读顺序。** 本页和 GOAL → [README](../README.md) 通用规则 10–13、RD-16、RD-24～RD-33 → [HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §0 / §8 / §10 → [HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) G01–G26、R11-02 / 04 / 15 / 16、R21-01～10 → [DEFERRED-A](../DEFERRED-A.md) §1 R11-16 与 §2「待 R11」 → [决定表](../maintenance/2026-10-12-decisions.md) §20 / §51 / §52 / §B-2 → R11a / R11b / R21 的 PLANNER、REPORT、预检和 R21 REVIEW → 两端 AGENTS 与 `repos/orbits/scripts/visual/README-redesign.md`。跨端数据/状态先读 `bridge/status.md` 与 `bridge/handoffs.md`；Bridge 根台账由协调者写，E 在 REPORT 提供交接原文。R11-18 目前只在 R11b REPORT §7 / §8，**不在**当前 HANDOFF / DEFERRED-A：本轮 REPORT 给主会话两处补登请求，不伪称已登记。
3. **基线与图谱规则冲突。** 开工前记录 R11a/b/R21 既有全量失败用例名及**各自旧基底**，跑本轮定向基线、类型、lint 和现有门禁代表屏；全量只在收口时跑。旧基底日志不能直接证明新失败为零；若收口全量有无法归属的失败，才在同版本干净 `origin/redesign` 副本上补跑对照全量，按失败名称比较。仓库 README RD-32 说停用 GitNexus；本工作区项目 AGENTS.md 仍明确要求改函数/类/方法前 `impact`、提交前 `detect-changes`。本计划采用更严格的 AGENTS 要求：若实际改函数/类/方法，先做上游 impact（UNKNOWN 再文本搜索），HIGH / CRITICAL 写风险和对策；若提交代码，提交前做 graph change analysis。文档编制没有改代码，也没有提交。
4. **重任务。** 全量测试、浏览器/模拟器门禁、prebuild、原生构建都经 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/heavy.sh e -- <cmd>`；**E 线任一时刻只排一个**。定向轻测试与读源码可以并行，但全量只在收口跑一次；有实际新增失败或修复后才补跑受影响检查。每个画面最多三轮，`--only` / `--style-diff` 用于迭代，收口再跑完整清单。`heavy.sh` 自身的队列与超时结果写日志，不把排队/超时算通过。运行 Python 工具时先用 `uv venv`，通过 `uv run` 执行。
5. **交付。** 实施时创建 `PX1/REPORT.md`、必要的 PX1 预检清单/证据索引和归因文件；只在 §1 指定页面、fixture、门禁文件内修。REPORT 对每个 SC 写结果和证据、失败用例、逐屏 raw / 带数 / 未归因带、3 轮上限、跨端版本、越线自查和需要主会话补的台账条目。代码若按 E 线既有流程本地按路径提交，核对 `git show --stat HEAD`；**不推送**，由主会话独立复核和集成。本次文档编制不作这些动作。
6. **不中断其余工作。** 某屏需 A 线 FullDrawer / token、D 线壳或 B 线数据时，该屏标「待交还/未过」，列具体输入和重比条件；继续其他可执行屏。页自身缺数据 fixture 是本 Sprint 的任务，不以「等设计」跳过。需要产品取舍按 §2 代定和 RD-33 口径处理；新冲突写 REPORT 推荐/依据/影响 SC，由主会话复核，不向离线用户提问。

## 1. 本线归属的文件 / 不许碰的文件（RD-31，PX1 的窄范围例外）

**E 线 PX1 可改（只为本轮 fixture、页面修正、门禁）：**

- R21：Web `repos/orbits/app/(app)/app/agent/iorbit-2026/**`、`orbit-2026/copy/iorbit.ts`；App `repos/orbit-app/src/screens/ai/{IOrbitStartView,AiScreen,AiConversationScreen}.tsx` 及该功能自己的样式、文案和定向测试。仅修 §6 的起始、会话、历史页面差；保留 R21 已交会话/可靠发送语义。
- R11a：Web `repos/orbits/app/(app)/app/orbit-2026/network/**` 与该域 copy，App `src/screens/network/**` 与该域字典、R11a 对应测试；为设计 fixture 所需的 `repos/orbits/shared/mock/demo-world/network.ts` **只加本功能数据**，必要时在 `features/contacts/card-service.ts` / `app/api/contacts/page/handler.ts` 加非生产的受控读取适配，不改 live 查询与写路径。详情、招待连接、确认卡若需本线的开发态入口，只在 R11a 页面/开发路由里做，正式包必须不可达。App 本机镜像注入限本功能测试/开发态，不能改通用同步规则来造画面。
- R11b：`repos/orbits/features/network-analysis/{analysis-fixtures.ts,design-fixtures/**}` 与 `app/api/dev/network-design-fixture/route.dev.ts` 只作复用/补数据；App `src/screens/network-analysis/**` 与该域测试/字典仅修像素实见页面差。R11b Web 页面已过六图，本轮原则上只读/回归；若 R11a fixture 影响六图，先定位、再最小修复并重比。
- 视觉清单和归因：`repos/orbits/scripts/visual/views/{web-R11a,app-R11a,app-R11b,web-R21,app-R21}.json` 中的端口、到达状态与 fixture 选择；新建 R11a 两份归因文件，在现有 R11b App、R21 Web/App 归因文件中只加实际逐带条目。现有 R11b Web `attribution-redesign-R11b.json` 只读。PX1 的 REPORT / 预检写本目录；原 R11a/R11b/R21 REPORT 保持历史，不回写旧结果。

**不许碰，写交还：**

- A 线：Web `orbit-2026/ui/**`、App `src/components/ui/**`、`shared/design/tokens.json`、`kit/**`、`scripts/visual/{compare-redesign*.mjs,redesign-pixel-lib.mjs,contrast-substitutions.json}`。左侧 Web Drawer / App FullDrawer、Toast 绝对 `undoUntil` 与缺 token 的请求给 A/R32；不在 R21 页用局部 CSS 假造第二套组件，也不把 §52 的特定组件例外挪到整页。
- D 线：Web `orbit-2026/shell/**`、Task/首页；App `src/components/{AppScreen,ShellTopBar,OrbitTabBar,TabPageBar}.tsx` 和导航映射。PX1 新 App 屏或重建页面仍传 `AppScreen inset="kit"`，不修改壳内部；壳自身差异给 D。
- B/C/甲其他功能：R12 加人、R15 邀请、R16 导入、R30 搜索、R13 inbox、R18 账户、计划页内部、共享权限/同步底座与生产迁移；这些只重比并给所属线交还。R11a / R11b 原属 B，**本轮仅上述明确列出的 R11a/b 页面和 fixture 由 E 修**，不覆盖 B 线未提交工作。
- README、HANDOFF、DEFERRED-A、决定表、screen-ownership、Bridge 根台账由主会话/协调者改；本轮把逐条更新内容写 REPORT。不清空原有归因、不改画板让门禁变绿，不改 Web/App 全局样式或演示世界其他域。

## 2. 主会话代定（RD-33；编制时给执行者的建议口径，用户可逐条推翻）

| # | 代定与依据 | 影响 |
| --- | --- | --- |
| PX1-1 | **同一四态数据，两个读取面。** R11b `designNetworkPeople` 是人数/行业等事实源；R11a 从同一人物投影为卡片、summary、详情和本机镜像，并补画板特有的招待/确认/以前の値样本。`locked5` 与 R11a 的「5 人少量」可共用人数，`few14` 单列校验；不把分析数据直接当联系人的完整 DTO。所有样本只在开发/测试生效，正式构建 404/无注入。符合「数据自洽」和 R11-16。 | SC-02～04 |
| PX1-2 | App 开发包 API 地址以**模拟器内已保存设置优先**；先用 `/settings/api` 指向 `http://localhost:3800`，点健康检查、保存、回到分析页核对 :3800 请求与当前 fixture 计数。`.env.development.local` 只影响默认值，已保存的 `orbit.apiBaseUrl` 会覆盖它；新模拟器也要检查当前值，不能只看 Metro :8088 已连接就判 API 正确。 | SC-01、05 |
| PX1-3 | R11a 预检曾建议 token 近似值统一归 `[raster]`，但 §20 / RD-29 只容许裁剪后确实属于字形/1–3px 折行或亚像素残差；间距、元素尺寸和结构差不能因「接近」放行。`[contrast]` 必须能指向 `contrast-substitutions.json`。这按已定规则一致处理。 | SC-07～10 |
| PX1-4 | R21 共享组件规格按 RD-33 已定的 kit / `01-system`；同一页面状态的较新 b11 / b8 / b4 板决定页面内容、位置和断点。若共享组件缺左侧变体或精确 token，屏保持未过并向 A 交还；**不把设计抽屉从左改右、不以 `[data]` 解释方向/宽度**。画板缺少的状态只附截图。 | SC-08、09 |
| PX1-5 | R21 会话样本可以用本人受控的本机 QA fixture 补齐板上实体卡/计划提示，但必须使用真实页面接收的 DTO/渲染路径，保持 actor 隔离、不发 AI；若现有 DTO/页面没有该组件，归页面结构缺陷或别线契约请求。数据文字不同仅可解释文字像素，不能遮住缺块。 | SC-08、09 |
| PX1-6 | 对 R11b 已获主会话代定而不画的无源卡、段階两项（§B-2）沿用现状，不为像素补假业务。App 上图表渐变/圆点、ghost 字色和 ? 按钮按真实板裁剪判；能用本页面修的修，必须改 A 组件的列交还。R11b Web 六图既有通过保留，但若本轮动共享 fixture 后出现回归要重验。 | SC-05、06 |
| PX1-7 | R11-18 是 R11b REPORT 提出的待补交接编号，当前台账缺行；PX1 把它作为**来源 REPORT 的待办**纳入 SC，REPORT 提供 HANDOFF / DEFERRED-A 两行请求，由协调者补，不自称台账已更新。R11-17「最近削除した項目」仍是下一期，不为凑像素新做。 | SC-05、11 |

## 3. 交接条目映射（来源 REPORT 条目逐条列出，收口 REPORT 逐条报结果）

| 来源条目 | PX1 落点 / 边界 |
| --- | --- |
| **R11a REPORT SC-R11a-12、§4；HANDOFF R11-02 / R11-16；DEFERRED-A §1 R11-16** | SC-02～04、07：四态 fixture，跑 `web-R11a.json` 24 视图和 `app-R11a.json` 15 视图；App R05 顶栏/详情旧门禁随 §7 复比。 |
| **R11a REPORT SC-R11a-13；HANDOFF R11-04 / R11-15 / R11-16；DEFERRED-A §2「R15 / R16 待 R11」「R30 / R11-15」** | SC-04、10：W-R12-01～04 的人脈背景、W-R15-14、R16 REPORT 中确认为待人脈的画面、W-R30-P03 / A-R30-P08 与 `?industry=` 落地；逐一核对当前清单，缺视图（例如 W-R12-02）补可复跑条目或写明没有有效画板/状态，不静默略过。R12/R15/R16/R30 页面自身缺陷只交还。 |
| **R11b REPORT SC-10、§4、§7-1、§8 R11-18** | SC-01、05、06：先解决 App :3800 API 设置，再跑 A-R11b-01 / 02 / 03 / 03D / 04 / 05 / 06 共七图。REPORT 提交 R11-18 台账补登原文；R11b Web 六图是已交基线，仅在 fixture 影响时重跑。 |
| **R21 REPORT SC-13、App 逐带复核；R21-A → R32** | SC-09：A-R21-03 / 04 / 13 / 14 / N01 五图；起始文字/几何与 FullDrawer 左右差逐带处理。组件、正式 token、`undoUntil` 向 A/R32 交还，不能拿 §52 特例放行。 |
| **R21 REPORT SC-14、Web 逐带复核；R21-A → R32** | SC-08：W-R21-03 / R01 / R02 / R03 / R04 / R05 六图；R03/R04 左抽屉差需 A 组件，其他实体卡、composer、页脚差先修 E 页面。 |
| **R21 REPORT R21-R30 / R21-B → R13 / R21-D → R20b** | 本轮不是会话搜索/inbox/草稿功能收尾；SC-11 记录当前版本与未完交接，不把 SC-11/12 功能链或跨设备实操写为 PX1 像素通过。若像素 fixture 要 inbox/草稿数据，保持本人作用域，只在 E 线页面展示，不改 B/D 服务。 |
| **HANDOFF G05–G09 / G21–G26；README 规则 10–13** | SC-01、07～11：示例 fixture、预检、组件/token、App 原生、逐带归因、旧页面不退步与无画板标注。其它 G 项按页面触及的壳/文案/契约由 SC-11 核对，REPORT 不把未执行项记 done。 |

## 4. 已查清的事实（`origin/redesign@d33a9f270`，执行时按符号重查）

以下路径与行号从仓库根算；这里是编制时事实，不是 PX1 实测结果。

1. `repos/orbits/features/network-analysis/design-fixtures/index.ts:1-6,85-110` 已定义 `empty` / `locked5` / `few14` / `many286` 的人物与需要；`analysis-fixtures.ts:20-24,52-64` 用同一世界给分析页计数。`app/api/dev/network-design-fixture/route.dev.ts:1-5,15-30` 是非生产、只在 `network-analysis` mock 可用的变体开关。**它目前只给 R11b 分析读取，不等于 R11a 的联系人页已有 fixture。**
2. `repos/orbits/features/contacts/card-service.ts:64-74` 的联系人卡片服务当前要求 live provider；`app/api/contacts/page/handler.ts:33-43` 默认直接调用该服务。R11a REPORT §4 要的 `ORBIT_REDESIGN_MOCK=network` 仍需明确的开发态读取路径；不能只设环境变量就宣称四态已生效。
3. `repos/orbit-app/src/screens/network/useNetworkList.ts:48-83` 在本机联系人镜像可用时优先用 `useLocalContacts()` 计算列表和 summary，只有镜像不可用才发 `/api/contacts/page` 与 `/summary`。因此只改 Web mock API 不会保证 App 截到同一人物。`NetworkScreen.tsx:78,113` 已用 `AppScreen inset="kit"` 和 `AddContactSheet`。
4. `repos/orbit-app/src/api/ApiBaseUrlProvider.tsx:17,34-47,70-90` 用 AsyncStorage 键 `orbit.apiBaseUrl` 读/存 API 地址；`base-url.ts:1-2` 的 `EXPO_PUBLIC_ORBIT_API_BASE_URL` 只是默认值。`src/screens/profile/AccountScreen.tsx:223-228` 通向 `/settings/api`；`src/screens/settings/ApiSettingsScreen.tsx:35-58,77-103` 可填地址、健康检查和保存。R11b REPORT §4 的「连不到 :3300」与此一致，但 PX1 尚未实测 :3800。
5. `repos/orbit-app/src/screens/network-analysis/analysis-api.ts:58-104` 的分析视图请求使用当前 `baseUrl`、actor 和页面快照；`NetworkAnalysisScreen.tsx:60-88` 用 `AppScreen inset="kit"`，失败显示重试卡。旧快照可能先显示，门禁要以新 :3800 响应和 `variant` 计数核验，不能只看屏幕有内容。
6. `repos/orbits/scripts/visual/views/web-R11a.json:16-268` 有 24 视图、`app-R11a.json:14-153` 有 15 视图，`app-R11b.json:14-80` 有七视图。R11a 的详情/弹层中途态有条目但部分尚无 steps，执行时须补受控到达方式再比，不把静态页面误当目标状态。R11b suite 的 `variant` 字段仅作元数据；当前比较脚本未见自动切换该字段的处理，运行每组前须通过开发路由显式 POST、GET 核对变体，再跑该组 `--only`。
7. `repos/orbits/scripts/visual/views/web-R21.json:16-84` 六视图、`app-R21.json:16-48` 五视图仍把旧 dev origin 写作 `:3700`，PX1 须改为 E 线 :3800；同文件内的 `r21-visual-pinned` 是上一轮本人 QA 样本，必须核对本机库确实存在并与板状态相符。R21 REPORT 的 `run-03` 结果属于旧基底，当前基底仍需全套重比。
8. `repos/orbits/app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx:309-313,368` 的窄屏历史用通用 `Drawer`；`repos/orbit-app/src/screens/ai/IOrbitStartView.tsx:130,171-197` 的历史用通用 `FullDrawer`。R21 REPORT「Web/App 逐带复核」明确左侧画板对右侧组件是结构差；改页面数据不能消掉。
9. R11a 预检 `preflight-checklist.md:5-13` 自洽问题 0，Web near 6 / missing token 61、App near 1 / missing 95；R11b 预检记录 0 自洽问题和 App 缺 token 50；R21 预检 b4 near 26 / missing 118，b11 missing 20，b8 near 2 / missing 18。预检是旧基线证据；PX1 先重列板与本轮套件，逐屏复核数据、token、组件、断点、到达状态，不能把「接近」预先写成合法归因。
10. R21 REPORT「Web/App 逐带复核」记录六 Web 未归因带 20 / 15 / 25 / 30 / 29 / 25，五 App 未归因带 19 / 28 / 19 / 21 / 17；`attribution-redesign-R21.json` 和 `-app.json` 仅有 schema，没有伪造通过条目。这是定位起点，非 PX1 新基底结果。

## 5. 环境、fixture 与受控状态

**端口恢复 SOP（SC-01，写入 REPORT 供下轮复用）：**

1. 新建 `Orbit PX1 16e`，记 UDID、iOS runtime、开发包 bundle/build、Web/Metro PID；只用本线 `orbit_line_e`，启动 :3800 / :8088，`GET /api/health` 先从主机确认。App `.env.development.local` 可设置默认 `EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3800`，但不把它当已安装包当前地址的证据，也不改 `.env.local`。
2. 在**该模拟器**登录后从账户的「服务器设置」进 `/settings/api`，查看当前地址；输入 `http://localhost:3800`，先点「確認」获得健康回执，再点「保存」。如果保存后 auth scope 改变，重新用本机 QA 账号登录。返回 R11b 分析页，选 `locked5` 后确认 App 显示 5/10、:3800 日志收到该账号的分析 GET；再切 `few14` 与 `many286` 验数据随之变化。记录设置截图、健康回执、主机请求日志、错误路径和复原步骤。若 `localhost` 在该模拟器不可达，用 Mac 本地网地址并记录原因/地址来源，不能静默改连生产。
3. 开发包重新安装/清数据会改变保存地址和身份；重跑时重新查第 2 步。每次切 `locked5` / `few14` / `many286` 前显式 POST `/api/dev/network-design-fixture`，随后 GET 同路由核对当前变体；比较脚本不会从 suite 的 `variant` 字段替你切状态。开发用版和生产版验证分开：必须证明 fixture 开关与本机注入在 production build 不可达。不要把读到旧页面快照、Metro 连接成功或 Web 浏览器成功当成 App API 连接成功。

**R11a fixture（SC-02～04）：** 用 R11b 四态人物事实投影联系人卡、summary、详情，补 `sourceChip`、`density`、`addedThisMonth`、`tabCounts`、fit candidate、`pausedFields`、`fieldHistory` 和必要的 demo id。空/5/14/286 的总数、页签/筛选、出どころ合计应与板及 §51 自洽；R11b 分析与 R11a 列表使用同一人/行业值。Web 切变体后从受控接口确认响应；App 本机镜像只在开发态载入同变体、同 actor，清理旧快照并实测离线列表仍按 R11a 规则工作。开发态 `design=` / `open-path` 仅用于中途状态，按 RD-28 测正式构建不可达。详情要能到真实目标状态，不能仅 deep link 打开基础详情就截图宣称「招待连接/确认/以前の値」过门禁。

**R21 fixture（SC-08/09）：** 用本机 QA actor 拥有的受控会话；起始的人名、会话条数、计划/实体卡与板状态逐一列实际来源。通过页面和 API 正常链读取，禁用真实 provider 调用；若板展示的卡无对应 DTO，先写页面/契约缺口，不在 screenshot 工具涂一层。每张门禁记录 actor、页面路径、fixture 版本、主题、板序号与控制中途状态的步骤。Web 390 去浏览器壳，App 用系统状态栏和安全区（规则 13）。

## 6. 像素 SC 与预检（HOW-TO §8、RD-16 / 26 / 28 / 29、决定表 §20）

| 组 / 视图 | 画板与本轮预检重点 | 到达与结果要求 |
| --- | --- | --- |
| R11a Web **24**：W-R11-01 / 01d / 02 / 02d / 03 / 03-1024 / 03-390 / 06 / 06d / 06-1024 / 06-390 / 07 / 07d / 07-390 / 07-390d / 08 / 08d / 09 / 09d / 09u / 09ud / 10 / 11 / 12 | `web-R11a.json`：web #4–7、b6 #36/#38/#41、b8 #13/#14、b12 #500–#513、b5 #45/#61、b1 #59；核对空/少量/大量数字、深浅与 1024/390 抽屉、招待/以前の値/确认中途态 | `empty` / `locked5` / `many286` 加所需详情样本；每条目真实达到板状态，记录全页门禁及补的 steps。画板无的组合只截图、不进门禁。 |
| R11a App **15**：A-R11-01 / 02 / 03 / 03d / 04 / 05 / 06 / 06d / 07 / 08 / 09 / 10 / 11 / 12 / 13 | `app-R11a.json`：app #6–9/#29/#34、b9 #20–22/#27、b5 #42–44/#60、b1 #58；核对本机镜像、sheet/筛选/编辑/删除确认与日期 | 用新 16e 原生截图，按四态对应板；深色仅已有画板的条目进门禁。App 镜像计数与 :3800 响应同源，页面返回/滚动不退步。 |
| R11b App **7**：A-R11b-01 / 02 / 03 / 03D / 04 / 05 / 06 | `app-R11b.json`：b5 #32–37/#67；锁定、参考値、構造、機会、インサイト、下钻及深色构造；复核渐变/圆点、ghost 字色、? 与无源块处理 | :3800 的 `locked5` / `few14` / `many286`；App 当前地址、账号和响应计数先通过 SOP。未画深色的其余状态写「设计稿无」。 |
| R21 Web **6**：W-R21-03 / R01 / R02 / R03 / R04 / R05 | `web-R21.json`：b4 #37、b8 #9/#10/#11/#12/#18；重点逐带对照 R21 REPORT 的起始标题/建议、实体卡/计划提示、composer/页脚，以及 1024/390 左抽屉 | 本人 fixture 与板状态一致；`--style-diff` 先定位页面几何，`--only` 迭代；左抽屉需 A 组件时该视图标未过，其余差继续修。 |
| R21 App **5**：A-R21-03 / 04 / 13 / 14 / N01 | `app-R21.json`：b4 #34/#38/#56/#57、b11 #41；浅深起始/历史与新全屏头；核对 16e 系统外壳、文字/卡片/输入和 FullDrawer 方向 | 真原生截图与同一 actor 会话；不以 QA 文字差放行卡片/抽屉差；若 A 左侧变体未到，历史两图保持未过并附裁剪、交还。 |

**五项预检逐屏写证据：** ① 同板数字和状态自洽；② 每个画面元素的数据/动作来源或已代定缺项；③ token 缺口与近似值、真实 computed style；④ 所用组件与 kit/01-system、宽度/主题及系统外壳；⑤ fixture 的人名长度/人数/日期/中途态及进入步骤。已有 R11a/b/R21 的 `preflight-*.md` 是输入，**不当作 PX1 已完成预检**。先重列画板标题/序号，再在 ORICO 写 PX1 预检；如果 suite 的 `board-index` 漂移，按标题核实后最小修清单，不能拿错板跑出假 PASS。Web 完整页面含壳，App 只用模拟器；没有原板的组合明示「设计稿无，附截图，不进门禁」。

**归因协议：** 每个视图键（含宽度/主题）在 `attribution-redesign-*` 中逐条写超阈带编号、类别、裁剪图路径和具体理由。`[data]` 仅限文字/数值样本，须有对应字段和同构布局；`[raster]` 仅限核图后的字形/折行 1–3px、dx/dy ≤3px 且颜色不超阈；`[contrast]` 指明清单中的颜色替换。元素缺失、顺序、位置、尺寸、抽屉方向、非清单颜色不归因。Web/App raw 均写到总表但只作参考。每图最多三轮；失败保留 summary/triptych/crop 和未归因带，不能写 done。复核抽查至少 20% 已通过图的 `[raster]` 裁剪图，并看所有缺块警告。

## 7. 验收契约（SC；操作链、通过条件和主证据）

| SC | 操作链 / 通过条件 | 主证据 |
| --- | --- | --- |
| **SC-PX1-01 环境与基线** | `line-e` 更新、只用 :3800/:8088/`orbit_line_e`/新 16e；Web 与 App 基线失败名单和版本已记；按 §5 在 App 设置地址，健康回执和 :3800 请求都见到；重任务无 E 线并发排队；离开时服务/模拟器清理 | 基线摘要、UDID、PID/端口、设置与健康截图、请求日志、SOP |
| **SC-PX1-02 共享四态 fixture** | `empty` / `locked5` / `few14` / `many286` 在 R11b 分析与 R11a 联系人页人数一致；§51 页签/来源合计、日期、滤镜、锁定阈值与画板自洽；开发态/生产态隔离 | fixture 单测、四态响应/截图、生产构建不可达测试 |
| **SC-PX1-03 App 镜像与详情态** | 同 actor App 镜像四态切换，列表/summary 与 Web 同数；招待、确认、以前の値有稳定受控步骤；清旧镜像后能刷新，离线镜像仍显示对应版本，不串账号 | App 本机/渲染回归、镜像来源记录、状态截图 |
| **SC-PX1-04 R11a Web + App 门禁** | §6 的 24+15 视图逐一补到达方式、跑门禁、逐带归因；A-R05-02 / A-R05-10 复比，未通过的写明属于 R11a 页面、壳或共享组件 | 两端总表（id/板/主题/raw/超带/未归因/结果）、归因 JSON、对照页 |
| **SC-PX1-05 R11b App 门禁** | SOP 解决旧 :3300 地址后，七图在本线 :3800 新 16e 上真实复跑；`locked5` 必须是 5/10 而非错误卡/旧快照；R11b Web 六图若 fixture 被触及则零退步 | API 日志、七图总表、`attribution-redesign-R11b-app.json`、对照页 |
| **SC-PX1-06 R11b 页面差归属** | 对渐变/圆点、ghost 文字、? 行的超带逐条判断：本页可修者修，A 组件缺口列请求；原 §B-2 与无源块不伪造 | 裁剪图、页面差修复测试或 A 交还表 |
| **SC-PX1-07 R11a 交叉重比** | 按 R11-16 重跑 W-R12-01～04、W-R15-14、R16 确实受人脈背景影响的画面、W-R30-P03/A-R30-P08；点「近い条件なら」确认 `?industry=` 预选；现有清单无 W-R12-02 时给明确补条目/无板结论，不写已跑 | 交叉门禁索引、跳转录屏/日志、责任归属 |
| **SC-PX1-08 R21 Web 六图** | 在 :3800 全套重比；修 E 页面可修的卡/输入/页脚差；左抽屉缺组件的 R03/R04 保留未过直到 A 交变体；不得把结构差记 `[data]` | 六图逐带表、style-diff、归因、A 请求 |
| **SC-PX1-09 R21 App 五图** | 新 16e 全套重比；起始/头部 E 页面可修差修；历史 04/14 的 FullDrawer 方向需 A 时保留未过；R21 REPORT 旧 raw/带数仅作前值 | 五图逐带表、原生 raw/triptych、归因、A 请求 |
| **SC-PX1-10 归因与状态** | 每个有板视图都给 PASS / 未过 / 待别线；PASS 的全部超带可核验地归因，缺块无遗漏；画板无与超三轮单列；归因文件只增真实记录 | 视图总表、各 JSON、裁剪抽查清单、无板截图 |
| **SC-PX1-11 全量、交还与复核** | 相关定向测试 → 收口两端全量、typecheck/lint/copy:qa 对照基线零新增失败；逐文件越线检查；REPORT 逐条答 §3，给主会话 R11-18、HANDOFF/DEFERRED-A、Bridge 四栏更新请求，A/D/B/甲的责任文件、输入和重比条件齐；独立复核实际复跑失败图和至少 20% 通过图 | 测试摘要及失败名、越线 diff、REPORT、REVIEW |

## 8. 执行顺序与收口

1. SC-01：同步 E 线、锁定版本/端口/库/UDID，读 §0 来源；先让 App :3800 SOP 真正成功，再对各套件做逐屏预检与受控步骤清点。运行之前不要把 404/旧快照当设计状态。
2. SC-02/03：从已有 R11b 四态投影 R11a 联系人，先测数值/权限/正式构建不可达，再接 Web 读取和 App 本机镜像；先用 `empty`、`locked5`、`few14`、`many286` 核对响应/截图。详情/中途态只补页面或开发路径所需最小步骤。
3. SC-04/05/06：先 R11a `--only` 空/少量/大量与详情代表屏，再 R11b App 七图；各屏至多三轮。需要别线组件的屏记未过并继续；R11b Web 如果共享 fixture 变了，重跑原六图，不沿用旧 PASS。
4. SC-07：在 R11a 新背景上重跑 R05、R12、R15、R16、R30 指定项；落地交互和像素分别记。外域页面缺陷只交还。
5. SC-08/09：R21 先用历史 `run-03` 的逐带区段定位 E 页面差，控制本人数据；按 Web 六图/App 五图 `--only` 迭代。A 未交左侧变体时把抽屉屏列未过，但继续做起始/会话屏。
6. SC-10/11：所有可执行屏收口后各套件全量门禁、两端全量测试经 `heavy.sh e` 串行跑，整理总表、归因和对照页；重新对照新旧失败名字，修本线引入的失败。REPORT 写每条未过的下一动作/责任人/证据，主会话独立复核后才由其更新台账与集成。

## 9. 失败、请求与交接

- **环境失败：** App 健康检查失败先看 `/settings/api` 当前地址、localhost 可达性、服务 PID、认证作用域和 :3800 请求日志；记录失败样本后修复。不能靠 UI 上的旧快照过门禁。只有 R11b App 屏依赖此步骤；Web 和 R21 可继续独立工作。
- **fixture 失败：** R11a Web handler 当前 live-only，若开发注入超出 §1 范围，记录具体函数/文件与最小请求并交 B；先做其他 R21 门禁。数据不自洽时改 fixture 和测试，不改设计稿或用 `[data]` 覆盖卡缺失。
- **门禁失败：** 第三轮仍有未归因带就停止该视图，REPORT 列视图键、带号、裁剪、原因、已试修复、下一归属；其他视图继续。现有 R21 抽屉方向差是明确结构缺陷，A 未交左侧变体之前不得标 PASS。R11a / R11b 无板组合不得借近似画板验收。
- **全量失败：** 基线已红要逐项记名；本轮新增失败先做有界修复，未解则标未过，不用「零新增」掩盖失败。重任务超时/排队退出要记未执行或失败，不记通过。
- **交给主会话的台账行：** HANDOFF R11-18（来源 R11b REPORT §7：App 七图因 API 地址未跑，PX1 以 :3800 SOP+原生门禁承接）、DEFERRED-A 同行；R11-16 与「待 R11」逐项处理结果；R21-A → R32 的左侧 Drawer/FullDrawer、正式 token、`undoUntil`，R21-B → R13 与 R21-D → R20b 仍独立未完。Bridge 交接写本端版本、另一端受影响路径、未完事项与实际验证范围，不把路由/类型通过当业务对齐。
