# 公开活动与本人目标匹配：后续批次提案

状态：主任务已批准本文列出的5个产品/测试文件及文档，在 R 交付/review 后由同一 Luna max 编码、Astra 独立 review。2026-09-17，W3。F 已独立验收，R 正在收尾；本文不扩大 R 产品改动范围，不授权 W5 页面接线。

身份依赖已核实：主任务/W1探针及W3源码复核均确认 profile owner 是 accountId。`profile/live-service.ts` 的 currentProfile 按 profile.accountId 查找，provider 的 readProfileGraph 按 payload.accountId 和记录 userId 校验，W1实测 raw profile ID 读 empty，resolver 映射 account 后可读真实资料。主任务确认继续 explicit live + accountId 原接线，不改 profile 后端或增加任意 raw 双读；不据此宣称历史错误 raw 资料已经迁移。

## 已确认的产品边界

读取本人明确填写的 relationshipGoal，在公开、已发布、有 publicCode、尚未开始的真实活动中，先排除本人主办和已经报名的活动，再做文字匹配，最多返回三条。目标未填写、没有匹配、读取失败分别呈现；始终可浏览全部活动。不生成百分比、AI 标签、群体或人脉假设，不以 owned/registered 旅程充当推荐。

## 源码事实与复用选择

- `features/events/core/public-catalogue-runtime.ts` 的 configured catalogue 已提供真实 `readRecords()`：records、organizerIds、publicCodes、participantCounts 与 generatedAt。直接复用该读取，不修改 EventDTO，不另造公开目录。目录当前对缺失人数摘要抛错；本批沿用失败边界，不将读取失败变成无匹配。
- `features/events/core/event-recommendation-reader.ts` 已投影掉 organizerIds/publicCodes，不能独立满足排除主办和链接规则；无需为首页需求扩大其共享快照。
- `features/events/event-recommendation-tool.ts` 已有 `tokensFor` 和 `textMatchesToken`，拉丁词使用词边界以避免 AI 命中 Kansai，并排除英文常见虚词。现有通用工具还合并 owned 活动、允许直接 ID 查询及近似候选兜底，且 eventText 包含默认 preparation/action；其输出不能直接作为严格推荐。
- 最小复用是从上述工具新增一个纯文字匹配导出，只返回 matchedTokens，内部复用原有词法函数；原 recommend、candidateFor、评分和返回契约不变。新严格服务仅把真实 title/description 传入该函数，排除系统生成的 preparation、nextAction、source label 与 ID。不要用伪造 eventService 或 reader 包装绕过通用工具分支。
- 目标取 `createProfileService("live").getProfile({actorId: accountId})` 成功结果的 `data.profile.relationshipGoal`。新 runtime 显式选择既有 live 实现：非生产环境缺 mode 时 factory 默认 mock，不能把样例目标混入真实目录。缺 live profile provider 继续失败关闭。`getSelfProfileForAi` 不含该字段；完整 profile route 会引入不必要的简历和信号读取，不作为本批入口。不得回退到 industry/headline/defaultGoal。
- 成员排除复用 `createConfiguredEventOperationsRepository().listCanonicalRegistrationsForUser(accountId, eventIds)` 一次批量查询，匹配同 actor/event 且 status=rsvped。API 使用现有身份解析器的 canonical account ID；register/page 的同一接线正在 R 修复。
- `canonical-participant-event-journeys.ts` 当前接口及注释显式使用 rawSubject，且其便利封装在 runtime 缺失时返回空数组。它不能作为本批 fail-closed 排除依据；本提案不修改该共享读取器，也不顺带修复首页旧旅程。将此身份差异交主任务/W5 单独跟踪。

## 最小服务及返回模型

新增严格服务依赖：本人目标读取、公开目录快照读取、批量本人报名读取、固定 now。runtime 组装既有 configured providers；测试注入这些窄依赖，不调用付费模型或外网。

1. 输入必须是已解析的 canonical account ID。读取本人 profile，失败返回 unavailable；空白目标返回 needs_goal，不执行候选匹配。
2. 读取公开目录。公开/发布权限由 canonical catalogue 保证，publicCode 本身不是公开授权。按有效 startsAt > now、有效 endsAt > startsAt、有 publicCode、有效 organizerId 不等于 accountId 筛选；按 canonical event ID 去重。缺失/非法 owner 或其他必要元数据不能证明候选合法，应 unavailable，不静默转成 no_match；重复 ID 的 owner/publicCode 冲突也不能任取首条。
3. 对候选 IDs 一次读取 canonical memberships。runtime 缺失或读取失败返回 unavailable；错 actor、非候选 event 或不合法 status 也返回 unavailable，错误结果不透出其他 actor。不能把未知/非法报名状态当成未报名。合法 cancelled 不排除。
4. 先排除 rsvped，再对目标与 title/description 做匹配。matchedTokens 为空的活动不进入结果；无匹配返回 no_match，不走 closestAvailable。
5. 建议稳定排序：命中的不同目标词数量降序、开始时间升序、canonical ID 升序，最后取前三。排序数字仅内部使用，不展示为质量或成功概率。
6. 返回 Web 所需最小字段：eventId、publicCode、title、description、startsAt、venue、matchedTokens、sourceEvidenceIds。理由仅表述“活动介绍包含你的目标关键词：…”，不能扩写为保证认识某类人或获得特定价值。canonical evidence anchor 只代表事件记录来源，不冒充外部引文。

返回状态建议 `success | needs_goal | no_match | unavailable`，success 中 items 为 1–3 条；无目标与无匹配不共用措辞。W5 负责页面展示和“浏览全部活动”链接，本批不改其 dashboard、首页布局、共享 CSS 或现有首页读模型。

现有词法匹配对连续中文/日文句子只做字串匹配，不是语义匹配，可能漏掉表达相近的活动。本批不引入分词词库或模型来掩盖此限制，文案也不宣称智能语义推荐。主任务若希望扩展语义能力，应另立评估与数据边界。

## 已批准的精确文件范围

以 repos/orbits 为根：

| 文件 | 拟议改动 |
| --- | --- |
| `features/events/event-recommendation-tool.ts` | 新增纯文字 matchedTokens 导出，复用私有词法函数，原消费者行为不变 |
| `features/events/public-goal-recommendations.ts`（新增） | 依赖注入的严格筛选、排除、匹配、排序和状态模型 |
| `features/events/public-goal-recommendations-runtime.ts`（新增） | 组装现有 profile/catalogue/membership providers，缺配置失败关闭 |
| `tests/services/public-goal-recommendations.test.ts`（新增） | 精确规则及非目标用户隔离 |
| `tests/services/public-goal-recommendations-runtime.test.ts`（新增） | canonical actor、providers 缺失/失败及批量读取接线 |

原通用工具现有 capability/catalogue 测试作为行为回归门禁，默认不编辑。W5 需要调用的新服务接口先交主任务确认，接线文件由 W5 给出并独占。实施前对既有工具目标符号做 impact/context；新增符号 UNKNOWN 用 rg 确认真实消费者，不能用未解析调用边宣称零影响。

## 必需验证矩阵

- raw profile ID 与 account ID 不同；profile 和 membership 只读取 account；他人 membership 不能排除本人候选。
- 无目标、不含有效词、无匹配与 provider 失败状态分离；未请求模型，未访问外网。
- publicCode 缺失、非未来、非法时间、本人主办、本人 rsvped 在匹配之前排除；cancelled 不当作仍报名。
- 缺失/非法 organizer、同 ID 的 owner/publicCode 冲突、membership 错 actor/越界 event/非法 status 都失败关闭；不泄露其他 actor，不当成合法 no_match。publicCode 存在不能替代 canonical catalogue 的公开授权。
- 默认 preparation/action 或 ID 含目标词而 title/description 不含时不能命中；AI 不命中 Kansai。
- 至少五条真实匹配中前三稳定；前三个原始候选恰好已报名时，仍从剩余候选补满，不能先截断再排除。
- 同 ID 重复、同分/同时间排序、正确来源与链接；不用固定热门活动填空。
- 原通用 recommend 的直接查询、owned 合并和 closestAvailable 回归不变；共享 DTO/API/schema 无 diff。
- 实际本地普通页面验证需待 W5 接线完成后执行，不以服务测试冒称首页端到端验收。
