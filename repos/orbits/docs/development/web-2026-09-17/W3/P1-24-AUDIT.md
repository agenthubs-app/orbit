# W3 P1-24 活动探索列表审计与最小设计

审计时间：2026-09-17。阶段：**获批 A–C 与 D 示意说明已实现并独立验证，作为未发布候选交主任务集成**。

基线 `9aa359a2fda6730e8f1d3a0612c5ad4b7c8cf11f`。初始审计阶段没有修改产品代码；主任务目检后授权原 Luna max 修改探索组件及现有测试，Astra 独立评审/验证。最终仍只有两个实现文件与本文三条路径。标题、字号、网格、封面及全局 CSS 保持原样。下文原始审计记录描述修改前状态，末尾“实现与验收”记录最终结果。

## 范围与方法

- 已完成 product-design index、audit、user-context preflight 与相关审计/沟通参考阅读；未发现已保存用户上下文，按主任务范围执行。
- 使用 iab / CUA，在专属 `http://w3.localhost:4613/app/events` 经正常界面登录本地合成 B 用户。没有使用 W4 的页面、主机或 cookie，没有直接调用 Playwright。
- 桌面 1440×900，窄屏 390×844，中文浅色界面。共 7 张当前运行截图，逐张保存、查看后接受。截图实际编码为 JPEG，仅纠正了初始 `.png` 扩展名；原始字节及哈希未改变。
- 01–03 使用原有 1 场活动；04–07 使用原有 1 场加本次授权创建的 6 场合成活动。数据数量变化明确分开，不将空白区域当成列表故障。
- GitNexus 使用本工作树的 `orbit-web-w3-15e3` 索引，按已批准的 skip-fts 方式更新至当前基线。初始语义检索空结果没有被解释为代码无调用；精确 context 确认 `OrbitRealExploreClient` 的路由调用及卡片/地图子组件，再读取对应源码。

## 逐步截图与健康度

### 01 桌面默认列表：基本健康

导航、搜索、筛选和视图入口清楚；仅 1 场活动导致右列空白，这是样本量所致。卡片行动入口可见。不能据此判断真实目录密度。

![01 桌面默认列表](/tmp/orbit-w3-p1-24/01-desktop-default.jpg)

### 02 名称搜索：健康

输入“小型测试”得到正确的 1 场结果，标题和时间保留；输入框聚焦轮廓可见，清除入口存在。本步骤只验证名称搜索，不代表主题搜索也正确。

![02 桌面搜索命中](/tmp/orbit-w3-p1-24/02-desktop-search-match.jpg)

### 03 空结果与恢复：健康；另有主题搜索缺陷

输入 `zz-no-match-24` 后显示明确空结果说明及“清除筛选”按钮，点击可恢复目录。下文“人脉拓展”的不一致是额外 AX/源码证据；本截图中的查询不是“人脉拓展”。

![03 桌面搜索空结果](/tmp/orbit-w3-p1-24/03-desktop-search-empty.jpg)

### 04 桌面 7 场与长标题：基本健康

两列布局中的超长标题完整显示为 3 行，卡片底部行动入口对齐，未观察到文字裁切。900px 高首屏仅完整显示 2 张卡片，大幅封面占用主要空间；这是可讨论的密度取舍，尚不是确认缺陷。

![04 桌面多活动与长标题](/tmp/orbit-w3-p1-24/04-desktop-seven-events.jpg)

### 05 390px 默认列表：有筛选发现成本

搜索框完整，首张卡片及行动入口可见；封面高度缩为 128px，未观察到页面整体横向溢出。状态和话题共用一条横向滚动行，初始画面只看得到状态，话题组全部藏在右侧，且没有清楚的“话题”分组标签。

![05 窄屏默认列表](/tmp/orbit-w3-p1-24/05-mobile-default.jpg)

### 06 390px 组合筛选与长标题：功能健康，选中状态不易持续看到

先选“即将开始”得到 5 场，再横向滚动选“AI / 自动化”得到 1 场；组合筛选确实生效。此时选中的状态位于屏幕左侧之外。超长标题完整显示为 3 行，场地及报名入口仍可见，无证据支持先截断标题或缩小字号。

![06 窄屏话题筛选与长标题](/tmp/orbit-w3-p1-24/06-mobile-topic-long-title.jpg)

### 07 390px 地图切换：交互可用，返回含义与地理表达需处理

清空状态/话题后显示 7 个标记及选中卡片。点击其他标记会更新对应活动与详情链接，再点击“地图”能回到内容视图；后两项由当前 AX 记录确认。切换按钮选中后仍叫“地图”，没有明确的“内容”返回选项，也没有程序化选中状态。画面以“东京 · Tokyo”和道路图呈现，线上活动同样有位置标记；源码确认位置是哈希分布，不是真实坐标。

六场合成标题共用“【合成审计】”前缀，因此多个标记显示相同的“【”；这属于本次样本特征，不作为通用产品缺陷。没有额外截取长标题地图卡片，不声称已视觉验证该状态的截断效果。

![07 窄屏地图](/tmp/orbit-w3-p1-24/07-mobile-map.jpg)

## 修改前已确认问题、根因与最小设计

### A. P2：可见话题搜索与话题筛选不一致（高置信度）

无其他筛选时输入“人脉拓展”得到空结果；清空后点击同名话题按钮返回 1 场。搜索输入明确承诺支持“主题”。证据：[搜索 AX](/tmp/orbit-w3-p1-24/topic-search-ax.txt)、[话题筛选 AX](/tmp/orbit-w3-p1-24/topic-filter-ax.txt)，配合步骤 02–04 的搜索/空状态结构。

根因在 `orbit-real-explore-client.tsx:532`：查询只比较 `event.name`、`event.code`、`event.theme`，没有比较当前用于展示/筛选的 `eventTopics(event)` 及本地化 `topicLabel`。界面上的话题与搜索匹配来源不一致。

最小设计：保留既有名称、编号、内部主题匹配，增加同一事件现有话题 token 及当前语言可见标签匹配。若使用 language，纳入 memo 依赖。复用现有话题字典，不引入推荐服务或另一套分类规则。大小写/分词扩展不默认为本次范围。

### B. P2：窄屏两个筛选维度共用滚动条（高置信度）

步骤 05 的初始状态隐藏全部话题；步骤 06 的话题状态隐藏已选状态。根因是 `orbit-real-explore-client.tsx:664–667` 把全部状态按钮、分隔线和全部话题按钮放在一个 `overflowX:auto` 容器里。

最小设计：在移动端将“状态”和“话题”拆为有标签的两组，各自独立横向滚动；保留现有状态 URL 和话题状态行为。复用 chip、颜色、间距变量及已有滚动提示能力（现有 `.orbit-chip-scroller`），局部修改布局，不新增全局样式体系。

代价：两行会增加头部高度，首屏第二张卡片露出更少。若把点击区域从现有 30px 扩至项目的 `--tap-min:44px`，还需一并核对头部占用；不通过缩小正文来抵消。该尺寸建议是项目触控目标一致性，不据此直接判定 WCAG 不合格。

### C. P2：筛选与移动视图选中状态缺少可访问语义（高置信度）

状态/话题按钮用 `is-active` 样式表达选择，桌面及移动均没有 `aria-pressed`。移动地图按钮也没有程序化选中状态；桌面视图切换已有 group 与 `aria-pressed` 可复用。视觉截图不能替代辅助技术测试，但当前源码和 AX 已能证明这一语义缺口。

最小设计：为状态/话题按钮补充正确选中状态和分组标签；移动视图复用现有“内容 / 地图”两项控制，保持动作名称稳定、选中值可读。390px 顶部标题与该控制能否并排容纳须在实现后实测，不提前承诺布局无溢出。

### D. 独立决策：地图表达不具备真实地理依据（高置信度）

步骤 07 结合 `orbit-landing-route-view-model.ts:127–130`：`mapPositionFor` 对事件 ID/地点字符串取哈希，把位置限制在画布百分比范围；`MapCanvas` 使用静态道路 SVG。有限数值不等于经过验证的经纬度。

本次不要顺手搭建地理编码或重做地图。若继续保留示意画布，可先明确标示“活动分布示意（非实际位置）”，但这只是澄清现有能力，不能宣称修复了真实地图。是否保留示意模式、隐藏地图入口或另立真实地理契约，应由主任务另行决定；不默认并入 A–C 的实现范围。

## 保持现状与可访问性边界

- 保留目前长标题自然换行及卡片基本字号；桌面和 390px 都有实际长标题完整呈现证据。
- 保留名称搜索、空结果解释/恢复和行动入口层级。没有证据支持重做整个网格、减少封面或新增紧凑列表模式。
- 现有设计变量包含字体、间距与 44px 控件/触控目标。复用现有资源；`orbit-reference-styles.tsx` 本阶段只读，不列为默认修改文件。
- 本次未做完整键盘遍历、读屏、放大、对比度测量、真实手机触控或多语言视觉覆盖；不宣称可访问性达标。聚焦轮廓只在步骤 02 的输入框得到视觉确认。

## 原批准实现范围与验证计划

| 文件 | 最小候选内容 |
| --- | --- |
| `app/(app)/app/events/orbit-real-explore-client.tsx` | A 的同源话题搜索、B 的移动分组布局、C 的按钮选中语义及一致视图切换 |
| `tests/pages/app-events-view-switcher.test.ts` | 扩展现有实际 React 交互测试，验证搜索/筛选一致性和可访问状态；避免只写源码正则断言 |
| 本文 | 经主任务选择后记录明确实现范围、结果和残余问题 |

实施前按仓库要求对精确符号做影响分析。建议行为验证：名称/编号/内部主题搜索不退化；当前语言话题标签搜索与筛选一致；组合筛选与清空恢复；状态 URL 保持原有语义；内容/地图切换、标记选择、按钮选中值正确。保留既有 unknown participant count 及 registration state 回归。

视觉复核只覆盖变更后的 1440 和 390 关键状态，尤其两组筛选的可发现性、头部高度、长标题和移动视图控制。这部分保留原计划；实际执行结果见末尾“实现与验收”。

## 本地数据与证据账本

专属数据库 `orbit_web_w3_20260917`，`127.0.0.1:55463`；写入前验证数据库、地址和端口。沿用已有合成组织者、回填/运营配置与空 canonical membership 激活机制，事务创建 6 场，没有覆盖原活动，没有新增用户、报名、消息、worker 或模型调用。

| 新建 ID | 编号 |
| --- | --- |
| `24000000-0000-4000-8000-000000000001` | P124-SYN-01 |
| `24000000-0000-4000-8000-000000000002` | P124-SYN-02 |
| `24000000-0000-4000-8000-000000000003` | P124-SYN-03 |
| `24000000-0000-4000-8000-000000000004` | P124-SYN-04 |
| `24000000-0000-4000-8000-000000000005` | P124-SYN-05 |
| `24000000-0000-4000-8000-000000000006` | P124-SYN-06 |

- [完整创建账本](/tmp/orbit-w3-p1-24-created.json)、[临时脚本](/tmp/orbit-w3-p1-24-fixtures.ts)、[运行记录](/tmp/orbit-w3-p1-24-fixtures.log)。准备过程的两次失败均已回滚，最终目录校验确认 6 个新增 ID，总计 7 场。
- [截图清单/哈希](/tmp/orbit-w3-p1-24/captures.json)、[逐步记录](/tmp/orbit-w3-p1-24/notes.md)、[地图选中 AX](/tmp/orbit-w3-p1-24/map-selected-ax.txt)、[返回内容 AX](/tmp/orbit-w3-p1-24/back-to-content-ax.txt)。
- [图谱刷新记录](/tmp/orbit-w3-p1-24-index.log)、[精确组件 context](/tmp/orbit-w3-p1-24-explore-context.log)。
- 本地服务与 6 场合成数据暂留供主任务复核；以后清理须先查依赖，仅按上述确切 ID 删除，不做宽泛删除。活动状态会随时间变化，步骤 06 的 5 场“即将开始”对应本次捕获时间。
- 浏览器最终清空查询/筛选并回到内容视图，已清除 viewport override。Next 生成的 `next-env.d.ts` 改动已还原。这是初始审计结束时的状态；随后获批修改及最终提交范围见末尾。

主任务随后已实际审阅 04–07 并批准 A–C；D 选择澄清示意能力，不扩展真实地理功能。既有 R 跨客户端发布门禁不因本次工作而关闭。

## 实现授权与修改前影响分析

主任务已正式批准 A–C，以及 D 的准确示意文案：MapCanvas 改为“活动分布示意（非实际位置）”及对应语言；桌面“个位置”改“场活动”。仅允许本组件、既有 view-switcher 测试和本文三条路径。原 Luna max 编码，Astra 独立评审和验证。保持标题、字号、网格、封面、坐标算法与服务/API不变。

绑定仓库 `orbit-web-w3-15e3`，worktree `/Users/li/.codex/worktrees/15e3/orbit`，index/HEAD 均 `9aa359a2`，0 behind。精确 UID upstream impact：

- `OrbitRealExploreClient`：LOW，3 impacted、2 direct；直接调用为 AppEventsPage 与测试 renderEventsPage。
- `MapCanvas`：LOW，4 impacted、1 direct，为 OrbitRealExploreClient。
- 完整调用链与 10 条关联页面流程保留在 raw 中；没有 HIGH、UNKNOWN、partial 或 truncated。图谱的 module 聚类标签不等于新增跨域代码改动。
- [仓库绑定 raw](/tmp/orbit-w3-p1-24-repos.json)、[ExploreClient impact raw](/tmp/orbit-w3-p1-24-impact-OrbitRealExploreClient.json)、[MapCanvas impact raw](/tmp/orbit-w3-p1-24-impact-MapCanvas.json)。

语言验证边界：现有语言 provider 会重新导航，status 的 scope URL 可保留；query/topic 原本仅本地 state、导航会重置。本批先验证既有 scope 保留和同组件语言更新的匹配重算，不擅自扩展查询/话题 URL 持久化；主任务已明确确认此边界，不扩 URL 持久化、不改 Provider。组件上下文更新测试与真实导航验证将分别报告。

## 实现与验收

最终实现：A 搜索复用现有 eventTopics token 及当前语言 topicLabel，保留 name/code/theme 原大小写敏感 includes；memo 加入 language。B 移动端两组独立滚动，固定可见“状态/话题”标签，筛选与视图按钮最小触控尺寸 44px，复用已有 chip/scroller。C 两端筛选带 group 与 aria-pressed，移动稳定显示“内容/地图”两项，英文标题较长时局部换行。D 明确中英日示意说明并将桌面统计改为活动场数。

Astra 发现 D 原角标位置被桌面选中卡遮挡，[失败证据](/tmp/orbit-w3-p1-24-after/failed-desktop-map-obscured.jpg)已保留。主任务实际目检后追加批准：同一说明容器 bottom14→top14、left/right14、允许换行、pointerEvents:none。未改变地图标记、事件坐标、选中卡或 API。此修正使说明真正可见，不代表实现了真实地图。

### RED→GREEN 与独立检查

- 初次话题测试使用自动分类 fixture，存在预期歧义，不计作有效回归证据。改用显式 Relationship building/Finance 及先确认可见按钮后，恢复原搜索谓词取得[有效 A RED](/tmp/orbit-w3-p1-24-a-valid-red.log)：2 fail、exit 1；恢复 A 后[2/2 GREEN](/tmp/orbit-w3-p1-24-a-green.log)。
- [B–D RED](/tmp/orbit-w3-p1-24-bcd-red.log)：原有/A 5 pass、3 fail，缺失分组/选中语义/双项视图控制；实现并修正测试初始 effect 的 act 边界后，[最终 8/8 GREEN](/tmp/orbit-w3-p1-24-green-final.log)，0 skip。没有修改产品 effect 来迎合测试。
- Astra 独立[探索页最终回归](/tmp/orbit-w3-p1-24-parent-explore-final.log)：14/14，0 skip，覆盖 view-switcher、registration-state、demo-visual-assets，包含原 unknown participant count 场景。
- Astra 独立[报名回归](/tmp/orbit-w3-p1-24-parent-registration.log)：30/30，0 skip，覆盖 account-scope、readback、workspace。合计 44 项通过；这些未改报名模块仅作回归，既有发布限制仍保留。
- Astra [最终完整 typecheck](/tmp/orbit-w3-p1-24-parent-typecheck-final.log) exit 0：`npm run typecheck`（tsc --noEmit --incremental false -p tsconfig.json）；`git diff --check` 通过。测试与类型检查均使用干净本地环境，无模型/云调用。
- 独立 review 确认产品 diff 只触及 MapCanvas 与 OrbitRealExploreClient 已批准内容；没有修改 topicLabel/eventTopics 的分类规则、地图坐标函数、注册域、推荐服务或全局 CSS。

### 修改后 7 步截图

以下原始 JPEG 均已保存并从文件查看，尺寸/哈希见[验收截图清单](/tmp/orbit-w3-p1-24-after/captures.json)。前 01/02/04/05 捕获后仅追加地图说明定位修正，不影响这些列表状态；地图 03/06 为定位修正后的重新验证。

1. **1440 默认：健康。** 保持两列与完整长标题，7 场活动，卡片行动入口对齐。

![修改后01桌面默认](/tmp/orbit-w3-p1-24-after/01-desktop-default.jpg)

2. **1440 组合搜索：健康。** `scope=upcoming` 与“人脉拓展”搜索得到 1 场，原缺陷已消除。

![修改后02桌面搜索](/tmp/orbit-w3-p1-24-after/02-desktop-topic-search.jpg)

3. **1440 地图：说明可见，交互健康。** 页面向下滚动以展示完整地图；顶部示意说明不再被底部选中卡遮挡，统计为 7 场活动。点击 AI 标记后卡片/链接切换正确，再恢复首场；[桌面选择 AX](/tmp/orbit-w3-p1-24-after/desktop-marker-selected-ax.txt)。

![修改后03桌面地图](/tmp/orbit-w3-p1-24-after/03-desktop-map.jpg)

4. **390 默认：健康，密度取舍明确。** 状态/话题分组同时可见，触控尺寸增大；首张卡片报名入口完整。相比修改前，首张卡片顶边约由 264px 下移至 384px（增加约 120px），首屏第二张露出更少，这是批准的可发现性与触控取舍；没有缩字体抵消。

![修改后04窄屏默认](/tmp/orbit-w3-p1-24-after/04-mobile-default.jpg)

5. **390 组合与长标题：健康。** “即将开始”和“AI / 自动化”同时保持可见/选中，得到 1 场；长标题 3 行完整，场地及报名入口完整。

![修改后05窄屏组合](/tmp/orbit-w3-p1-24-after/05-mobile-combined-long-title.jpg)

6. **390 地图：说明可见，入口可正常滚动访问。** 小幅滚动后声明和报名入口同时可见，未见整体横向溢出。先点击 AI 标记核对对应详情链接再恢复首场；[窄屏选择 AX](/tmp/orbit-w3-p1-24-after/mobile-marker-selected-ax.txt)。一次滚动过量使说明离开可视区域的候选图未接受，留作[视口调整记录](/tmp/orbit-w3-p1-24-after/rejected-mobile-map-scroll.jpg)，不计入通过截图。

![修改后06窄屏地图](/tmp/orbit-w3-p1-24-after/06-mobile-map.jpg)

7. **390 英文真实导航：符合现有语义。** 通过页面语言按钮从中文导航到 `?scope=upcoming&lang=en`，Upcoming 仍选中且 5 场；query/topic 重置。长英文标题使视图控制自然换行，首张报名入口仍完整，无整体横溢。

![修改后07英文导航](/tmp/orbit-w3-p1-24-after/07-mobile-language-scope.jpg)

真实导航证据：[导航前状态](/tmp/orbit-w3-p1-24-after/language-before-ax.txt)、[英文导航后](/tmp/orbit-w3-p1-24-after/language-after-en-ax.txt)。组件测试中的 language 更新没有发生真实浏览器导航，仅证明 memo 重算；没有把它描述为跨导航保全 query/topic。另在真实 UI 验证了[英文可见话题搜索命中](/tmp/orbit-w3-p1-24-after/topic-search-en-ax.txt)、[英文地图说明](/tmp/orbit-w3-p1-24-after/map-en-ax.txt)、[日文地图说明](/tmp/orbit-w3-p1-24-after/map-ja-ax.txt)。既有日文页面的其他标签回退行为不属于本次改动。

最终浏览器恢复中文、完整目录与内容视图，viewport override 已 reset，专属 W3 标签页保留；没有点击报名写入。合成 6 场与自有服务仍按前述账本保留供主复核。

### 最终变更检测与边界

旧索引的初次 detect_changes 仅映射到 4 个产品符号，遗漏新增测试助手，因此没有据此声称完整通过。按允许流程对本树执行一次 force + skip-fts + index-only，保持 GitNexus 工具/依赖和仓库规则文件不变；[索引日志](/tmp/orbit-w3-p1-24-final-index.log)记录 109089 nodes、245557 edges、801 flows。

刷新后针对明确本 worktree 执行 scope=all：[完整 detect_changes raw](/tmp/orbit-w3-p1-24-DETECT-CHANGES.json)，最终三文件暂存后 summary changed_count=54，实际返回 54 个符号（其中 19 个文档条目），changed_files=3，risk_level=low；未报告 error/partial/truncated。affected_count=0 是该工具的变更流程结果，不替代修改前精确 impact 中已确认的页面调用链，不能解释成没有调用方。新增测试助手已映射，无需伪造 File 节点或改变测试结构满足图谱。

提交仅含探索组件、view-switcher 测试与本文。未部署；真实地理能力仍未实现；query/topic 跨语言整页导航仍按原行为重置；本地合成与有限视口验证不代表完整多语言/读屏/真机无障碍认证。下一步由主任务按最终提交集成并保留其现有发布门禁。
