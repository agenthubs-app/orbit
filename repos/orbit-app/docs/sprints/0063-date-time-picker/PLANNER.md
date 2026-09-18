# Sprint 0063 — 个人日程月历与时间选择实施契约

## 需求、批准与进入条件

原需求：用户在PhoneWeb新建个人日程时不希望手填日期时间数字，要求直接弹出日历，参考成熟产品并新建Sprint。具体设计见DESIGN.md；用户已明确批准“没问题按这个设计走，开始实现。”该批准跨协调／执行交接有效，不重问设计。

ROOT已保留编号0063。当前Phone发布版本b3562f4de8936d783cda097e1a30e1e3554208c7只作现状参考，禁止在旧Phone树生成需要合回主线的实现。实施输入为ROOT完成0061／0062组合及必要验收后释放的精确chat-agent SHA；ROOT发出该SHA、确认原B0061报告结束和本Sprint文件锁后，唯一Generator新建Sprint工作树，登记实际基线和本Planner SHA256，领取唯一run-01。接到释放前继续只读／测试设计，不创建第二产品run。

执行者：ROOT协调的一个空闲Generator，默认GPT-5.6 Sol / medium；执行标签使用phoneweb-前缀。若复用ROOT既有B任务，由ROOT确认执行标签、模型与文件归属，主Phone协调任务不擅自派已持有其他run的线。无Reviewer、Evaluator、第二Generator或付费模型管线。

遵守repos/orbit-app/docs/sprints/RULES.md，含读规则／前序0061、0062报告、符号upstream impact、TDD和必要验证。无需调用已卸载brainstorming／executing-plans。Main索引由ROOT独占；stale警告暂停依赖graph动作并交ROOT刷新，独立源码事实继续调查。

## 实现目标与规则

- 日期点开共享月历底部弹层：年月导航、七列日期、今日标记、选中标记、今天／明天快捷项；跨月和跨年日期按公历算，不用固定30天。显示月份导航不改变当前选中日期。
- 开始／结束时间各自可点击，打开24小时小时／分钟选择器，分钟精度为1分钟；保留已有09:37等值。不强迫手打数字，不为简化控件把既有分钟取整。
- 弹层有独立暂存值，确认才更新编辑草稿；取消、遮罩、返回键不修改草稿。禁用／保存中不可提交选择；切actor／来源／记录或卸载后不能回灌旧弹层状态。弹层焦点进入、约束和回到触发字段按Web／原生能力实现，键盘和屏幕阅读器可选。
- 空开始值时展示日程时区当前月／合理当前时间作为候选，未确认不写入。用户首次确认完整新建开始日期时间后，未设置结束则补30分钟。已有记录改开始时保持已知有效的实际时长；已有无结束仍无结束。显式改结束不静默改到次日；早于开始提示并允许继续修正。
- 30／60／120分钟与全天原快捷操作保留。开始变更后跨天结束日期明确展示。全天不显示时分，界面结束日期为最后占用日，映射至原契约下一日零点排他结束；单日与多日编辑回显一致。
- 重复until复用月历入口，可清空表示不设结束；开始日期约束、scope选择、reminder与既有关联不被丢失。原时区／DST不存在或重复时间校验、CAS、幂等、receipt及正式回读继续使用现有实现。

## 文件边界

App主路径（ROOT释放的最新主线）：

- repos/orbit-app/src/screens/schedule/PersonalScheduleTimeBlock.tsx
- repos/orbit-app/src/screens/schedule/PersonalScheduleRules.tsx
- repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx，仅传已有记录／时区信息及点选回调的必要接线
- 新日期／时间弹层组件置于上述schedule目录；新纯选择／日期映射模型置于src/view-models/personal-schedule-picker.ts
- src/view-models/personal-schedule-editor.ts，仅必要草稿映射；src/time/date-time.ts只读复用，修改通用time函数须先单列影响和ROOT协调
- src/i18n/messages.ts、zh.ts、en.ts、ja.ts，仅本Sprint文案
- tests/personal-schedule-picker.test.ts、personal-schedule-picker-interactions.test.tsx（新）；必要受影响原personal-schedule-interactions.test.tsx、personal-schedule-editor.test.ts、personal-schedule-duration.test.ts、personal-schedule-rules.test.ts

Main Next消费者（ROOT确认0061交付后对应实际文件）：

- repos/orbits/app/(app)/app/tasks/personal-schedule-workspace.tsx、personal-schedule-rules.tsx、personal-schedule-editor-model.ts；client.ts只在必要草稿数据接线时修改，不改transport／auth
- 新本目录个人日程日期时间控件／纯本地映射文件；Web需要使用本端React和样式，不跨端导入原生React组件
- tests/pages/personal-schedule-v3-workspace.test.tsx、必要v3-client测试与新增本域日期时间行为测试

上述新组件路径由唯一Generator按既有命名选择并登记，不扩大到其他页面。两端共享交互与规则，分别使用本端控件；不新建共享代码同步渠道、不手改生成契约副本。必要增补文件遵RULES0登记，不重新开设计审批或降SC。

排除：后端个人日程service／事务／ACL、共享API/schema、迁移、连接池、通用auth/offline政策、全局主题、通知flags／cutover／Push、账号语言和外部日历写入。Main不可用旧Phone私有inventory/audit替代原生政策。ROOT独占共享账号／DB／Simulator／生命周期／index／费用账本；Generator只用受控HTTP fixture或隔离纯函数测试，未经窗口不得启动真实QA、生产编译、Expo导出、Metro或公网进程。

## 五项SC及主要验证

| SC | 可观察验收 | 主要证据 |
| --- | --- | --- |
| 63-01 | 日期行直开月历，年月／今天明天／日选择可用；时间直开小时分钟，无需手打 | 实际控件定向RED→GREEN与App／Phone手机尺寸真实操作 |
| 63-02 | 精确分钟回显、确认／取消／禁用／记录切换正确，触摸与键盘可操作 | 组件行为测试，中文／英文／日文必要文案及可访问性检查 |
| 63-03 | 时长默认／保留、跨天、闰日跨月跨年、全天最后占用日映射、until和DST拒绝正确 | 纯模型边界测试及实际相关原日期时间／编辑器／规则完整文件回归 |
| 63-04 | 同一获准测试对象点选→正式保存→独立GET→详情／重开编辑一致；App与Web同账号同库互读 | ROOT唯一QA窗口，Main Web→App及App→Web的实际记录；Phone真实保存／读取同Phone QA域不能冒称与Main同actor |
| 63-05 | 精确Sprint功能／报告提交并Main合入验证；Phone冻结消费／预览后固定公网加载新版本且可回退 | 官方BASE..TREE gate、相关types及适用I、实际构建／entry SHA／健康与公网正向证据 |

## 验证与执行顺序

首批行为用例明确为：空新建日期行点击出现月历而非文本框；选日期后取消草稿仍空；今天／明天按指定时区取值；09:37回显为09与37且取消不取整；确认23:45的新开始默认结束次日00:15；已有30分钟改开始保30分钟、已有无结束仍无结束；2028-02-29可选、2027-02-29不存在；12月至次年1月导航；全天9月17日至最后占用19日提交结束20日零点，重开仍显示19日；until清空／早于start拒绝；纽约2026-03-08 02:30和2026-11-01 01:30仍不能保存。原无关编辑保存保留秒数／元数据断言继续有效，已有HTTP fixture的版本header／CAS／单次范围保护不能删。

现有react-native-web Modal实际包含FocusTrap与Escape→onRequestClose，可复用；仍须测试当前控件打开／关闭焦点及取消草稿行为，不能从依赖源码直接认定SC63-02通过。现有ScheduleScreen已经有月历网格样式可参考，但其业务数据读取和历史日期函数只读，不抽取或改整页以扩大文件锁。

1. ROOT释放后核对精确HEAD、branch、status、Planner哈希／文件锁与当前依赖；只新建唯一Sprint工作树，不覆盖原Root用户改动／旧Phone草案。新Planner开始前哈希冻结，报告不能预写。
2. 每个实际待改符号先upstream impact。HIGH／CRITICAL先告警；新符号UNKNOWN用真实caller/source补查，不把未索引当零风险。只有UI／本域新纯映射时按L；若通用time基础设施或保存语义变化影响升H，按实际影响记档并触发最终受影响端I，不能靠命名降低风险。
3. 最小行为RED来自真实旧控件或真实草稿语义，不能仅导入不存在模块制造失败。月历算法新模型可先以用例驱动，但不写implementation先求绿。测试断言可观察的日期／草稿／正式请求，不重复实现同算法或只搜源码字符串。
4. 一条Generator连续实现两消费者及字典。操作链收口运行修改测试完整文件、实际直接消费者和相关端types各一次。没有后端／契约源修改则不重后端服务旧42/98集或sync。H/I按RULES5在冻结最终组合源码上由ROOT安排一次，不逐功能全量。
5. 原interactions测试硬编码旧0060截图输出：必要修改测试时将这些当前运行输出定位本Sprint ignored证据目录／受控临时目录，保留原断言与历史证据；不得覆盖旧A六图或把fixture截图充当真实actor截图。新真实Phone预览和公开图独立private release路径。
6. 官方gitnexus gate由ROOT对精确BASE..TREE进行。仅暂存明确白名单，功能提交标明实际集成状态；释放文件锁，等ROOT实际合入／测试／运行结果再编真实中文REPORT并独立报告提交。ROOT普通push后核对远端SHA，不能仅工作树代码算交付。
7. Main/App真实验收与Phone固定消费分别使用各自已识别actor／数据库及构建版本。Phone不泛合Main祖先：按固定版本精确消费相关产品blob，字典增量保持Phone既有内容，原私有policy保持；若正式需要合并产品差量，先impact／定向验证，ROOT统一release窗口。
8. Phone build/export串行、冻结Node22、原budgetguard／原账本保持；API env omitted、缓存清理且编译同源provider核对；先独立preview→真实手机UI→ROOT放行→owned whole-supervisor发布→固定域名实际entry/hash/health，保留0060 rollback。不能以build通过替代UI和正式保存。

## 证据、失败与交接

证据放唯一Generator树ignored build/harness-state/evidence/sprint-0063/run-01；日志脱敏，不含Cookie/token／密码／连接串／个人正文。已有零外呼及protected-runtime测试guard保持。真实窗口维持原累计5美元ledger，不重置／替换；本Sprint选择器不需要AI／OCR／provider调用。

同一非预期失败最多两本地修复，每次仅重失败和最小受影响集；保原RED、fail／skip／denied及句柄，不另开run求绿。遇具体依赖只暂停对应步骤并继续独立已授权工作；没有真实QA或发布窗口时明确这些SC未完成。

交接至少给正式基线／Planner哈希／唯一run／完整路径manifest、功能SHA和报告SHA、tree／clean状态、实际命令退出码与失败保留、另一端影响、未完成SC及具体窗口依赖。ROOT负责全局README和Bridge台账；本任务不直接编辑Root台账、合Main、启动第二Generator或改通知配置。
