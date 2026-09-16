# PhoneWeb 展示账号通知切换与演示案例交付

2026-09-16；用户明确要求在 PhoneWeb 展示测试账号执行旧通知切换，并添加投资人演示案例。本次是已有迁移/通知服务的操作交付，没有修改产品源码，没有重开0040 Generator，也不代表0046或实时发现/Push验收完成。

## 目标与版本

- PhoneWeb 工作树：`/Users/xzhao/Projects/orbit/.worktrees/phoneweb-main`，分支 `codex/investor-mobile-web`，产品/文档HEAD `3a05b812b`；不是声称该分支所有更新已合入chat-agent。
- 明确目标：本机数据库 `orbit_phoneweb_20260916`、workspace `workspace:phoneweb-demo`、合成账号 `user_orbit_primary_qa`。没有修改其他账号、其他库或生产云库。
- 前端32110同源代理到后端32100，Cloudflare Quick Tunnel继续使用现有临时HTTPS入口。前端静态产物未变；后端以Node22生产重建成功、重启新产物、health为200/live/ok。
- 新通知灰度只启用该actor；配置保存在本工作树受Git忽略的后端 `.env.local`，不提交文件或任何凭证。原模型/预算preload配置保持，构建时模型key显式清空。

## 旧数据与切换

切换前，当前actor有40条active旧“复核与……的下一步”模板通知、无inboxNotifications、无notificationCutover；actor白名单为空。旧内容来自生成测试样例，不是实时AI对最近业务数据的新发现。主包/PhoneWeb未启用新通知时退回旧列表，因此代码合并不会自动切换这个账号。

先运行现有迁移服务的零写入plan，验证数据库、workspace、actor、变更类型与标题允许列表。结果：仅40条旧泛化通知需要archive，没有处理中/未知投递阻塞。按用户授权apply批次 `phoneweb-investor-notifications-20260916`，generation=1、40条归档，切换已启用。迁移前后逐条核对原notes/tasks/reminderPlans/profiles的payload/lifecycle一致，未删除原业务内容；归档是可追踪、可按既有冲突保护规则回退的迁移，不是物理删除。

## 新增三个案例

通过已有领域服务写入两篇演示笔记和一项演示待办，再通过现有通知服务upsert三条持久记录。标题、原因、来源明确标注演示，不冒充真实外部消息或已验收的实时模型生成。

| 分类 | 标题 | 实际来源与交互 |
| --- | --- | --- |
| 提醒 | 演示：明天18:00前发送试点合作方案 | 属于该actor的真实持久待办；2026-09-17 18:00 Asia/Tokyo截止，可打开待办 |
| 建议 | 演示：先确认试点范围，再约下一次沟通 | 演示沟通纪要，包含两家门店、四周试点、负责人/指标待确认；可打开笔记，提供显式加入待办入口 |
| 动态 | 演示：试点合作方案的下一步已整理 | 演示方案进展笔记；可打开原文，不声称外部合作方真实更新 |

固定幂等前缀 `phoneweb-investor-demo-20260916`；重复执行回读同一3通知/2笔记/1待办，不产生重复记录，3条通知保持open/未读。

来源ID：`note:1fedcdec9dbe1952628e2ca7`、`note:545a1b8018aa913c07b715b6`、`task:87ae3146aa6413aab6f8a103`。通知ID：`inbox:b591708efd05cf89cb62c4388a3a98e9`、`inbox:b6a8059be3221978526b7f3767ed57b8`、`inbox:a59e206d87b7e975e1d3f4fea0ac7354`。这些是获准保留的展示数据，不是待清理的意外测试垃圾；后续清理只按该精确范围核验，不按标题通配删除。

## 实际验收与边界

Chromium390×844、zh-CN，新登录context分别在本地32110和当前临时HTTPS入口检查，下列5项各PASS：

1. 新通知列表enabled=true、3条记录/3未读、来源available；没有旧复核标题，没有横向溢出。
2. 提醒过滤→实际点击通知→详情→点击“查看来源”→真实待办。
3. 建议过滤→通知详情→来源→真实沟通纪要。
4. 动态过滤→通知详情→来源→真实方案进展笔记。
5. 刷新回读仍保留3条；pageerror=0。

第一次UI脚本停在默认“消息”页等待通知标题，超时；截图确认通知角标已是3，认证API也已返回3条正确记录。纠正脚本显式选择“通知”后完成上述本地/公网检查，未据此改产品界面。没有点击全部已读、处理/忽略或建议采纳，以保留展示状态；这些动作本次未验收，不把按钮存在计作写入闭环。桌面浏览器390px不是实体iPhone Safari证据。

生产build exit0，保留既有知识库route动态文件trace警告及Queue region警告，不称构建零警告。源码未变，不重复产品全量测试/typecheck；生产构建包含本次TypeScript检查。现有归档/来源/幂等代码证据仍参考0038/0040报告，不冒称本次新TDD实现。

本轮模型/OCR调用0、远程Push发送0。唯一原guard账本仍为12条、累计保守记账25,550 microUSD（$0.025550），累计上限$5；这是guard记账，不是provider账户余额/最终账单。没有初始化新账本或把演示记录当实时AI发现。

截图与脱敏manifest/UI结果保存在本机被忽略的 `build/phoneweb/notification-demo-20260916/`；工具排查/操作脚本在 `/tmp/orbit-notification-audit/`，非永久SDK。原始凭据、Cookie、数据库连接字符串和模型key未进Git。

## 为什么还没有持久远程部署

现有PhoneWeb部署交接明确先本地测试、后续由用户上线。此次检查Vercel CLI未找到凭据并自动进入登录等待，立即取消，没有完成认证或创建项目。尚未确认最终Vercel账号/team及两个项目/域名配对；前端转发模板还要替换成实际已部署后端HTTPS origin。当前业务数据仍在本机专属PostgreSQL，前端静态发布不会迁移它，需明确云数据库供应商/连接、workspace与可执行迁移目标及持久后台worker方案。

当前临时隧道是可访问的HTTPS演示，不是Vercel持久部署。基础DeepSeek“我是谁”已有PW-0006/0007的实时证据，不能再概括为整个App没有AI；但通知专用discovery provider/真实发现链与原生Push项目/注册/设备送达仍未验收。它们是对应能力的发布限制，不是静态演示站点部署不可逾越的前置；如仅上线演示，应显式保留演示标识并关闭未验收外发能力，而非宣称实时通知全交付。
