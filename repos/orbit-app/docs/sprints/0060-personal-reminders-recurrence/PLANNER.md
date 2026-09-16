# Sprint 0060 — 个人日程提醒与重复真正生效

唯一契约revision1，existing-codebase/single-generator、最多run-01。用户2026-09-17明确要求“提醒和重复需要支持”，替代0053不支持的产品边界，不改写其冻结Planner/REPORT。已有实施／worktree／Git主合push批准复用；不重开任何已结束run，不增加Evaluator。

## 启动与依赖

ROOT负责分配下一个空闲支线、隔离工作树、固定基线及唯一Generator；新任务GPT-5.6 Sol medium。当前A0058+B0059占两个Generator位置，本Sprint先排队，run_count=0，不预填实现者或启动成功。只有空出位置、所需共享契约／字典／日程文件锁释放后领取。最终App UI须消费0059固定设计，后端可在边界独立时先行；启动checkpoint记录固定SHA/TREE、Planner哈希、锁和就绪证据。

先完整读RULES、Bridge、0053实际REPORT、0059Planner及其已交付可用接线、个人日程authority/representation/service、reminder-plan-service/factory、typed delivery policy/source/worker及原生delivery-ownership。先GitNexus实际upstream/API impact，HIGH/CRITICAL先报告；UNKNOWN补源码，不私改索引。ROOT唯一索引writer。

## 范围及产品行为

Web `features/personal-schedule/`、实际schedule-items handler/representation、现有reminder-plan与typed通知投递所需最小接线；相关共享schema/contract及批准同步副本。App个人日程draft/model/schema/editor/detail/time block、0059紧凑KV行及必要设置sheet、三语字典、日程列表实例消费和直接测试。新增必要路径按RULES0登记用途/impact/SC；不重做通知全产品、不引入新云provider，不碰联系人共享授权、AI或OAuth adapter。

设置：提醒不提醒/开始时/提前5、15、30分钟/1小时/1天；重复无/每天/每周/每月，重复默认无结束，可选结束日期。输入使用日程timeZone，不改变原UTC秒精度、全天exclusive end及既有版本兼容。开始在过去不补发历史提醒；提示该实例不再提醒，未来实例仍遵守规则。

重复必须有真实持久series identity和有限日期窗口实例计算，不能无限复制记录。每周保留本地星期/时间；每月缺对应日期则跳过该月，明确说明，避免31日漂移；夏令时沿用已有timezone校验，歧义/不存在时间显式处理并验证，不 silently shift。日程列表、详情和深链接用稳定实例标识；编辑／删除重复日程明确选择仅此次或整个系列。单次例外、取消及系列规则变更需可靠持久、版本与幂等；不新增“此次及以后”复杂范围。

原v1/v2客户端及缺字段旧记录兼容：先查既有表示层决定显式opt-in字段版本，旧表示不能擦除新规则；禁止靠客户端类型绕过服务校验。保存ACK+独立GET完整回读后成功，409保留草稿。规则、关联及派生提醒的一致性需事务或现有可靠journal；失败/partial不能报告整笔成功。

提醒复用现有plan、target authorization、偏好和typed通知权威投递。真实现有cutover会取消旧本地managed提醒并交服务器ownership：不得简单启用第二条Expo调度链导致双发。稳定plan/occurrence/revision幂等键；改期、取消本次、删除系列要撤销旧计划及待投递项，late ACK/重试不得复活。应用内提醒必须接现有真实到期执行入口并可打开正确实例。原生若所有权允许才经现有expo-notifications排程，拒绝权限有明确反馈；服务器owner时不再创建本地重复计划。远程Push／生产scheduler没有实际环境证据仍TODO，不假称配置已上线，也不以其阻塞纯应用内实现。

## 五项SC及测试映射

| SC | 可观察结果 | 主要验证 |
| --- | --- | --- |
| 60-01 | 0059设计内提醒／重复行可选择、取消、显示当前值；保存与刷新重开、Web↔App同记录完整回读一致 | 实际授权HTTP保存/独立GET及同账号两端操作；旧记录／旧版本不破坏新字段，冲突保留草稿 |
| 60-02 | 日/周/月规则持久且有界展开，列表详情打开正确实例，timezone/全天/跨日/DST/月末不漂移 | 规则所属层一次边界测试、窗口分页与稳定实例ID、真实列表打开未来实例；不把展开单测当持久化证明 |
| 60-03 | 明确修改/取消本次或整个系列，例外重开仍在，其他实例按范围保持；撤销旧提醒不会被晚回包恢复 | 实际服务事务/CAS/idempotency隔离反例与保存重开/取消/改期操作，另actor无权 |
| 60-04 | 到期真实应用内提醒仅一次，正确来源/时间/目标；改期、取消、偏好、投递所有权和重试不双发 | 现有真实worker入口受控单个已识别测试日程→通知→详情闭环；必要实际原生权限/调度证据，远程Push未验明确单列 |
| 60-05 | 定向完整文件/两端types/contract sync及H本地受影响端各一次I结果真实，功能/中文REPORT提交、ROOT固定主合push和两端运行验收 | ROOT官方fixedBASE..TREE gate，源码freeze，无并发重套件；Web/API变化必须先停旧→生产build→restart健康→Simulator主8082验证，Phone单独版本消费交接 |

## 执行与交接

先登记run01及具体实现边界；现有reminder contracts与cutover不矛盾才写，遇到真冲突报告证据/选择，不取平均。确定性时间规则在代码中，不用AI。TDD RED→最小GREEN，每链完整受影响文件与types/同步必要一次，本地H收口一次I，最多两个非预期repair；保留所有原基线失败/skip，不能据此降低SC或重复full。

本地隔离测试使用Node22/既有依赖及zero-outbound/protected-runtime guards；不读写未知真实DB、迁移生产库、改账号、seed、清缓存、重置累计$5、重启MAIN/Phone或付费调用。真实到期测试由ROOT核精确测试对象/授权、单owner执行，缺真实对象只阻对应SC；后端/App其他就绪部分继续。

分支只stage自有明确路径，先ROOT官方固定BASE..TREE detect_changes，功能commit后真实中文REPORT另commit，交固定功能/报告SHA、dirty、失败/未完成、回退、投递owner及另一端影响。ROOT精确merge chat-agent→必要合并树验证→普通push核remote SHA，所有SC通过才completed。没有提交/合并/真实闭环不能写完成。
