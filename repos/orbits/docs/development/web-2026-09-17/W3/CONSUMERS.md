# W3-F nullable 人数消费者核对

核对基线：`161e9e6c4d1f314db90365a4d840718adfa12c70`，本树 `/Users/li/.codex/worktrees/15e3/orbit`。Astra 独立核对。以下路径相对 `repos/orbits`。

## 图谱风险与核对方法

CLI 1.6.12，本树独立索引 `orbit-web-w3-15e3`。基线刷新后再执行 context/impact。`OrbitEventStatsView`：**CRITICAL，24 direct / 2 affected processes / 5 modules**；`OrbitLandingEventView`：**HIGH，20 direct**；`getOrbitLandingEventView`：**HIGH，3 direct / 7 impacted**；`eventView`：**HIGH，2 direct**。均已在代码实施前向主代理和用户披露，不以 riskSharedAxes 降级。

24 条 direct 是 18 个 File 节点和 6 个命名符号，不是 24 条都执行人数计算。逐项按实际成员使用核对；File 扩展包含同文件其它类型导入，不把这些边误记为 count 执行流。六个符号为 resolveCanonicalEventDetailView、AppEventDetailPage、mapEvent、publicListEvent、canonicalOrganizerViewModel、OrbitLandingEventView；已映射到下表相应文件，重复项不漏验也不重复计数量。

日志：`/tmp/w3-f-impact-event-stats-interface.log`、`/tmp/w3-f-impact-landing-event-interface.log`、`/tmp/w3-f-impact-landing-mapper.log`、`/tmp/w3-f-impact-event-view.log`；同前缀另有每个 adapter/presenter/type 的 impact。文档记录上述完整判定与下列实际列表，不依赖临时日志长期存在。构建索引提示动态调用候选/流程裁剪，不能把空集合当安全。

## 24 direct 的实际消费者矩阵

| 实际文件（均在 `app/(app)/app/` 下） | 图谱节点及实际消费 | 分类与处理 | 验证 |
| --- | --- | --- | --- |
| `canonical-event-detail-view.ts` | File + resolveCanonicalEventDetailView；把摘要映射到两个人数字段 | 需适配，已批 F；缺摘要 null、合法0保留，policy容量独立读取 | canonical detail mapper 正负例 |
| `canonical-public-event-view.ts` | File；完整 public catalogue → landing VM 转发 | 只读兼容；canonical catalogue 原本拒绝缺 summary，F 不改变该读取契约 | public catalogue/活动列表实际路由 |
| `events/[id]/orbit-real-event-detail.tsx` | File；EventInfoCard 做人数/容量/剩余计算 | 需适配，已批 F；null 不计算剩余，cap 0/null/undefined 分别处理 | detail render 组合矩阵及实际产品页 |
| `events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter.ts` | File；旧 adapter 生成 cap+20 | 需适配，已批 F；无来源 cap=unknown | mock detail route/render 回归 |
| `events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts` | File；legacy adapter 构造 count=0，不读取 nullable 值计算 | 只读类型兼容；既有零默认未在本批全面改造，不冒称所有 legacy 数值均经事实审计 | events live route service 回归 |
| `events/orbit-real-explore-client.tsx` | File + mapEvent；MappedEvent.people 与三视图显示 | 需适配，已批 F；原少于5人隐藏规则不改，未知不渲染数值 | 三视图行为断言，不以源码regex代替 |
| `events/page.tsx` | File + publicListEvent；已有 number\|null 参数和保留 catalogue 数值逻辑 | 只读兼容；成功 catalogue 人数完整，null 参数不硬置0 | events source/registration state与正常列表 |
| `home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx` | File；canonicalEventToLandingEvent 无权威总数却传0 | 需适配，追加已批；仅改该投影为null，不增加读取 | home source/route与已报名账号本地home/events |
| `home/orbit-real-home.tsx` | File；AccountEventCard 无条件显示人数 | 需适配，追加已批；null时隐藏原数值span | 实际render同时验证unknown隐藏、known不退化 |
| `o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts` | File + canonicalOrganizerViewModel；canonicalRows校验真实number，后以宽类型数组reduce | 需局部类型适配；申请保留已校验number到更窄的公开主办方事件数组，不用??0 | organizer public live route tests + typecheck |
| `o/orbit-real-organizer-public.tsx` | File；人数插值和totalAttendees reduce | 真实消费，来源始终完整；优先通过上游局部契约收窄维持number，不改presenter | 同上及公开主办方实际页 |
| `orbit-agent-hero.tsx` | File；读取账户/入口展示，不使用cap/participantCount/stats.count | 同文件类型依赖，非本次字段执行流；只读兼容 | typecheck、既有消费者回归 |
| `orbit-event-presentation.ts` | File；语言展示保留/展开输入event，不重算人数 | 只读兼容；不得将null本地化成数字 | detail与home语言/render回归 |
| `orbit-event-roster.ts` | File；仅导入同文件的OrbitEventAttendeeView，生成demo名单 | 本次字段的非实际依赖；不是stats.count调用方，不据此改名单生成器 | typecheck；不声称demo名单为真实 |
| `orbit-home-route-view-model.ts` | File；组合page-owned types，无人数计算 | 只读兼容；成员类型随共用VM更新 | typecheck |
| `orbit-organizer-route-view-model.ts` | File；events当前是宽OrbitLandingEventView[] | 需局部类型适配；申请声明公开主办方events.participantCount为已知number，与已有来源校验一致 | organizer producer/consumer typecheck与测试 |
| `orbit-real-landing-page.tsx` | File；转发/展示event结构，不做人数/容量运算 | 只读兼容 | typecheck及public landing路径 |
| `orbit-registered-event-route-view-model.ts` | File；以roster.length覆盖两个人数字段 | 需适配，已批 F；名单投影保留，但人数沿用聚合 | 62总数/2名字断言、真实PG报名生命周期 |
| `events/[id]/page.tsx` | AppEventDetailPage 符号；转发canonical resolution.event | 只读兼容，不新增DTO/授权变化 | 正常Next产品路由与冷刷新 |
| `orbit-landing-route-view-model.ts` | OrbitLandingEventView 符号；共用人数/cap字段定义及mapper | 需适配，已批 F；三态容量、nullable人数，从源头删除+20与缺失置0 | mapper组合测试、全部消费者typecheck |

## UNKNOWN 的边界

home 的 private canonicalEventToLandingEvent 和旧 detail adapter 的图谱 impact 返回 UNKNOWN。源码确认前者由 `homeViewModel` 的 `participantEvents.map(canonicalEventToLandingEvent)` 使用，后者有 detail route/page tests 消费；不能因0 direct删除函数或省略回归。实际引用搜索与文件限定 context 结果随编码交接保留。

本矩阵仅判断本批 nullable 传播。已审批文件之外不以 CRITICAL 自动扩写。主代理随后已明确批准上表公开主办方两处局部类型收窄；禁止 `as number`/其它断言掩盖未知、禁止 `?? 0`，不改 presenter/读取/API DTO。表中“申请”为发现时分类，当前已转为批准范围。整个矩阵的验证结果在 REPORT 中逐项记录，详情一页成功不代表共用类型全部通过。
