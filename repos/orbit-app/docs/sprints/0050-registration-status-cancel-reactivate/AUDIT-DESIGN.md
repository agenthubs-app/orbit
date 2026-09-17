# 0050 中文设计与问题证据

## 问题从哪里来

2026-09-16 用户提供活动详情截图，要求纠正“暂不可操作”，支持取消与再次报名。ROOT 已按 orbit-root 当前索引及源码核对；主线 HEAD 为 8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5，Phone 固定功能基线为 dd2ae559c73396f4911c302bbe88801ab9300941。

1. App event-registration.ts 的 eligibilityCopy 把 unavailable 统一映射为“暂不可操作”和“刷新成功前不会提交”。Phone canonical-event-detail.ts 又映射为“报名资格暂不可用”，丢失业务限制与网络失败的区别。
2. 服务端窗口 provider 把缺失正式截止时间的 canonical 活动识别为 canonical_misconfigured，availability 变 unavailable；eligibility.reason 目前仅重复 state，客户端没有准确的配置原因。已经成功 GET 200 的配置问题不能承诺刷新能解决。
3. 主线取消 service 仍把 canonical_misconfigured 和 legacy_importing 一并拒绝；cancel route 的该异常没有完整 JSON 化。Phone 原有八路径修复历史实际 25/25、types0、十条取消回读成功；本次规划期间已取得唯一正式提交 f7c8a15123b78cfa732db10c7642573b921f3dfe，ROOT独立核对八路径stat，逐blob等于原冻结回执。该修复尚未合主线，不把私有 patch 或旧实际取消当本次重新报名验收。
4. 服务层和 eligibility 已有 cancelled→reactivate 语义，开放时返回 reactivate；新需求重点是两端入口、确认、成功回读、版本与失败保护的完整闭环，不新建第二套报名系统。

## 用户看到的状态

| 正式事实 | 显示 | 可用动作 |
| --- | --- | --- |
| 正在读取 | 正在确认报名状态 | 无提交，避免闪现可报名 |
| 读取失败或响应校验失败 | 报名状态加载失败，请重试 | 重新读取；不猜已报名或资格 |
| 配置缺失被服务端明确识别 | 主办方尚未设置完整报名信息，暂时无法报名 | 无新报名；如另有已验证 cancel 权限，取消入口仍单独显示 |
| 尚未开放 | 报名尚未开放 | 有可信开放时间才显示；不推算 |
| 已截止／资料冻结导致公开报名关闭 | 报名已截止，不能再次报名 | 原有本人取消权限独立处理，不靠报名 CTA 隐藏 |
| 活动取消／结束／名额已满 | 活动已取消／活动已结束／名额已满 | 严格按服务端 allowedActions，不新增例外 |
| 已报名且允许 cancel | 已报名；取消报名 | 点击后显示确认，失败保留原状态 |
| 取消成功，开放且允许 reactivate | 已取消报名；再次报名 | 打开本活动报名页，明确确认后正式 reactivate |
| 取消成功，但重新报名被限制 | 已取消报名，加具体限制说明 | 不假启用；不承诺取消一定能重报 |

取消确认：“确定取消这场活动的报名吗？”附提示：“再次报名需满足活动当时的报名条件。”不承诺退款、通知、日历或资料清空。合法旧答案可回读供用户确认，但不伪造新签名 questionToken，不隐式提交或自动调用模型。

## 设计边界

- 新增细分原因由服务端正式窗口／资格读取产生；不能通过空 policyVersion、标题、HTTP 200 或客户端日期猜配置缺失。reason===state 的旧契约继续保留。
- 必要时添加可选 blockingReason 枚举：configuration_required、migration_in_progress、invalid_window、temporarily_unavailable。没有可信细分原因时显示“暂时无法确认报名状态，请重新读取”，不冒称主办方缺配置。
- 已报名事实与新报名可用性分开；活动状态、actor／workspace、membership、expectedRegistrationVersion、单飞、晚 ACK、资格刷新和真实 mutationReceipt 不放宽。
- cancelled→rsvped 复用已有 reactivate 正式路径，保持同一 registration／participant profile 的既有恢复语义。不靠 delete/recreate、直写数据库、伪 seed 或修改活动日期绕过门槛。
- admission 的 withdraw/apply 继续原规则，不把 legacy reactivate 偷渡到审批报名。配置缺失时只允许原取消修复明确支持的本人已有 membership 状态切换；新报名 gate 保持。
- 中／日／英产品文案对应自然语言，业务原文不翻译；PhoneWeb 和 App 共用普通 Screen/VM，浏览器专用实现不整块复制到原生。

## 风险与批准

用户已直接要求设计 Sprint 并分配实现，沿用 RULES 第0节必要本地接线批准，不重复文件审批。真实业务对象／服务窗口仍由 ROOT 与 Phone 协调者精确登记。

ROOT 上游分析：eventRegistrationToView 4直接调用者，含报名屏幕、旧详情模块和两个测试，0映射流程；deadline service 4直接消费者，17两层受影响项，含runtime、registration/cancel routes、Web报名/目录/运营；eligibility 1映射测试调用者，源码还存在registration GET实际调用；cancel route factory 2直接消费者。图谱均报 LOW，但动态派发和 Phone 新模块未映射不能算零风险。报名／取消／恢复写入按 H 保守处理，新增模块 UNKNOWN 源码补充；不得因此省略隔离与并发反例。
