# Sprint 0058 — 离线消费清单与审计接线

唯一契约revision1，existing-codebase/single-generator、最多run-01。承接用户已批准“所有已授权、用户可见数据离线可读”的0033～0036范围，以及0050/0053/0057实际集成缺项；不是重开这些已结束的run，也不克隆整个Sprint。

## 基线和职责

唯一现有A任务`01a0a879-e923-7701-8e39-935f36eab448`（phoneweb-A｜浏览器运行与会话），GPT-5.6 Sol medium。ROOT只管理／Git／实际设备，不实施产品修复；A原0056closed保持。

ROOT隔离路径`.worktrees/sprint-0058-offline-surface-alignment`，branch `codex/sprint-0058-offline-surface-alignment`，产品基线固定`ca77035729bffae1c977ed30b6697921c02decfb`／TREE `d5106684cf824b922b21a1898b07d527fc71c983`。先核HEAD/status与canonical ROOT Planner SHA。只用已有依赖链接，无install/envcopy。B0057只余REPORT，不修改被测源码；A不得写其隔离树或争抢Git index。

先完整读RULES、Bridge、AUDIT及0033～0036适用已固定规范与真实消费源。每待改符号actual upstream impact；HIGH/CRITICAL先告ROOT并核调用者，新符号UNKNOWN补源码。只有实际stale警告才交ROOT solewriter刷新，不各线重复index。实际工具缺项不得私改index/meta/registry。

## 文件边界与排除

- `src/data/offline-read/route-domain-inventory.ts`：精确消费登记、必要数据域分类；同一接口多个消费者必须相同策略，未知／秘密端点继续fail-closed。
- `scripts/audit-offline-read-surfaces.ts`：仅识别AUDIT中真实动态调用的最小AST接线，不添加忽略名单、宽松默认或跳过整个消费者。
- `tests/offline-read-inventory.test.ts`及实际直接使用者测试；必要新增`tests/offline-read-surface-alignment.test.ts`先登记用途，主要行为在所属层验证一次。
- 若现有运行时无法承接新selector，先只读核root下`src/data/offline-read/`、相关资源缓存与数据域注册。完成既定目标必需的最小接线文件可按RULES第0节追加路径、用途、impact及对应SC后实施；不引入新离线架构。
- CanonicalEventDetailModules、日程组件、AI／首页产品组件、报名写入模块、Web、字典、共享契约及所有其他固定52路径默认只读。不改页面设计、路由覆盖、身份/写资格、公开名单规则、同步协议、迁移或provider。不得仅为审计改生产请求行为。
- 只新增本Sprint真实REPORT和ignored证据；不改旧Planner/REPORT/SC。禁止真实DB、账号偏好/fixture、清缓存、服务/Simulator/公网、模型与付费调用。原累计$5账本不reset。

## 五项SC

| SC | 可观察结果 | 主要验证 |
| --- | --- | --- |
| 58-01 | AUDIT十项真实消费逐项登记为正确域/selector/schema/储存策略，无权限扩大；operations末段不误分类 | 真实源码扫描及精确policy正常/反例，同接口多消费者策略一致 |
| 58-02 | AI/Home动态调用可完整识别，只有实际已退役登记可移除；真实消费者审计unregistered/invalid均空 | 承接原失败→最小GREEN；陌生路由、未解析delegate/方法/path及混合合法非法调用继续RED/拒绝 |
| 58-03 | 新合法读取走现有离线数据域及scope/delete fence；离线正文不授予在线资格，写操作仍online_only，秘密不缓存 | 必要直接缓存/数据域行为：已授权回读、换号/撤权/删除隔离与未知路由/认证端点反例；不得只测表项 |
| 58-04 | 冻结源定向完整文件与App types通过，H本地App一次I真实结果、所有失败/skip保留，版本和图盲区清楚 | 现有Node22/env-i/zero-outbound及受保护3000/8082/PG/32xxx隔离；不重Web全库，Web源码未变复用0050/ROOT有效证据。域外/+html保留，不改期望求绿 |
| 58-05 | 源码/实际中文REPORT提交、ROOT官方fixedTREE审计，必要安全主合chat-agent/push与实际只读设备消费和Phone影响交接 | ROOT固定SHA/TREE、远端一致、生产Web新BUILD/PID/health与主8082实际读；未发生不预填pass，真实取消→再次报名与日程双向写回读仍归原SC |

## 执行与交付

记录run-01/Planner哈希/基线/锁，复用未变阅读与旧失败证据。先核每个实际请求用途和policy规则，承接真实RED，最小修复后完整受影响文件、App类型一次；H操作链本地一次App I，最多两个非预期本地repair。源码冻结后不编辑测试中的版本，不因文档或commit重跑全库。

A独立分支只stage自有路径，不混入52基线／用户dirty。`detect_changes`按工具实际支持对固定BASE..TREE审计，ROOT空staged不能替代本线；工具无worktree参数则交ROOT官方immutable门槛。固定功能commit后才实际中文REPORT、另doc门槛、clean与锁/句柄释放，原run明确结束；缺任何必需SC不得completed。

ROOT按依赖精确消费0050/0057与此新接线，保留两端已批准行为；Web/API固定52进入MAIN后必须停止旧Web→生产重建→重启health，再实际App验证。当前MAIN57ea、公网0056及冻结322xx保持，不能提前切换或假称已更新。未知账号与真实窗口只阻相应验收，不用造数据/改变日期绕过。
