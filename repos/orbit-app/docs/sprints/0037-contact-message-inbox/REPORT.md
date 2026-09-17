# Sprint 0037 执行报告

2026-09-16；run-01，唯一 Generator：E线当前session。Planner SHA256：111b90cae89d5bce491b3c2dd31b3ca6b948730b6b78b70b6d73d0b5f92cc9ed。

联系人真实消息已从通知分离。Web 和 App 默认打开消息，按账号记住页签；展示真实姓名、原文和独立未读数。App 的收件箱回复已接通真实发送，超时保稿且复用发送身份，阅读不修改通知或业务完成状态。

功能与验收版本 **a591494b0**，分支 codex/e-line-sprint-0037；chat-agent 已 fast-forward 至同一 SHA，无冲突，产品树完全相同。合并后重新运行消息及生命周期消费者；未变的两端类型、生产构建和原生运行证据按 RULES 复用。报告提交 SHA 见 Git 历史。

| SC | 结果与证据 |
| --- | --- |
| 01 入口与呈现 | 通过。MessageInboxList / ContactMessagesTab、actor+origin 页签、真实姓名/原文；服务支持 actor cursor、默认50/上限100、全会话 unreadTotal；消息不受通知30天窗口影响。分页服务7项与两端组件覆盖。 |
| 02 真实通信 | 通过。两个合成 QA 账号真实注册/邀请绑定；A Web 发→B Web 回复→A 原生回复→A Web 重开；B回复在服务端持久化后人为丢弃响应，再点重试，持久消息仅一条。同账号4条历史保留。 |
| 03 阅读隔离 | 通过。原生读会话使服务端未读1→0；停留通知时 B 再发消息，消息计数1、通知页无消息；切回消息全部已读后服务端0且4条正文仍在。消息游标与通知 mutation 测试隔离。 |
| 04 账号/体验 | 通过。迟到写回执、旧账号401及取消请求不更新新账号；allowPrivateAnalysis=false 的显式回复测试通过。原生中/英/日、暗色与 accessibility-medium 字号截图已检查，长正文正常换行。AI provider未启用，未声称实体推送验收。 |
| 05 跨端交付 | 通过。两端当前产物使用同一31037生产API与隔离PostgreSQL；固定功能SHA已进入主线，合并树消费者与相同树复用检查见下。 |

## 检查与失败历史

- App npm test：2941项，2939通过、2失败、0跳过。两失败为旧测试默认打开通知的假设，改为明确选通知后该文件46/46通过。后续实际回复路径新增RED→GREEN及旧账号迟到回执测试，相关交互/生命周期完整文件110/110；AI关闭发送1/1。未把局部修复改写成全量通过。
- Web npm test：3459项，3209通过、54失败、196跳过。新增按钮样式门槛已修正；真实数据库定向复验后剩余7项与未修改主线相同，另13项为既有审计覆盖失败。未修改主线失败文件对照234项214通过20失败。20项为13个audit用例、契约纯类型/出口2项、contact detail标签1项、home provider复用1项、register3项；原始日志完整保留。
- Web 最终消息UI/读取竞态/计数/按钮样式组合20/20；服务分页7/7；隔离PostgreSQL通信测试1/1，无跳过。App前序消息消费者153/153、首页12/12。
- 两端 npm run typecheck exit0；App sync:contract及副本检查4/4。Web npm run build 第4次最终构建exit0，重启新产物后健康通过。iOS Release/SQLCipher独立bundle构建exit0并实际启动；依赖警告不计为无警告。
- Git diff --check 通过。GitNexus独立索引 orbit-e-line-0037 staged检查30文件/168符号/0已索引流程；没有其他Sprint路径。索引对流程识别有限，不以0替代调用方验证；早期 HIGH/CRITICAL 提示及其消费者验证保留在checkpoint。
- 合并树：a591494b0，与验收产品树 git diff exit0；Web消息/服务12/12；App消息/生命周期见 /tmp/orbit-0037-main-app.log。相同源码、依赖、QA环境复用两端typecheck与构建，无需重启其他线服务。

## 共同环境与证据

- Web生产地址 http://127.0.0.1:31037；模式live；数据库 orbit_qa_sprint0037_20260916；workspace:qa:sprint0037。QA A/B均合成测试账号；凭据仅在权限600的临时文件，报告不留Cookie/token/连接串。
- App API同址；iPhone17Pro 9BF990F2-45B8-42CE-8543-E583B941DA17；独立bundle app.agenthubs.orbit.sprint0037qa。用户原App和0033的Simulator/3108/3113/Metro8082未接管。
- App忽略目录 build/harness-state/evidence/sprint-0037/run-01/：web-reply-retry、web-app-reply-mobile-en、native-reply-zh、native-list-en、native-thread-en、native-list-ja-dark-large、native-thread-ja-dark-large、native-notifications-message-unread-independent、native-message-mark-read 截图；checkpoint含命令上下文。
- 原始日志 /tmp/orbit-0037-{app-full,wide-retest,app-send-final,web-full,web-baseline-failures,web-failure-retest,web-layout-target,web-typecheck-final,app-typecheck5,web-build4,native-build,detect-staged,main-app,main-web}.log。原始临时证据可能随本地清理失效；本报告保留版本、结果及复现链。

## 边界与交接

服务分页当前读取授权会话快照后切页，不扫描联系人，但尚非数据库级分页。前台刷新重新显示最新第一页；Web当前详情独立保留。通知仍为旧读面，0038接入三类新记录。未做旧数据迁移、自动模型发现、远程部署或真实Push；0012原有Push缺项不被本次关闭。

本Sprint未产生AI/OCR付费调用，新增费用0；项目累计$5硬限额不变，0039前仍需核对跨线账本。剩余用户AGENTS/CLAUDE改动和旧设计目录未提交；GitNexus生成的.claude技能目录也未提交。回退可revert本功能提交，保留原通信记录；没有破坏性数据迁移。

下一步继续0038。0033仍在独立工作树执行，本次未写sync/outbox；0039的AI读面与0040通知生命周期接线前再次检查0036/0035实际提交。
