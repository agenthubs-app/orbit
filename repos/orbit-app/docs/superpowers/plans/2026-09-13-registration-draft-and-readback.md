# R-04：报名草稿、问卷版本与回读

> **For agentic workers:** 使用 `superpowers:executing-plans`，沿用已选单代理、原目录和 `chat-agent`；逐功能本地提交，不推送。

**Goal:** 刷新不丢未提交答案或辅助问答；问卷变化明确确认；有效报名／取消回执后重新读取报名与活动详情。

**Architecture:** 沿用现有 Screen、HTTP client、useApiResource 和表单。以账号／服务器／活动绑定草稿和请求，保存已接受的问卷身份；新服务端数据可以更新报名状态，但不能静默替换正在填写的问卷。服务器继续判定报名资格。

**Tech Stack:** 现有 React Native / Expo Router、TypeScript、RNW/Playwright、Node Test Runner；无新依赖。

**Spec:** [已批准剩余计划 R-04](2026-09-13-app-remaining-functionality-and-connectivity.md)。本项仅落实既有草稿保护、版本变化提示、防重和当前页回读；活动生命周期、审核资格、列表／首页／日历和匹配消费仍按完整 R-04 验收。

## 约束与已核实契约

- 只改 `repos/orbit-app`；Web、Bridge、生成副本和权限不变。不在客户端用日期猜资格。
- GET registration 返回 `{questionSet, registration}`；问题含 field/id/prompt/options/required，发布身份是 questionSetHash/questionSetVersion。旧无发布身份的问卷仍比较问题内容，不比较已保存答案。
- POST registration 和 cancel 均直接返回 EventRegistration，包含 id、eventId、userId、status、participantProfile。检查回执对应当前账号／活动及目标状态，不将任意 success 或错误 HTTP 状态算作保存成功。
- 报名 GET 在未发布固定问卷时可能调用模型；自动化仅在 fetch 边界返回合成数据。真实读取仍受同一累计 $5 账本限制，本计划不授权修改真实报名。
- 问卷变化时仍显示旧问题／答案与辅助草稿，阻止提交或继续辅助生成；复用既有样式提示“报名问题已更新，当前答案和辅助问答已保留。”。“载入新问题”经原生确认后才清空未提交内容；取消、过期确认及重复确认不丢稿。
- 不新增离线写队列、全局缓存总线或问卷答案语义迁移；保存确认和完整跨端回读分别记录。

## 文件与接口

- 修改 `src/screens/events/EventRegistrationScreen.tsx`：保留表单草稿与已接受问卷，隔离请求、同步锁、版本确认、成功后两个资源 refresh。现有布局不重做。
- 修改 `src/view-models/event-registration.ts`：增加纯问卷比较键 `eventRegistrationQuestionKey(view)`、回执归属检查 `eventRegistrationReceiptMatches(data, eventId, actorId, status)`；不复制 Web 类型或扩张同步白名单。
- 新建 `tests/event-registration-interactions.test.ts`：真实路由、Screen、hooks、client 和 view-model；只替换原生能力、身份／服务器来源和外部 fetch。
- 扩展 `tests/event-registration-view-model.test.ts` 的纯边界用例；更新本计划和连通性记录。

## 执行

- [x] 相关原基线 88/88，38.983 秒、exit 0；日志 `/tmp/orbit-r04-registration-baseline-20260913.log`。
- [x] 刷新根 GitNexus，逐符号 upstream impact 后编辑；已收录与 UNKNOWN 分开报告。
- [x] 新测试先证明刷新会覆盖输入／辅助状态、保存缺少活动 GET、同帧重复 POST，以及跨账号／活动的迟到响应风险。HTTP 请求预期直接写字面量，例如：

  ```ts
  assert.deepEqual(writes, [{ method: "POST", path: "/api/events/event%3A1/registration",
    body: { answers: { targetAttendees: "Local answer" }, questionSetHash: "a".repeat(64), questionSetVersion: 1 } }]);
  assert.deepEqual(readsAfterSave.sort(), ["/api/events/event%3A1/registration", "/api/events/public/event%3A1"]);
  ```

- [x] 纯函数先红后绿：答案改变不改变问卷键，hash／version／问题内容改变会改变；回执缺身份、错误账号／活动／状态均 false。
- [x] 最小实现：首次成功读取初始化；同问卷只在没有未提交修改时接收服务端答案，刷新不清辅助问题、回答、transcript 或 persona；作用域失效清屏并撤销请求。
- [x] 问卷变更用例先红后绿：保留旧问题／答案并停用依赖它的 POST；确认取消不改变草稿；显式丢弃后载入最新题集；旧确认跨编辑／身份／更新不生效。
- [x] 保存和辅助生成的请求冻结当前输入；同步锁防重复，迟到结果不覆盖较新草稿或新作用域。有效保存／取消回执后仅触发 GET 回读两个资源，失败不冒充成功，不自动再次写入。
- [x] 执行新交互／view-model、原 88 项、typecheck、6 项契约同步、完整 npm test；只声明实际检查范围。自审后 staged detect_changes，提交 `fix(app): preserve registration drafts across refreshes`。
- [ ] 原生只读验证可用问卷及普通输入；若没有合适样本或将触发未知 provider，保留未验，不绕过服务端创建假报名。完整 R-04 保持开放直至所有关闭条件具备证据。

## 执行证据（2026-09-13）

- 根索引刷新成功，254.4 秒，390492 节点／559418 边／300 流程。Screen、刷新、答案输入和四个 POST handler 为 LOW；RegistrationForm／AdaptiveRegistrationCard 各一个直接上层调用者，关联六条资源流程；adaptiveBody 两个直接调用者。新增 helper、内嵌测试 fixture 不在图中，记 UNKNOWN。阅读 Screen→useApiResource→快照不可用处理流程后再编辑。
- 首轮交互红测 16 项中 15 失败、1 通过（8.991 秒）；纯 helper 最小桩下 2 项按预期失败。实现后的交互剩余失败定位为旧辅助流程重复添加基础答案，保留 extra turns 后 27/27（7.103 秒）。
- 自审追加红测捕获“载入新问卷后旧服务端答案重新出现”和“旧回调提交旧草稿”，另四项保护已通过。修复后交互、view-model 和既有接线共 32/32、9.800 秒、exit 0；原事件回归 79/79、69.518 秒；契约同步 6/6、0.377 秒。先前辅助测试因等待表单不足及错误等待未完成 POST 而失败／挂起，修正测试等待后重新取得有效红绿证据，不把工具错误当产品缺陷。
- 首次全量 2304 项中 2300 通过、4 失败，194.802 秒、exit 1，均在旧 `app-wide-events` fixture。该替身缺少 ready、账号 ID、HTTP status，并每轮创建客户端，与真实 provider 不符。仅修测试边界，报名场景明确登录，其他访客场景不变；原断言与 3000ms 阈值保留，单文件 29/29、12.530 秒、exit 0。完整复跑结果另记。
- 14:37–14:38 原生只读入口：公开详情 GET 200，但旧私有详情 GET 404、问卷 GET 500（无 Content-Type），未显示表单。没有提交报名、取消或辅助生成，费用账本仍 5 次调用、12780 microUSD；普通输入、原生确认和真实业务回读未通过。分层记录及下一步见连通性记录第十二节。

本地日志（不提交原始日志）：`/tmp/orbit-r04-registration-red-20260913.log`、`/tmp/orbit-r04-registration-green-final-20260913.log`、`/tmp/orbit-r04-registration-review-red-valid-20260913.log`、`/tmp/orbit-r04-registration-review-green-20260913.log`、`/tmp/orbit-r04-registration-events-regression-20260913.log`、`/tmp/orbit-r04-registration-full-20260913.log`、`/tmp/orbit-r04-app-wide-events-corrected-20260913.log`。

最终全量复跑 **2304/2304，0 失败／取消／跳过，180.165 秒、exit 0**；类型复跑 exit 0。日志 `/tmp/orbit-r04-registration-full-corrected-20260913.log`、`/tmp/orbit-r04-registration-types-corrected-20260913.log`。本地源码与受控验证子项可提交；上方原生验收继续未勾选。

提交检查纠正：同名 `orbit` 实际选中旧工作树，先前无变更结果不采用。指定 `/Users/xzhao/Projects/orbit` 重新分析后为 HIGH、六条报名读取流程，已告知并逐条阅读；既有十个改动函数 upstream 重核仍 LOW。AST 对照确认 PersonaPreview、RegistrationQuestion、useStyles 未改，新 helper 无图节点，未称零风险。后续全部 GitNexus 调用固定使用绝对仓库路径。

### 后续独立修复：公开活动详情

草稿子功能已提交 `a0dff6171`。在同一 R-04 读取边界内，只将 Screen 的详情 GET 改用现有 `publicEventDetailPath`，沿用原公开 DTO 和报名权限；不回退旧私有接口，不替代问卷。根索引刷新 257.6 秒、exit 0；指定绝对仓库路径检查 Screen、fixture 和测试 open/reply，风险 LOW（Screen 无已识别直接调用者，测试 helper 仅本文件）。

基线 32/32（10.923 秒）。有效红测 5 失败／1 通过，均捕获初次或保存／取消回读走旧路径；错误页用例先误找服务端英文原文，修正为实际错误区后重新取得路径红测，不改生产文案。两行生产修复后 35/35（10.454 秒）、类型 exit 0；全量 2307/2307、0 失败／取消／跳过、177.053 秒、exit 0。完整回归包含六项同步检查。日志 `/tmp/orbit-r04-public-detail-red-valid-20260913.log`、`/tmp/orbit-r04-public-detail-green-20260913.log`、`/tmp/orbit-r04-public-detail-types-20260913.log`、`/tmp/orbit-r04-public-detail-full-20260913.log`。

原生公开 GET 200、旧私有 GET 不再出现；问卷仍 500，页面却显示已有问卷，故不算新鲜读取成功。后续单独补过期数据／提交边界，完整 R-04 仍开放；证据见连通性记录 12.3。

### 后续独立修复：联网读取与旧草稿分离

公开详情修复已提交 `fdbc78928`。此次沿用既有 R-04 的错误可见与草稿保护要求，为 `useApiResource` 增加可选 `cachePolicy: "network-only"`，仅报名问卷启用。默认内容页缓存策略不变；不删除旧快照，不新增验证 GET。报名读取及刷新必须得到本次网络结果；等待和失败期间保留本页草稿，但停用报名、取消和辅助生成，提供手动重新读取入口。刷新同帧撤销旧写回调资格，读取新版本仍沿用原显式确认逻辑。

- [x] 根索引刷新 262.0 秒、exit 0；绝对仓库路径检查共享钩子 upstream 为 CRITICAL，47 个直接依赖、8 组上层入口，编辑前告知风险。Screen／Form／refresh 为 LOW；内嵌测试函数未收录，记 UNKNOWN。`load` 的 C++ `getCacheSize` 边实为同名 atomic load，核对源码后排除跨语言假关联。
- [x] 原定向基线 38/38、11.419 秒。新增真实 hook／路由测试首轮 34 项中 7 失败、27 通过，15.947 秒，捕获旧缓存假成功、刷新保留成功态及同帧旧回调 POST。
- [x] 最小实现后定向 46 项中 42 通过、4 失败，全部为旧测试假定并行 GET 顺序。按每轮路径、参数和准确次数断言，不改网络实现或放宽错误保护；复跑 **46/46、11.900 秒、exit 0**，类型 exit 0。涵盖 JSON 500、非 JSON 500、断网、初始旧快照、手动恢复、草稿保留及默认缓存兼容。
- [x] 15:09 同一 Simulator 原生复验：公开 GET 200，问卷 GET 500 无 Content-Type，页面明确显示错误及 370×49 重读入口，没有 TextArea、报名提交或辅助入口；未重试、清缓存或进行业务写入。费用仍 5 次、12780 microUSD。本项只证明失败呈现，原生有效问卷和业务闭环继续未验。
- [x] 全量 **2315/2315、0 失败／取消／跳过、182.977 秒、exit 0**，包含契约／Schema／字典同步检查。提交前检测仍为 CRITICAL，但改动仅限共享可选策略、报名页和对应测试／记录；完整 R-04 不关闭。

日志：`/tmp/orbit-r04-registration-freshness-baseline-20260913.log`、`/tmp/orbit-r04-registration-freshness-red-20260913.log`、`/tmp/orbit-r04-registration-freshness-green-20260913.log`、`/tmp/orbit-r04-registration-freshness-green-final-20260913.log`、`/tmp/orbit-r04-registration-freshness-types-20260913.log`、`/tmp/orbit-r04-registration-freshness-full-20260913.log`。自审维持单代理，没有独立审查声明；改动检测为 CRITICAL，已逐条阅读返回的 20 条资源读取流程。
