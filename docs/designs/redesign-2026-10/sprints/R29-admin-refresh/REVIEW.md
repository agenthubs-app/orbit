# R29 独立复核 REVIEW

**结论：暂不通过。** SC-09 的 App 活动详情链未完成，SC-07 有首次断网入口回归；“自身新失败 0”缺少可核对的同基线对照。以下 S 为验收阻塞，**不表示问题由 R29 引入**。

## S

- **S1｜SC-09 活动详情断链。** `repos/orbit-app/src/screens/admin/AdminScreen.tsx:106` 仍将列表项导向详情；本机证据 `app/event-detail-probe.json:1` 显示 13 条列表记录的详情全部返回 404。先由活动详情归属线查清来源 ID 映射，再用同账号完成原生打开、返回链验证。

## M

- **M1｜SC-07 首次断网状态未落实。** `repos/orbit-app/app/admin/access.tsx:9` 使用默认 `probeOnOpen=false`；新登录屏不发后台请求，首次离线打开时 `OnlineOnlyBoundary.tsx:54` 没有探测来触发「需要联网」。启用公开入口健康探测并补冷启动离线验证。
- **M2｜SC-14 清单通过但内容失真。** `repos/orbit-app/tests/app-wide-route-coverage.test.ts:138` 仍将 `/admin/access` 记为 `AdminScreen`；`repos/orbit-app/docs/offline/page-inventory.md:82` 仍称它读取后台资源，`:118` 仍称 `/platform` 为审核队列。按实际登录屏、公开目录及 online-only 读边界更新。
- **M3｜零新增失败未获证实。** `repos/orbit-app/tests/i18n-domain-split.test.ts:23` 的新增域集合漏了 R29 的 `admin`；独立重跑该文件为 **2/3**，新增文案计入了已失败的旧快照测试。将 `admin` 登记为新增域，并以相同基线复测差额。REPORT 所用 Web“基线”实际在编辑后运行；全量记录仍为 Web **7 失败**、App **12 失败**，不能据此确认自身新失败为零。

## m

- **m1｜SC-05 对账证据粒度不足。** `web/W05-reconciliation-en.json:3` 仅存各分组相等的布尔值和行数。补可复查的逐字段前后摘要或差异，覆盖日期、字节、覆盖率、排序、趋势和报警。

## 核实通过项

定向重跑 App **23/23**、Web **13/13**。代码与记录支持 Web 公开入口、账号范围读模型、platform 封闭态及 read-cost 的授权和故障分流；R29 差异未改共享契约、outbox、同步字段、通用组件、token 或普通导航壳，未发现新增 PII 日志。两端路由文件仍在；无画板截图按例外处理，未冒报像素通过。SC-07 原生退出登录链、SC-09 详情链及全量零新增失败仍待验收。