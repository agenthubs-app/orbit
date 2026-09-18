# Sprint 0063 run-01 结束报告（供 ROOT 正式收口）

## 结果

个人日程可以直接点选日期和时间，不必输入 YYYY-MM-DD 或 HH:mm。日期行打开七列月历，可切换年月、选择今天／明天；开始与结束时间打开24小时制小时／分钟选择器，保留09:37这类任意分钟值。弹层确认才更新草稿，取消不改原值，页面保存才写服务。

30分钟／1小时／2小时与全天快捷操作保留。首次完整新建开始时间且结束为空时补30分钟；已有记录改开始时保留有效实际时长，包括秒数，已有无结束仍为空。清除结束后不重新补回；显式选择早结束提示错误，不静默移到次日。全天界面结束日期是最后占用日，服务契约仍为下一当地日零点排他结束。重复截止日复用月历，并能清空。

功能已正常提交、精确合入 Main、推送并独立核对远端。Main新生产Web和原生实际完成同账号双向保存／回读，Phone独立账号在私有预览完成两浏览器真实保存，固定公网产物已通过两浏览器只读验收。共享全量集成仍有既有失败，不能写成全绿。正式报告及台账文档的独立gate、正常提交、最终Main文档推送和远端核对由ROOT继续收口；本报告不预填自身提交SHA，也不宣布整个Orbit项目完成。

## 固定输入、版本与文件边界

唯一执行为run-01，执行标签phoneweb-0063-date-time-picker，既有B任务01a0a879-e8fe-77e3-b748-bd78005aecc8，GPT-5.6 Sol medium，唯一Generator。没有Reviewer、Evaluator、第二Generator或新run。设计批准沿用用户“没问题按这个设计走，开始实现。”冻结Planner SHA256：`89822f57996134f77a4ea6ba64bc96708c7d05451f4ccd83d4a31c45c495176c`。原五项SC未更改。

- BASE：`b16b49d87a27415bd561df61b11cecd7df46ed3f`。
- 分支：`codex/sprint-0063-date-time-picker`。
- 功能commit：`649994fe713fa88662db5dbd11ec8c6e6b9490eb`。
- 功能TREE：`f099ba7293c3fb0502e65af2bbd587b13a20eb86`。
- ROOT无冲突no-ff合入Main：`26f74a55c7f9458788bf59625a8a6dede6892756`。
- Main普通push句柄21614 actualexit0；独立ls-remote核对远端chat-agent精确同Main26 SHA。
- 22文件，851行新增／60行删除。功能提交后工作树干净，产品源码和测试锁已冻结释放。
- Phone固定consumer：`6d1c771aee07f9a704863f11c3548354aea0b4d5`；TREE：`6ed9ac4341077856db4eb1269d28ffd2374f0016`。Phone精确消费，不泛合Main祖先，保留本端私有政策和既有字典。

完整实际产品／测试manifest：

```text
repos/orbit-app/src/i18n/en.ts
repos/orbit-app/src/i18n/ja.ts
repos/orbit-app/src/i18n/messages.ts
repos/orbit-app/src/i18n/zh.ts
repos/orbit-app/src/screens/schedule/PersonalScheduleDateTimePicker.tsx
repos/orbit-app/src/screens/schedule/PersonalScheduleRules.tsx
repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx
repos/orbit-app/src/screens/schedule/PersonalScheduleTimeBlock.tsx
repos/orbit-app/src/view-models/personal-schedule-editor.ts
repos/orbit-app/src/view-models/personal-schedule-picker.ts
repos/orbit-app/tests/personal-schedule-interactions.test.tsx
repos/orbit-app/tests/personal-schedule-picker-interactions.test.tsx
repos/orbit-app/tests/personal-schedule-picker.test.ts
repos/orbits/app/(app)/app/tasks/personal-schedule-date-time-picker.tsx
repos/orbits/app/(app)/app/tasks/personal-schedule-editor-model.ts
repos/orbits/app/(app)/app/tasks/personal-schedule-picker-model.ts
repos/orbits/app/(app)/app/tasks/personal-schedule-rules.tsx
repos/orbits/app/(app)/app/tasks/personal-schedule-workspace.tsx
repos/orbits/tests/pages/personal-schedule-picker-interactions.test.tsx
repos/orbits/tests/pages/personal-schedule-picker.test.ts
repos/orbits/tests/pages/personal-schedule-v3-workspace.test.tsx
repos/orbits/tests/pages/personal-schedule-workspace.test.tsx
```

Next旧workspace测试的必要迁移由ROOT补充批准。App／Next分别使用本端控件和本域模型，没有跨端导入原生组件或新同步渠道。没有修改共享API/schema、后端service／事务／ACL、pool、通用time、auth／offline政策、通知flags／Push、账户语言、全局主题或外部日历写入。编辑器内部pickerEndInstant只保留派生结束的实际秒数，不进入API字段。

## 风险与官方范围检查

修改符号前使用精确ROOT路径的upstream impact。App personalScheduleDraft为HIGH，8直接调用方／0索引流程，已事先告知用户和ROOT。TimeBlock LOW1、Rules LOW2、Editor LOW1、builder LOW3、duration LOW3。selectedDurations精确Function UID为LOW0映射，但源码实际在TimeBlock执行，零映射不代表零风险。

Next draft LOW4、builder LOW2、Editor／Rules／duration各LOW1。新日期时间组件和picker helper为UNKNOWN，按TimeBlock／Rules／Editor真实源码调用补查，没有把未索引当无影响。原HIGH／UNKNOWN保留。

ROOT官方精确BASE..最终TREE detect_changes gate实际返回22files／70mapped symbols／0flows／LOW，原结果保存为s63_final_feature_gate，无异域paths或stale警告。ROOT独立cachedcheck actualexit0、write-tree精确f099后授权普通路径限定commit。此前eacf候选gate保留历史；最终仅去除新Webfixture空白行尾随空格，产品语义和断言未变，ROOT重新对f099取得正式gate，没有为纯空白变化重跑完整测试／types。gate LOW不抹去编辑前HIGH或新符号UNKNOWN。

## 本线验证与原始失败

本线只运行隔离纯模型和受控HTTP／浏览器fixture，不运行真实数据库、服务、Simulator、构建、发布、共享I或provider。测试固定既有Node22.23.2：

```text
/Volumes/ORICO/Dev/cache/npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node
```

命令环境为env -i PATH=/usr/bin:/bin、TMPDIR=/Volumes/ORICO/Dev/phoneweb-pw0011-validation，NODE_OPTIONS加载既有zero-outbound-preload.mjs和protected-runtime-preload.mjs。完整定向命令为该Node执行`--test --test-concurrency=1 --import tsx`加下列完整文件；不是test-name筛选结果。Next只通过ORBIT_PICKER_QA_CHROME复用已安装chromium_headless_shell-1228，未安装／下载浏览器。

| 验证 | 实际结果 |
| --- | --- |
| App八文件完整定向，72214 | actualexit0，119/119 pass，fail0／skip0／cancel0，66441.469375ms，双guards denied0 |
| Next七文件完整定向，98964 | actualexit0，71/71 pass，fail0／skip0／cancel0，4977.340625ms，双guards denied0 |
| App完整端types，11441 | `node node_modules/typescript/bin/tsc --noEmit`，actualexit0，双guards denied0 |
| Next完整端types，91345 | `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json`，actualexit0，双guards denied0 |
| staged／提交后检查 | cachedcheck0；功能HEAD／TREE精确；提交后git status --short为空、git diff HEAD --check0 |

App完整八文件，在repos/orbit-app cwd：

```text
tests/personal-schedule-editor.test.ts
tests/personal-schedule-duration.test.ts
tests/personal-schedule-rules.test.ts
tests/personal-schedule-detail-view-model.test.ts
tests/personal-schedule-association-policy.test.ts
tests/personal-schedule-picker.test.ts
tests/personal-schedule-picker-interactions.test.tsx
tests/personal-schedule-interactions.test.tsx
```

Next完整七文件，在repos/orbits cwd：

```text
tests/pages/personal-schedule-workspace.test.tsx
tests/pages/personal-schedule-v3-workspace.test.tsx
tests/pages/personal-schedule-picker.test.ts
tests/pages/personal-schedule-picker-interactions.test.tsx
tests/pages/personal-schedule-v3-client.test.ts
tests/pages/personal-schedule-page-account-scope.test.ts
tests/api/personal-schedule-representation.test.ts
```

覆盖空开始候选取消不写草稿、指定日程时区今天／明天、09:37不取整、23:45默认跨天、已有分秒实际时长保留、已有无结束不补、清除默认结束不再补、显式早结束拒绝、2028闰日／2027无闰日／跨月跨年、全天最后占用日和排他结束映射、重复until清空／早于开始拒绝、纽约gap／fold拒绝。实际控件测试覆盖保存禁用、旧actor回调隔离、44px目标、焦点约束／返回和中英日小时分钟标签。原scope、CAS、幂等、ACK后独立GET、metadata、associations及布局断言均保留。

原失败没有被最终GREEN覆盖：

- 第一次完整App38230 actualexit1，118/119，备注y807被保存栏遮挡。repair1合并开始／结束日期到原行并将清除放原底行；原断言仍失败于y730。repair2仅减卡片上下间距各4px，原12px安全间隔断言通过；无第三repair或降低断言。
- 第一次完整Next2644 actualexit1，70/71，保存禁用焦点控件后Escape未到dialog。一次document键盘订阅及cleanup修复，原失败用例和最终完整集通过。
- 原App types61856 actualexit2：RN accessibilityRole不支持dialog类型，以及missing-end fixture在exactOptionalPropertyTypes下显式赋undefined。使用支持的role属性和真正省略可选字段修复，没有修改契约；原Next types53176 actualexit0。
- 原98317 actualexit1，实际29m18s被分钟字段误标为30分钟；改为实际instant比较后2965 actualexit0、1/1。
- Web新建开始用例原exit1缺少清除结束按钮，限定补本端clear／删除内部instant后1/1。
- 两端无效时区shortcut原exit1 RangeError，先校验时区返回invalid后分别1/1。
- 初始all-day映射、旧真实空日期／时间入口、默认结束和until控件均有有效旧实现因果RED，不以导入不存在模块制造失败。patch context的no-op失败、Next缺浏览器路径的环境失败和cached whitespace失败保留于ignored checkpoint／error记录，未删除用户工作。

最终15文件完整结果和types在相同产品blob上复用于Main，不因无关文档或纯空白变化重跑。fixture截图不充当真实actor运行证据。全部本线最终test／types句柄已关闭。

## ROOT 唯一 Main 全量 I（并非全绿）

ROOT在Main26以原Node22和双guard仅执行一次受影响两端I，句柄61431，Web再App串行：

| 端 | 实际终态 |
| --- | --- |
| Web | actualexit1，3826 tests／3561 pass／59 fail／206 skip，143316.10175ms；2026-09-17T01:45:54.743Z至01:48:18.206Z |
| App | actualexit1，3273 tests／3272 pass／1 fail／0 skip，927747.172042ms；2026-09-17T01:48:18.206Z至02:03:45.992Z |

ROOT完整Web failure NAME集与0061／0062旧59精确相同，无新增／移除。zero-outbound denied4、protected0原样保留，不能写成全部guard0。App唯一失败是既有58-route视觉快照，全部nonzeroGuards[]。对A0060旧15 NAME无新增／移除14；此前局部fixture修复不全部归功本picker。没有重跑I求全绿。

Main App I可能写到原六B截图路径，ROOT先按原bytes／mtime／SHA冻结六图、用精确symlink隔离Main新输出到自己的main-App-I-fixture-images，结束后normal restore actualexit0、逐SHA确认原六B恢复。source及测试断言未改，原B图、Main I新fixture图和真实运行图分开。

## Main 新产物与同账号双向真实证据

以下是ROOT主动交付的实际结果，本线没有自行操作真实数据／设备。

Main26 production build actualexit0，BUILD `taZi5Ng0EztLjlmYGnGbA`，Next PID36058／3000健康。Native xcodebuild70915显示BUILD SUCCEEDED、exit0，install／launch63984 actualexit0。lsof实际确认Orbit PID37204与主Metro69917／8082建立四条TCP连接，不仅引用构建参数。

真实Web12396月历临时选择20日后Cancel，无业务写入。原获准QA系列通过真实时间控件15→37，正常保存09:37→10:07、30分钟；独立GET保留原reminder／recurrence／note／contact，18日取消实例仍404。新Native详情实际读到37／10:07。

Native正常whole-series流程先转base identity，再明确选择scope。时间弹层HH09和mm37 checked；右分钟列五次安全可视滑动到15 checked，Done后正常headerSave。实际显示“个人日程已保存”，详情09:15／09:45。ROOT的native-minute37.png和native-restored-detail15.png为真实设备图，不是fixture。

after-native95738 actualexit0，UTC2026-09-17T02:14:43.160Z。正式独立GET确认原QA恢复00:15Z→00:45Z（Tokyo09:15／09:45），同id／actor／title／zone／createdAt／reminder／recurrence／note／contact保持，18日仍404。真实Web重开picker mm15初始checked，Escape无业务写入；月历20日Cancel保持草稿。两个刻意阻挡的inbox badge GET排除于验收。

该after-native首次管理launch缺ORBIT_QA_BUDGET_LEDGER，在preload启动阶段BUDGET_LEDGER_INVALID，业务未启动、无auth／writes。给原绝对账本路径后同ledger成功，独立hash前缀493f保持。保留启动失败，不当成产品bug。

Native额外月历临时20日→Cancel，底层仍9月17日09:15／09:45，两张ROOT真实图已目检。ClearEnd只改草稿，结束日期／时间空；现有dirtyExit明确丢弃未保存，最终fresh AX实际回详情09:15／09:45。只是草稿边界证据，没有把未保存动作计为服务write。

原生dev仍有既有NotificationDeliverySettings→RelationshipInboxScreen→NotificationDeliverySettings require cycle和提醒交接重试warning。ROOT从实际Metro69917日志核对，相关两源文件b16..26 diff为空，本picker未改；未出现picker warning。不移除旧warning，不称整个App无warning。

## Phone 独立账号私有保存、固定公网与回退

Phone使用自己的actor／数据库，不能冒称与Main同账号。精确consumer6d1c771及TREE6ed9ac已给全文于版本节。必要定向37/37、两types actualexit0；private构建actualexit0，BUILD `IemxmhFeX5ZE1DvJDjF5x`，entry raw SHA256：

```text
05b38715858bc27be6e6cf2b3c843288300c55a74bca034ab016c2ad97f4c200
```

### 私有预览真实写入

ROOT完整读取parent真实receipt，实际目检Chromium月历10/17、HH09／mm37和WebKit持久化13:37／14:07图。两browser对各自精确新QA通过实际UI创建201，同cookie前后端GET哈希一致，重开editor正确。各只对本次返回ID删除200→独立GET404／listabsence，原7ab52记录、偏好和ledger493f不变。每engine blockedwrites／external／pageerrors[]；各两个刻意阻挡的inboxGET不作通知验收。verifiedauth2，另保留最初selector失败1，不混计成功。

最初helper误用unnamed RNWeb outer dialog，同时匹配背景与inner取消，strictmode fail／creates0；父线仅修named inner selector一次，没有改变产品／fence／guard或把helper缺陷归产品。

### 固定 PUBLIC 最终验收

ROOT批准固定artifact的owned whole-supervisor normal切换。最后一次切换22582 actualexit0，UTC2026-09-17T02:30:16.513Z。PUBLIC supervisor43205／backend43206／frontend43207健康、零重启；source／TREE／BUILD／entry SHA与上列冻结consumer一致，既有ngrok域名未改，entry32fa served rawSHA精确05b387。

最终PUBLIC helper52919 actualexit0，Chromium和WebKit均实际经过VisitSite／login／home，primary zh actor，calendar select／Cancel保草稿，HH09／mm37 Done及自动10:07，health200、served entry同SHA。原7ab52、偏好hash及原ledger493f不变。各blockedexternal／writes／pageerrors[]；每engine15次实际ngrok static GET单列，各两个inbox badge GET刻意excluded。

PUBLIC实际authPOST2／modelEvents0／business0。只读选择器不发新建业务写入，HTTP observer110条不能算110次业务操作，也不能把PUBLIC登录再当私有两次新建重算。

ROOT完整核读最终receipt：

```text
publication-receipt SHA256 83204c4950549218d2a5364c8395c1a538e11d2aa36b0e3575cb9939bff59c42
public-ui1789612223485 receipt SHA256 2c47d04ac01044a524be5861ead02456a85eb33f32824ceff7347fe2d8e6c9ec
```

ROOT实际目检公共Chromium calendar和WebKit time正确。private preview经normal IPC实际退出，64004 actualexit0，32400／32410无监听，PUBLIC43205／43206／43207仍健康。

### 保留首验失败及实际回退

前两次PUBLIC真实browser helper在ngrok首访、auth前失败，auth0／writes0。严格外域fence未放行必要静态error.js／css／font；没有证据称App／backend损坏。原失败完整保留。

父线两次normalrollback旧0060均actualexit0，旧artifact／source／launcher保留，健康200及原entry恢复；一次旧进程40744／40745／40746实际健康。因此回退确实可执行。针对当前43205／43206／43207的rollback-attempt03仅准备、未运行，不虚构第三次已回退。

helper最多两次因果repair。先仅放十个已观察ngrok静态host+path GET和VisitSite／login readiness；最后repair2补齐read-only静态closure18项（原10＋二级compiled2＋global.js＋5fonts），firstdoc42007 actualexit0，最后helper SHA256 `6dfee9ab3f1928fb805cd4af7432f4c078fbfc2f5b3abbb0aa31f58fcc0d421d`。不是第三repair，不改product／API／provider／budgetguard，不新build或QAwrite。最后再正常切换同一artifact并通过上述52919，失败历史不被成功覆盖。

## 五项 SC 与技术证据对应

| SC | 状态及主要证据 |
| --- | --- |
| 63-01 | 满足：TimeBlock／Rules及两端新组件直开月历／小时分钟；有效控件RED→GREEN、完整119／71，Main真实Web和Native、Phone390 Chromium／WebKit实际操作，无需手输数字 |
| 63-02 | 满足：任意分钟回显、确认／取消／禁用及旧actor回调、44px和焦点／键盘、中英日必要标签完整测试；Native37／15 checked、calendar Cancel／clear草稿丢弃；Phone private及PUBLIC两browser实际选取／取消／重开 |
| 63-03 | 满足：两端本域映射、原editor／duration／rules完整文件覆盖默认30／实际分秒时长保留／缺结束不补／跨天／闰日年月／全天inclusive→exclusive／until和DST拒绝；实际Main和Phone30分钟保存正确。不冒称真实设备保存过所有DST反例 |
| 63-04 | 满足：同一Main获准QA Web37→Native读37→Native保存15→Web独立GET及picker15闭环；字段／关联／取消实例保持。Phone独立QA域两browser真实201保存／正式GET／重开及精确删除，不冒称与Main同actor |
| 63-05 | 产品和运行部分已满足：649994fe功能、Main26合入及push／远端同SHA、官方固定TREE gate、必要types和唯一I实际结果、新Main产物／Native启动、Phone固定消费／preview／PUBLIC entry-health两browser及实际旧版rollback均有证据。正式中文REPORT／台账文档的独立gate、普通commit、最终Main文档push／远端核验由ROOT随后执行；未预填报告SHA或整项completed |

原功能及报告提交不等于全项目需求完成。未完成的剩余步骤仅为ROOT正式文档收口，不是要求新产品run；共享既有失败、206skip、出站denied和dev warning仍保留。I无新增失败不等于修复旧失败。

## 费用、版本限制与交接

本线无新增AI／OCR／provider调用，没有重置原累计5美元硬预算、账本或guard。ROOT实际独立核对原ledger hash前缀493f保持；Phone PUBLIC modelEvents0，未新增provider业务。总费用数值本线未独立读取，不虚构余额／总额，仍由原ROOT唯一账本管理。

本报告区分本地production Web、iOS Simulator实际运行、Phone私有预览和固定公网浏览器，不声称实体手机发布／App Store验收。实际到期通知、远程Push、inbox派生刷新、全域offline不在本Sprint验收；被刻意阻挡badge请求不记通过。Main与Phone不同actor／数据库明确分开。

如需产品回退，由ROOT对精确功能提交正常revert并重新验证产物；Phone旧0060artifact／source／launcher保留，实际normalrollback已证明。不得hard reset、扩大连接池、删除原真实QA或清空其他账户数据。

源码／测试继续冻结。功能分支干净，无本线未结束test／types／构建／真实QA句柄，无未提交产品改动。B已交完整manifest、精确HEAD／TREE、官方gate和真实结果，所有产品锁释放。此文本仅放唯一run01 ignored证据目录，不直接写ROOT全局README／Bridge或正式REPORT。ROOT按准确事实落正式报告，独立文档范围gate、普通提交及最终push／远端核对，不预填自引用SHA。

本线唯一run-01的实现、必要本地验证、真实证据整理及最终文本交接结束。不再重开Generator或仅为求全绿重跑全量。整项Sprint正式completed仍取决于ROOT完成63-05最后文档闭环；本结尾不宣布整个Orbit项目完成。
