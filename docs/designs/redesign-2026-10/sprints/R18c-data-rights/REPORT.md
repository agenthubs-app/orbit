# R18c 数据导出与退会执行报告（未收口）

2026-10-20，line-c。开工从 origin/redesign@063c3c65d 快进；本线仅作路径限定提交，没有 push、部署或访问 Neon／生产。主会话 RD-33 的五项代定已落实到代码、改稿或明确的停点。**本 Sprint 尚未满足全部 SC：共享记录的同步/不可变契约、像素和全量零新增失败仍红。** 生产到期清除保持关闭。

## SC 对照

| SC | 状态 | 主证据与缺项 |
| --- | --- | --- |
| 01 开工／预检 | 完成 | R18b 基线、现有 orbit_records CAS、b7 原稿／改稿 16 板与 b12 登记已核；preflight-checklist.md 及 _evidence-c 预检。 |
| 02 改稿／入口 | 部分 | b7 去 Pro、虚假反馈和进度估计；RD-33 重画 #19、认可 b12，App/Web 权利入口已接。真实两端操作链与像素仍红。 |
| 03 契约／存储 | 本机通过 | 严格 POST、确定性 recordId/CAS、契约 snapshot/schema parity 5/5、App 副本同步；无 DDL。真实端到端未验。 |
| 04 创建／限额／历史 | 本机通过，双端未验 | 东京日 3 次、同键重放、单活动任务、失败返额度和本人历史有 PG 测试；未取得完整 App/Web 操作记录。 |
| 05 Worker／ZIP／通知 | 部分 | 五域 ZIP/manifest、私有对象、租约和 outbox 有聚焦测试与合成样本；离页自动调度和生产任务列 DEFERRED。 |
| 06 下载／过期 | 部分 | 本人授权、5 分钟链接、7 天过期与对象清理有聚焦测试；原生文件打开/分享与浏览器实取文件未完整留证。 |
| 07 App 账户／导出 | 部分 | AccountScreen 已整屏换为 kit 行，保留 profile、workspace、目标、权限、登出及服务器入口；debug 仅 dev。App #19 三轮和其余 P 板像素未过。 |
| 08 退会申请／再认证 | 部分 | 密码限次与用途绑定一次性 receipt；Google challenge + prompt=login/max_age=0 + auth_time ≤10 分钟、同账号校验已接，旧 503 已去。真实外部 Google 账号未联调；本机 handler/授权测试通过。 |
| 09 pending／取消 | 部分 | 旧 JWT 失效、普通 API/sync 白名单、镜像清理、CAS 取消及 pending 登录路由有聚焦测试；两端真实整链未验。 |
| 10 本机到期清除 | **未通过** | 逐域 runner、失败续跑、共享面谈双账号、规范化共享事件双账号测试已过；但已有 immutable 事件角色／修复台账可能残留本人 ID。残留扫描会失败关闭，不能声称零残留。 |
| 11 完成／异常态 | 部分 | RD-33 匿名完成邮件 outbox 与最终身份删除同事务，提交后投递；本机失败重试通过。#23/#27 像素三轮仍红。 |
| 12 旧屏／路由 | 部分 | #19 整屏替换，R18a/R18b 路由保留；Web 言語と外観整板 6/6 红，需 A/集成轮复核。 |
| 13 像素全量 | **未通过** | RD-33 b12 已是正式基准；原稿 P、补画 P 与 R18a 整板矩阵均有失败。每 P 上限和转轮⑪见下。 |
| 14 权限／可移植 | 部分 | actor 隔离、CSV 注入、vCard 转义、JSON 白名单、私有 ZIP 等聚焦通过；真实双端打开与共享域零残留未验。 |
| 15 交接／生产 | 部分 | 下方四栏交接和 DEFERRED 已登记；根台账与活跃 B/D/A/E 线由主会话协调，未越权发送或启用生产。 |
| 16 全量／独立复核 | **未通过** | Web/App 按指定环境各跑一次仍有新失败；聚焦修复不能代替全量；主会话独立复核尚未执行。 |

## RD-33 实施与安全边界

- **§R18c-1 共享数据。** 共享面谈将退会者参与者 ID 换成本次删除占位 ID、移除本人备注，对方记录保留；规范化事件报名/参加行匿名化，发布 DTO 按当前值 CAS 去掉退会者，主办有报名继续阻止、无报名可删除。对应提交 4f77e92bc、2457d1411；PG 双账号与重跑测试通过。事件域的 immutable role assignment／repair ledger 有禁止 UPDATE/DELETE 的触发器，现有无 DDL 契约与“本人 ID 零残留”冲突；扫描报 EVENT_OPS_REDACTION_REQUIRED，不跳过、不报 SC10 通过。
- **§R18c-2 账户 #19。** 新版列表保留 profile 编辑、workspace、目标、时区/状态、权限、导出/退会、登出和服务器设置。删掉无可信来源的端末数与无路由的密码设置；设备 debug 仅开发构建。后续修复了游客旧邮箱泄露及服务器入口。提交 c74ec67d5、a85a81859、56591c516。
- **§R18c-3 认证。** purging 阶段阻止自动建号，删除完成后同邮箱可用新 account ID；App/Web pending 登录先到 pending 页。Google fresh challenge 用 AUTH_SECRET 加密并绑定 actor/user/email/退会用途，核验同账号 auth_time 后签发 10 分钟一次性 receipt；broker 发 prompt=login、max_age=0、auth_time essential claim。提交 a6616ad22、725a6df66。真实 Google OIDC 行为需获授权的外部账号联调，不能以本机替身证明。
- **§R18c-4 画板。** b12 补画已按 RD-33 认可为正式基准，#19 改稿在 b7 注明。Web #27、App #23 各三轮上限的残差与 28px 标题组件缺口转像素余项轮⑪；不在 C 线加私有 token。
- **§R18c-5 完成邮件。** final-identity 同一事务删除身份并写只含收件地址、模板和投递控制字段的匿名 outbox；提交后投递，成功删行，失败保留重试。提交 cdab6d89e，PLANNER 相应句已改。邮件服务真实投递仍列 DEFERRED。

本机到期清除逐域顺序为连携／设备、导出对象、人脈、メモ／Task／日程、プラン／iOrbit、イベント、收件箱、最终身份。每步有确定性进度/CAS 与租约；失租和残留会阻止最终身份。只有实际连接为 loopback orbit_line_c_test 且显式 local 环境时可运行。合成 ZIP 位于 _evidence-c/R18c-sample-export.zip，含五域 JSON 与 manifest；它不是现实账号导出。

## 画板与像素实测

- b7 原稿与改稿预检 16 板、数字冲突 0；b12 App/Web 登记共 152 frame，预检数字冲突 0。认可基准不等于像素通过。
- App #19 有效原生三轮：run-01 raw 0.0641／8 超阈／11 缺块；run-02 0.067／8／9；run-03 0.0654／8／5。三轮上限转⑪。App #23 原生三轮最终 raw 0.0251／3／0，转⑪。
- Web #27 三轮最终 raw 0.0072／1／2，转⑪；剩余 28px 标题与 kit token 差异交 A 线。Web b7 P01 已登录后的有效截图 raw 0.0581／4／29。
- b7 其余 App P02/P03/P04/P06/P07/P08/P09 一轮 7/7 失败；Web P02/P03/P05/P06/P07 一轮 5/5 失败。b12 App P02/P03/P04/P06/P07/P08/P09 浅深 14/14 失败，Web P01/P02/P03/P05/P06/P07 三宽浅深 36/36 失败。R18a 言語と外観整板 6/6 失败。部分画面缺对应 live 状态 fixture，不能把错态截图判为像素通过；完整 triptych、raw/带数在 _evidence-c/R18c-*-P-matrix-run-01 与对应 summary.json。各 P 当前只跑一轮，余项转⑪。

## 测试与门禁

所有日志与逐名差分在 /Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/。全量只在收口阶段经 heavy.sh c 各跑一次，环境仅设置 LANG=en_US.UTF-8、LC_ALL=en_US.UTF-8；没有全局数据库 URL。运行后做了有界聚焦修复，**未将聚焦结果冒充全量**。

| 门禁 | 实测 |
| --- | --- |
| Web 全量 | R18c-web-full-baseline-env-final.log：7,911 tests／6,811 pass／35 fail／1,065 skip，exit 1。R18b 基线 7,764／7,204 pass／15 fail／545 skip。逐名 30 新、10 消失，见 R18c-web-full-baseline-env-delta.json。新失败中 C 同步审计 5 项；加锁/分类后聚焦 3 项恢复，2 项保持红：共享 inbox owner 改写、immutable publication in-place 改写。其余新增名主要是新增 PG 集成测试在未配置本机库时直接失败，逐项原始堆栈在日志。 |
| App 全量 | R18c-app-full-baseline-env-final.log：3,274 tests／3,246 pass／26 fail／2 skip，exit 1。R18b 基线 3,246／3,232 pass／12 fail／2 skip。逐名 15 新、1 消失，见 R18c-app-full-baseline-env-delta.json。#19 的 9 项画面/布局失败经聚焦修复 9/9；四项 C 静态登记/离线边界修复后 57/57。旧 i18n snapshot 改名仍红；invite 与 discovery 属邻接画面，未归为 C 成功。 |
| 聚焦／类型 | Web 共享 purge PG 3/3、sync 审计 9/11（2 项架构冲突）、Web typecheck exit 0；App account ink 9/10（非账户 discovery 1 项红）、静态/离线 57/57、App typecheck exit 0。先前 Web auth、App auth/pending、导出/runner、契约聚焦证据见各 R18c-targeted 日志；真实 Google 未测。 |
| copy/契约 | Web copy:qa 原先 7,507 条／245 issues，exit 1，非 R18c 权利文案专属；Web/App 契约同步与 schema parity 聚焦通过。未把红门禁记为通过。 |

## DEFERRED、待主会话决定与四栏交接

已接受的已知限制：每域 10,000 行显式失败上限、ZIP 同步压缩、离页自动调度与生产到期任务、真实 Google revoke／Blob eraser／邮件联调。这些不阻止本地代码交付，但不能包装为运行验证。生产调度、Neon/部署、备份保留期和真实外部账号仍待用户授权。

需要主会话定夺的冲突：D-22 要求匿名化所有共享事件残留，而现行 immutable role/repair ledger 和 derived sync publication 契约拒绝就地更新；共享 inbox 的会话 owner 改变还需要正式 owner-change handler/设备撤回语义。C 线保留审计与残留扫描红灯，不添加隐藏例外。完成邮件与最终提交的原子边界已按 RD-33 改完。

| 目标 | 本线版本／事实 | 另一端影响与请求 | 未完成／验证范围 |
| --- | --- | --- | --- |
| README 契约 11 | shared/contract/account.ts、BREAKING 与 App 副本同步；严格删除 POST | 主会话合并同版契约与根登记 | 聚焦契约；真实双端操作未验 |
| HANDOFF／DEFERRED-A | 本机 export、pending、purge 与匿名完成 outbox；生产入口关闭 | 主会话登记 D-21 部分、D-22 未收口和生产授权 | PG/替身；无 Neon/生产 |
| A 线组件／像素 | #19 kit 行已落，#23/#27 三轮上限；28px 标题无私有 token | A 线复核标题 token、ListRow/长文案；⑪ 接收残差 | 详见 triptych；P 矩阵红 |
| B／E 数据 | 共享面谈、联系人/Blob、事件 DTO 与 inbox 占位方案 | 复核共享内容、不可变事件账本、Blob owner 和跨域生产者 | 双账号 PG 样本；immutable 残留失败关闭 |
| D／R18b 认证壳 | pending 登录路由、purging 建号阻断、Google fresh receipt | 复核外部 OIDC、旧会话及设备同步撤回 | 本机聚焦；无付费外部账号联调 |
| 同步域 | purge 已取 commit-order lock；静态审计仍有 owner/publication 两项红 | 主会话决定 owner-change handler 与 publication 新版本/旧快照清除路径 | Web 全量 2 项 C 冲突，未豁免 |

越线自查：没有改 A 组件/token、B 采集、D 导航壳或生产配置；HANDOFF-CLAUDE-2026-10-19.md 为用户预存文件，未触碰。开发服务器、Metro 与专用模拟器已关闭；3000 端口未动。仅本地提交，无 push。主会话独立复核、像素余项轮⑪、外部联调及上述架构决定仍未完成，本报告不宣称 R18c 收口。
