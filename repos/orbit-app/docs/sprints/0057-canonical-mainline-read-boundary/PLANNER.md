# Sprint 0057 — canonical 详情与主线名单资格入口的兼容

唯一契约revision1，existing-codebase/single-generator，最多一次run-01。需求是既有0050安全主合与PW0012无legacy私有读取条件的实际失败，证据见[AUDIT](AUDIT.md)，不是克隆整个0050或第二次C生成。

## 基线、角色和锁

ROOT管理／Git／设备，不实施修正。唯一现有B任务01a0a879-e8fe-77e3-b748-bd78005aecc8，GPT-5.6 Sol medium；原0054已closed，不重开其run。0057独立编号。

执行位置是ROOT创建的隔离`.worktrees/integrate-sprint0050-20260917`，branch codex/integrate-sprint0050-20260917，HEAD固定7c4b81954c2dd1bcc51246a20f44a1e421807cae，启动stagedTREE603afeb1dc1d2f99362527cd87f2f9306fc42d73。52已批准固定交付由ROOT暂存；这里是共享Git所有权，只有ROOT操作index/commit。B只能改下面窄锁并提供差量，禁止stage、commit、reset、stash、另cherry-pick或清掉现有52路径。Planner canonical绝对位置在ROOT，启动记录其SHA256，不另造副本。

ROOT领取此run并显式启动后，B先完整读RULES、Bridge、AUDIT和实际组件／失败测试；固定已有依赖链接可复用，无install/envcopy。每待改符号actual upstream impact，HIGH/CRITICAL先交ROOT告警；UNKNOWN补源码caller，不当零风险。只有工具实际warn stale才交ROOT sole-writer刷新，允许继续独立只读准备，不重复各线index。

## 窄文件边界

- src/screens/events/EventDetailScreen.tsx：仅EventDetailScreen→EventDetailCard对来源／旧名单入口的组合接线，保留rosterScopeKey/isScopeCurrent、locale和现有canonicalFooter更新链。
- tests/canonical-event-detail-screen.test.ts：保留当前真实RED原断言；必要新增canonical↔legacy来源转换／角色及旧名单资格行为用例，不松断言或伪造认证。
- 如最小真实交互需要独立测试，可新增tests/canonical-mainline-read-boundary.test.ts；先checkpoint登记用途。EventAttendeeRosterLink.tsx及全局鉴权、cache、来源schema、backend、四字典、0050报名写入、所有其他52源路径只读，不改。
- 只新增本Sprint实际REPORT.md和ignored证据，不改原C/49报告、原SC、Planner。禁止工具安装、模型/provider、真实DB/seed/账号偏好、服务/Simulator、公网操作。

## 四项SC

| SC | 必须观察的结果 | 主要证据 |
| --- | --- | --- |
| 57-01 | canonical unavailable不挂旧owner名单资格入口，只有已校验公共详情与questions=false注册GET；已注册的正式operations/artifact仍按既有资格执行 | 当前App171中唯一真实RED原样承接→窄最小GREEN，完整canonical屏幕文件及API调用序列，未变0050动作测试 |
| 57-02 | legacy来源仍走原owner-only名单资格且未确认前不能导航，换来源／actor／server／event／刷新撤权不遗留旧入口和内容 | 真实渲染／请求控制的正常及反例；保留主线scope/locale，公开事实与正式发布名单不被无差别隐藏 |
| 57-03 | 对52固定集成树只产生窄锁差量，必要直接文件与App types通过；原失败／PG skip及图盲区诚实保留 | B完成改变行为用例后完整canonical+新测试、App types一次；ROOT其余已不变171/57证据按范围复用，不能假称重跑。含隐私门槛H：本地收口受影响App一次I，Web源未变复用旧C一次I及此次55/2skip/types0，不重复全库求绿；旧获准基线失败按名称保留，不修域外。每非预期失败最多2repair |
| 57-04 | 固定交付+窄修正经ROOT官方immutable审计和必要合并树检查，精确合chat-agent／普通push远端一致；主Web重建重启后实际主8082只读canonical页面无旧名单资格读取 | ROOT记录fixedTREE/manifest/commit/REPORT、BUILD/PID/health与真实设备读取；未发生不预填pass，真实账号同记录取消→reactivate仍在0050-SC05，Phone另一消费影响明确交接 |

## 执行步骤

1. 核HEAD、52manifest、起始TREE及只有两源锁的权限；读canonical公共来源判定、EventDetailCard挂载、EventAttendeeRosterLink私有资格链与C现有正式读链。记录旧App74116退出1/171-170-1和实际失败日志，不能拿旧C125通过替代合并版本。
2. 实际impact后，承接已复现RED；加保留legacy资格的最相关行为反例。用既有Node22、env-i和zero-outbound `--import`，不请求真实服务。只做来源级最小接线，不重构模块或修改owner判定。
3. 完整必要文件／types和一次App I；失败定位本次影响，保留全部原日志。源冻结后向ROOT交working差量、对起始TREE的精确路径、测试真实退出码和未完成SC，B不操作index。ROOT只暂存允许的修正，actual官方比较audit新不可变TREE后创建包含固定交付与兼容修正的用户操作链feature commit；不是未验旧快照commit。
4. 真实产品执行结束后B写中文实际REPORT（注明ROOT创建的feature SHA、自己两源差量、其余固定C依赖、缺项），ROOT另doc审计提交，Bclean/锁释放结束run。ROOT精确主合并树及设备／Web负责继续，不做第二Generator或Evaluator。

原累计AI/OCR $5账本不reset，本线零模型／真实业务调用。任何必需SC或主合缺失不能completed。未知QA活动写窗口不阻本轮只读边界修正；合法窗口不能靠改日期、配置或冒owner制造。
