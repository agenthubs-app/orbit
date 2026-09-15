# C线0009执行补充

2026-09-14，用户明确启动C线全部Sprint并复用全部批准；协调者确认当前槽位A0003+C0009。原Planner SHA256 e8a6a5ae644a65a2653c266873d0538d5bbc97dc6fe712db06c8af5198ff1e9a 保留。

依RULES第0节，TECHNICAL_PREPARATION中的设备时区、异常回退、DST拒绝歧义及脏稿固定编辑时区方案生效，取代旧账号优先及待审文字。SC01验收设备读取、异常、前台变化及身份隔离；SC05比较同一显示zone下同记录读数，不要求不同设备墙上时间相同。其余SC与原生/跨端证据要求保留。

全部路径以本worktree为根。C独占0009原文件表、时间基础设施及app/_layout.tsx；A在交付前不修改EventDetailScreen/根布局。通用API/hooks新增修改先协调。前序0001/0002真实REPORT已读；历史证据不作为本次新设备策略通过证据。

实现顺序：纯日期/当地时刻解析及日期patch；设备Provider及草稿保护；各页消费者接线；定向检查、H集成检查、原生和跨端验收。不得让原生缺项被静态测试替代。无新增日期依赖、账号偏好或共享副本修改。

必要消费者补充：src/screens/tasks/TasksScreen.tsx（SC02任务列表日期分组与前台刷新），tests/date-time.test.ts（SC02/03跨页与DST），均按RULES第0节登记。未触碰通用API/hooks或A线资料文件。保留非本线既有纯转换函数的默认调用兼容性，本线页面明确传递设备zone。

必要提醒消费者：src/view-models/reminders.ts、tests/reminder-quick-options.test.ts，仅将既有快捷选项/回读标签使用的时区显式传入，覆盖SC02/04同一设备时区；不改变通知调度器、权限或清空语义。
