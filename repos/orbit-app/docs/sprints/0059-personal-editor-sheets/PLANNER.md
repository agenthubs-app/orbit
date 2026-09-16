# Sprint 0059 — 个人日程编辑设计还原与关联选择窗

唯一契约 revision 1；existing-codebase、single-generator、最多 run-01。用户 2026-09-17 最新三项需求中的设计还原及笔记／人脉选择窗；承接0053但不重开、改写其原报告。用户已选定设计并要求支线实施，复用RULES第0节批准，无候选设计／独立Evaluator。

## 基线、依赖和执行者

现有B任务 `01a0a879-e8fe-77e3-b748-bd78005aecc8`（phoneweb-B｜手机布局与交互），GPT-5.6 Sol medium。ROOT负责管理、Git、服务与实际设备；B唯一实现者，原0057 run已结束，不重开。

隔离 `.worktrees/sprint-0059-personal-editor-sheets`，分支 `codex/sprint-0059-personal-editor-sheets`，固定产品基线 `81706865e257fa06125db1256831241d6ca61ecd`。ROOT canonical Planner为契约，启动记录其SHA256及实际HEAD/status。先读RULES、bridge/status.md、bridge/handoffs.md、0053实际REPORT、相关既有源码；复用未变证据。

参考：`/Users/xzhao/Downloads/软件UI设计现代化 (1).zip` 的 TURN 6 / 6a；`/tmp/codex-clipboard-b0bfcb97-0179-4b98-8ed6-1e8fbfa1def1.png`。当前问题图 `.../codex-clipboard-5d229384-a1cb-4161-acf5-b9daee2e88a4.png`。ZIP只作为静态数据读取，不执行HTML脚本；示例人物和文案不授权seed或共享资料。

A0058持有离线inventory、AST审计及其测试三文件；B不得编辑这些文件。ROOT正在处理实际stale警告的唯一索引刷新，刷新完成前B只读准备，不编辑符号；完成后逐个实际upstream impact，HIGH/CRITICAL先告ROOT。新增符号UNKNOWN补源码调用者。当前A唯一App I进行中，B不得并发重套件、接管服务／账号／设备。最多A+B两个Generator。

## 文件边界和设计规格

App：`src/screens/schedule/PersonalScheduleScreen.tsx`、`PersonalScheduleTimeBlock.tsx`、`PersonalScheduleAssociations.tsx`；必要个人日程专用底部sheet、搜索匹配helper及这些直接消费者测试。字典 `src/i18n/{messages,zh,ja,en}.ts` 如必要由B持有；按现有同步命令生成，0060未领取前不冲突。`PersonalScheduleDetailScreen`只适配共享关联组件行为，不另行重做详情设计。

搜索如现有授权接口无法覆盖首字母，可按RULES0追加实际notes／contacts搜索读模型、handler、契约及对应测试，先登记API impact、用途和SC关系。不能只筛第一页声称全量匹配；不用AI做确定性匹配。新增consumer需等A0058释放、ROOT固定SHA接入后再登记真实离线策略，不绕过其锁／fail-closed门槛。

参考app-owned390×844，不复制手机外壳／系统状态栏。白底、Ink & Signal现有tokens；nav紧凑，标题标签11px、标题22px/900且底线；时间卡边框1px/radius12，日期一行、两时间24px/800并排左对齐、改期入口，时长chips视觉紧凑且选中黑底白字；时区11px在时间标题右侧、隐私脚注11px卡内底部。地点为一体分段控件、选中黑底白字，链接入口下划线；关联人脉为真实头像chip及增加入口；提醒／重复／备注紧凑KV行，固定底部黑色保存按钮高度50/radius12、安全区和键盘避让。沿用真实校验及失败提示；触控目标至少44，不靠巨大可见框达标。不要全局修改AppScreen导致其他页面回归。

提醒／重复真实支持属于0060：不得新加点击无效的行或假成功提示；已有unsupported不得被改成虚假supported。B交接可扩展行的必要接口，0060在同一最终设计中接入，用户三项最终验收仍需0060通过。

## 五项SC及测试映射

| SC | 可观察结果 | 主要验证 |
| --- | --- | --- |
| 59-01 | 编辑页按ZIP6a还原层级、尺寸、位置、选中态；本地化、键盘、安全区及错误提示可用 | 同390×844、相同标题／日期／18:00→18:30状态截图对照，列差异；不能拿空表单与填好参考直接比较 |
| 59-02 | 两个入口点击即打开底部窗、加载已有授权列表；loading／empty／error／retry／more及已选状态清晰；返回或下滑关闭 | 组件接线测试及真实Web/Simulator实际点击；请求有界分页，只读取选择所需摘要 |
| 59-03 | 文本及首字母匹配覆盖当前账号完整可查集合，大小写／中文拼音首字母可确定性匹配，例如LY匹配林悦；无结果明确 | 匹配所属层一次正常／跨页／空词／组合反例、HTTP授权边界；不要仅英文initials冒充中文支持，未知字符规则明确 |
| 59-04 | 选择／取消／移除写入草稿，保存ACK与独立GET后重开一致；取消不写；换号、关闭、晚回包、删除／撤权不泄露旧数据 | 保留既有CAS/idempotency/version、50关联上限、Abort/scope fence；受影响完整文件、相关端types一次，H本地一次I真实结果保留 |
| 59-05 | 固定功能和中文REPORT提交，ROOT精确主合chat-agent/push；真实Web/API及原生验证、Phone影响交接清楚 | ROOT固定BASE..TREE官方detect_changes再commit；源码冻结；若Web/API变化先停旧→生产build→restart健康，再实际同账号保存重开；未发生不填pass |

## 执行与交付边界

先承接“点击只展开inline搜索框且空query不加载”真实RED，再最小实现和完整直接回归。L不全量；身份／权限／写入／共享契约等H按RULES本地收口一次受影响端I，串行等A当前I结束；不因文档／commit重跑全量。原/+html及离线运行时缺口保留，不修改测试期望求绿。两个非预期本地repair上限。

使用已批准Node22、已有依赖链接，测试env-i、zero-outbound与protected-runtime guard；无envcopy、真实库写入、账号偏好／fixture、服务／Simulator／公网切换或付费调用。ROOT拥有实际设备与已识别真实写入对象；缺对象只阻相应SC，其他本地链继续。新必要确定性依赖先核已有包、登记用途和版本，不擅自安装整套工具。

阶段只维护ignored checkpoint，列Planner哈希、锁、命令/退出码/源码版本。收口固定源码交ROOT官方immutable门槛；只stage明确自有路径，功能commit后创建真实中文REPORT并另doc commit，列SC→文件→SHA→实际证据、失败/skip、未完成、剩余dirty及回退。ROOT空staged不替代本线audit；不得直接merge MAIN。完成闭环且所有SC通过才completed。
