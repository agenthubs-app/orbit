# Sprint 0061：独立 Next 个人日程 v3 对齐

状态：本线唯一 run-01 已结束，功能源码与本功能运行时验收已通过并交付 ROOT。本地必要检查通过，ROOT 已完成真实规则保存、关联摘要窗及同一 QA 的 Web→原生→Web 双向回读。共享全量仍有原基线失败。报告提交、普通 push与独立远端核对由 ROOT 真实收口；本稿不提前标记 Sprint completed，也不宣称整个项目已完成。

## 用户现在能做什么

独立 `/app/tasks/personal` 已消费现有 v3。编辑器支持七种提醒、四种重复和可选结束日期；详情显示保存值，不再提示“提醒和重复暂不支持”。清除规则提交 null，省略字段保留原值。ACK 后必须独立 GET 校验完整草稿、嵌套规则、账号、稳定身份和版本，确认一致才显示保存成功。

列表按当地日历日期给出有界 from/to，打开稳定的重复实例。编辑或删除重复日程需明确选择“仅本次”或“整个系列”；整个系列独立读取 base ID。未保存草稿不能在切换范围时悄悄丢失，仅本次不提交继承规则。删除不能只依赖 ACK，还要独立精确 GET 返回 404。

笔记和人脉按钮打开可关闭底部窗。空搜索词也读取摘要，支持搜索、分页、重试与已选状态。选择前沿原详情接口再次核对身份；关闭或取消不写业务记录，保存才提交关联 ID 数组。已选标题来自核验结果，不用姓名推断授权。

真实到期提醒送达、远程 Push、实体设备和远程部署没有验证。本 Sprint 没有新增通知执行器或修改通知配置，不能由规则 UI 成功推断通知已送达。

## 固定版本与文件归属

- Generator：原 PhoneWeb-B，GPT-5.6 Sol / medium，唯一 run-01。没有新 Generator、Reviewer、Evaluator 或返工 run。
- BASE：`0d5a57f340863d9596afe6f7637c35dcac68f81e`。
- Planner SHA256：`8fea9e4493a06e876522a7b4a6a81a8e1f2136e60a7aeaac590561e40a767063`，执行后复核一致，未改冻结 Planner 或 SC。
- 功能 commit：`12bb54ad0236f6297e1aa02184f49287a4a5018d`；TREE：`d6b66b9456e10d72d3be61b30f14558acecfb5d1`。
- ROOT 无冲突组合主线：`47f12034e356d303f3034a5f58aa9d9d9eb2167b`。相对本功能 TREE 增加 0062 后端四条路径，后端修复归 0062，不计入本线实现。

本功能九条 Web 路径，462 行新增、63 行删除：原 client、editor-model、workspace；新 rules、association-sheet；原 representation 与 workspace 测试；新 v3 client 与 workspace 测试。原有明确 v1/v2 API 兼容用例保留，只调整当前 Web-client 改 v3 导致的请求期待与摘要 fixture。

未改 App、共享 schema、后端服务、ACL、全站 CSS、通知 flag、cutover 或 provider。本线工作树 clean，产品写锁已释放；无活动测试、类型检查或真实服务句柄。证据仅写本 run 的 ignored 目录，没有覆盖 0060 截图。

## SC 与验收范围

| SC | 本地与实际运行证据 | 限制或剩余事项 |
| --- | --- | --- |
| 61-01 规则设置、保存和清除 | 七提醒/四重复控件；草稿保留规则、null 清除、嵌套 ACK+GET、错误账号、409 幂等和晚响应反例；实际页面保存→重开→清除。新生产 Web 同账号真实15→30，原生读到30并保存回15，独立 GET与真实Web页再次读到15，其余字段不变 | 本功能规则验收通过；真实 due/Push 未验，不作送达声明 |
| 61-02 实例与修改范围 | 有界列表、稳定实例身份、未选 scope 零写入、仅本次不写规则、series base 独立 GET、dirty 保留、删除独立确认，秒精度/时区/全天原消费者回归。新生产真实点击19日 QA 实例并选整个系列；原18日取消仍 GET404，其余字段保留 | 本轮没有再次执行真实 Web 本次删除；既有原生取消与新404只证明该取消状态保持，不冒称新删除动作 |
| 61-03 摘要关联底部窗 | 空 q、strict actor/kind、错误账号不显示、查询取消/晚响应隔离、分页/重试、选择前详情授权、关窗零写入和已选标题。新生产两摘要窗空 q 都已有列表，contacts q=ZT 返回佐藤健司，关闭后记录不变、无业务 mutation | QA 刻意阻挡非本功能的 inbox badge GET 两次，明确排除；不能描述该浏览器 guard 为全0 |
| 61-04 集成与交付 | 正常功能 commit、官方固定树 gate、无冲突主线组合合入、唯一共享 Web I、组合 types0、精确生产 build/restart与健康、同QA Web→原生→Web双向回读 | 中文报告正常 commit、主线普通 push与独立远端核对由ROOT收口；未据此提前标记Sprint completed |

## 本地检查与失败历史

初始新 client RED 4/4 失败；扩充17例时8通过、9预期失败。初始 UI/model 三例均 RED。最小实现后这些用例转绿。查询期间授权反例暴露 choosing 状态未随新 generation 清除，先复现 RED，再用一行 reset 修复。已选笔记关窗后的标题断言也先 RED，再修复展示。没有启动第二 run 或超出两次局部 repair 上限。

原消费者首次42项中34通过、8失败：当前客户端版本头一项、有界 collection URL 六项、旧 note-search fixture 一项。因果已查明，未删除原日期、无写入、授权或兼容断言。

最终必要完整集共七个文件：66/66、零跳过，actual exit0，1195.533375ms。最终 Web types 句柄65961 actual exit0，覆盖提交 TREE。首 types13649在最后 JSX 修复前，保留为旧版本结果；ROOT明确允许必要最终复核，不冒称第一次已覆盖最终树。检查使用 Node22和既有 dual preloads，本地 guard denied0/0。本线没有运行全量 Web I 或 App I。

修改前 upstream：client、页面和精确 Web model 均 LOW；request helper MEDIUM，七直接调用、零登记流程。对象方法零 indexed caller、新组件 UNKNOWN，用实际源码确认本页和测试消费者，未当作零风险。ROOT 官方 exact BASE..TREE gate 为九文件、34映射符号、零流程、LOW，原始结果 `s61_feature_gate`；获准后正常提交，commit TREE 与批准 TREE 一致。

## ROOT 共享集成结果

按 Main README 的 RULES5.2/8执行登记，两写者冻结后，ROOT 在精确组合主线只运行一次 Web I，同时支持0061/0062相关SC，不改变冻结计划或完成条件。

共享 Web I39251 actual exit1：3808 tests、3543 pass、59 fail、206 skip、0 cancelled，176985.014416ms；UTC 00:39:38.536→00:42:35.658。ROOT完整解析失败 NAME sets，与前A60 I的59个名称完全相同，无新增、无旧失败消失。组合 types17904 actual exit0，dual guards0。

共享 I 的 Playwright zero-outbound 仍 actual denied4，protected全0。日志末尾 wrapper 的 denied0不覆盖中间 denied4。原59失败/206跳过/denied4历史保留，不能写“全量通过”或“所有 guard0”。B直接读了 raw tail、denied4所在行并核 SHA256：`503034b7238e0f7e1a3a75eb7ba467f52a1ef6039edd5d0c246d126f5ab4f7b9`；失败名称对照归 ROOT 的实际解析，不冒称 B 重跑全量。

## 新生产与同账号真实 QA

以下实际运行结果由 ROOT 提供，B未控制真实账号、服务或 Simulator：

- Main `47f12034e356d303f3034a5f58aa9d9d9eb2167b` production build actual0；BUILD `L8fbGtRZ_QJku0p8citoB`，PID15582，3000 health200。旧PID7579已退出，没有对旧产物验新代码。
- 真实 browser87123 actual0：点击19日QA，v3 detail为提醒15、daily至19；选整个系列时独立读取base；两summary窗空q都有列表；contacts q=ZT返回佐藤健司。关闭窗无业务写入，record unchanged。刻意排除的 inbox badge GET被保护挡2次。
- 真实 Web保存helper9757 actual0：UTC00:47:32，唯一PATCH scope=series，仅 patch.reminderMinutes=30；ACK、独立GET与详情重开均30，其余字段不变。
- 原生仍用既有有效0060安装，API3000/Metro8082，同一小雨账号。实际picker显示30已选；原生UI改回15并保存成功。UTC00:50:10独立GET200，原title/times、daily至19、reminder15、同note/contact保持；18日取消仍404。
- 最后原生→真实Web回读40814 actual exit0，UTC00:50:54.147：sameactor QA19 detail真实显示提醒15、daily至19；base GET、summary、拼音与关闭窗不改变已保存记录。intentional inbox badge GET block2明确excluded，unexpectedBlocked0。新独立图 `after-native15` 未覆盖旧图；原生截图 `native-restored-reminder15` 显示“个人日程已保存”、提前15分钟和每天至19。同一QA双向闭环完成。

管理 helper失败保留：首browser将刻意挡的inbox GET计入unexpected，deepEqual失败；第二probe确认 changedKeys[]、writes[]、blocked仅inbox。因果repair1只精确登记已排除badgeGET，不改产品源码。原保存helper51026误用按钮名“保存日程”超时；按实际源码“保存个人日程”修正selector一次，9757成功。没有产品修复或新一轮 Web I。

ROOT另在0062证明真实PG CAS200+409、原receipt replay与全部字段恢复。该证据只按事务消费者兼容复用，归属0062，不重复实现或归功本线。

## 费用、回退和交接

本线没有真实HTTP、DB、Simulator、provider调用或账本写入。ROOT确认唯一费用ledger493f不变，累计$5硬限额未reset。到期提醒、远程Push仍未验。

回退页面功能由 ROOT 在主线受控 revert 精确功能SHA `12bb54ad0236f6297e1aa02184f49287a4a5018d` 并重建；本线未执行回退，不连带撤销独立0062修复。

ROOT官方组合source `0d5a57f..47f12034` gate实际13文件、40映射符号、零流程、LOW，无意外路径。ROOT已启动Main47产品普通push，独立远端校验尚未给终态，不预填成功。

本稿冻结为最终中文文本并结束本线唯一run-01，交ROOT落入本Sprint目录、官方docsGate、正常报告commit与真实登记。报告SHA、远端SHA和Sprint completed仅由ROOT在相应动作成功后记录。本线不再修改产品、不启动新run或重复集成检查。


## ROOT 最终交付补充（2026-09-17）

上述 Generator 文本保留交接时点，不用后续成功覆盖原失败。产品主线47f12034e356d303f3034a5f58aa9d9d9eb2167b已普通push：句柄28793 actualexit0；独立ls-remote句柄86741 actualexit0，远端chat-agent精确同SHA。正式中文报告与台账文档由ROOT另行正常提交、push并独立核对；最终文档SHA登记于实际Git和ROOT检查点，不在报告内预填自引用SHA。

ROOT新生产Web实际补测：自己的新QA系列personal:5d78132dbe9006d20995aa63由实际页面创建；创建回执为正常201。管理脚本46759误期待200而失败，保留失败。只读核对两个实例及准确sourceId后，修正回执期待并精确续做该记录，未重复创建。75620 actualexit0，UTC00:58:23.030Z：仅本次删除9月20日后独立GET404，9月21日仍GET200；随后整个系列清除提醒与重复，唯一PATCH为reminderMinutes:null/recurrence:null，详情显示不提醒·不重复，独立GET无这两字段。最后通过实际UI软删除本次自建QA，独立GET404。续做恰三次业务mutation（本次DELETE、规则PATCH、系列DELETE），原QA系列未动；两次inbox badge GET刻意阻挡并排除，不是通知验收。

0061 SC61-02真实Web删除动作缺项现在已补齐；SC61-01清除规则有新实际UI与正式回读证据，不仅fixture。0062不将该页面实现归功自身。共享Web I原59失败/206跳过/denied4仍未解决；实际到期通知、远程Push和全域离线仍不据此通过。正式报告文档gate/commit/push闭环之前交付状态仍待ROOT收口，不新增Generator run。
