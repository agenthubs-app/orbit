# R18a 画板预检（SC-01，施工前）

2026-10-18；依据 PLANNER rev2 §9.1–§9.3；起点 `1524d3667`。本表仅登记画板与依赖，不表示产品或像素验收通过。

## 已执行检查

- 改前：`board-preflight.mjs --design b5-me-inbox.html --board-index 14,15,16,18,19,20,21,22,23,24,25,26,27,28,30,31,66,68,70 --rev 1524d3667 --no-variants --no-bundle --limit 3`。19 个原画板，近似 token 8、缺 token 93、疑似数值不自洽 0、疑似无功能 15。
- 改后 Web：`board-preflight.mjs --suite scripts/visual/views/web-R18a.json --no-variants --no-bundle --limit 3`。22 个画面登记全部找到，近似 token 8、缺 token 65、疑似数值不自洽 0、疑似无功能 23。
- 结构检查：b5 / b12 的内联脚本全部可解析；17 块补画、34 个画框，每块浅 / 深各一框，渲染无脚本错误；补画无撤销承诺。
- App 改后：C App 原始全量基线结束后执行 `board-preflight.mjs --suite scripts/visual/views/app-R18a.json --no-variants --no-bundle --limit 3`。12 个画面登记全部找到，近似 token 3、缺 token 84、疑似数值不自洽 0、疑似无功能 11。
- 完整 JSON、自动数据项表及日志：`/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/preflight-{before,web-after,app-after}.{json,md,log}`。未跑像素门禁或模拟器验收。

## 五项结论

| 项 | 结果 | 依据与待办 |
| --- | --- | --- |
| 1. 画板自洽 | 已检查 | 自动数值提示 0；25% = 会社・役職，50% = 再加力になれること，100% = 四项完整。缺项为 3 / 2 / 0，均 +25%；照片不计分。补画逐字段提案总数维持 b7 的 6 件 / 10 项。 |
| 2. 元素有数据来源 | 部分待定 | 逐项映射见下表。无源统计已按 §2.15 删除；其他新发现缺口不擅自扩大改稿范围，报主协调。 |
| 3. token 齐 | 待组件库 | 原稿及补画保留 kit 的精确数值；自动报告列出 8 类近似和 65 类缺值。A 线拥有 token 与组件，本线不补 token、不在页面近似修正。 |
| 4. 组件对齐 kit | 待 R31a / R31b | Toggle、Segmented、MacTile、Drawer 等使用现有组件，新增参数按 R31a / R31b 契约接入；不在页面修组件内部样式。 |
| 5. fixture / 断点 / 状态 | 已登记，待实现 | Web 1440 / 1024 / 390 浅深、App 原稿指定主题及 S30 / S31 浅深已登记；开发状态 hook 和语言 / 外观区域的精确坐标待实现后验证。fixture 尚未加入运行时，不能当作业务完成。 |

## 数据来源逐项核对

| 画板元素 | 接口 / 字段或决定 | 状态 |
| --- | --- | --- |
| 完成度、缺项、每项 +25% | SC-02 待加 `completeness.card.{score,items}`；四 key = companyRole / offering / seeking / intro，旧 score 不变；card 缺失只退回旧分数。 | 待 SC-02 |
| 提供 / 求め标签、会社・役職、自己紹介 | `GET /api/profile`；编辑经现有 `PUT /api/profile`。 | 现有接口 |
| 求め AI 候选及根拠 | `/api/profile/seek-suggestions` 当前仅 `suggestions: string[]`；没有根拠字段时整行不画（PLANNER §6）。测试 mock 模型。 | 候选可用；根拠无源 |
| 公開する項目 | SC-02 待加可选 `publicFields`；旧 PUT 不带时保留已存值；固定邮件 / 电话交换后显示。 | 待 SC-02 |
| 今月の閲覧、名刺交換统计 | profile / connections 未发现专用计数；connections 是关系证据列表，不能冒充交换总数。按 §2.15 删除两个统计格。 | 已改 b5 #16 / #20 / #66 |
| 主催したイベント | `GET /api/events/center?summary=1`；App 原样调用 `HostEventsRow`。 | 现有接口 |
| 参加するイベント | `GET /api/events/mine` 的未来活动；0 件隐藏，目标深链 `?tab=going` 待接线核对。 | 待接线 |
| 受信箱未读 | 只读现有未读接口；失败仅隐藏该行。 | 待接线核对具体字段 |
| Gmail 读取范围 | `features/integrations/contract.ts`：`gmail.metadata.readonly`，件名・相手・日時，不读本文 / 不保存草稿。 | 已改稿 |
| 連携状态、解除 | `/api/integrations` / `[provider]/health`；`IntegrationAuthorization.status / healthStatus / lastCheckedAt`；解除用 DELETE。 | 现有接口，仅用替身 provider 验证 |
| 最終同期、128スレッド、今週の面談 4件 | 当前 integration 契约仅健康检查时间，未见实际同步时间 / 导入数来源，不能用 lastCheckedAt 冒充。 | 新缺口，待主会话代定；未扩大 b5 改稿 |
| 同期の履歴、上线通知、Gmail 草稿保存 | 按 §2.15 删除，Google 連絡先只显示準備中。 | 已改稿 |
| iOrbit 记忆、日期、来源、删除 | `/api/agent/memory`：`content / source / createdAt / updatedAt`；source 仅 manual→メモ、conversation→iOrbit との会話；删除调用现有接口。 | 已改面談メモ来源标签 |
| memory/settings 两开关 | 原 b5 #25 / #30 未画对应开关；现有设置 API 保留，界面不增控件。 | 交接后续，不改接口 |
| 現在の目標 | 计划 v2 `PlanV2Detail.goal / startsOn / content`，変更进入计划目标编辑。 | 待接线 |
| 第6週 / 24週、サブ目標 | 计划 v2 契约未找到相应周数 / 总周数 / 子目标专用字段；不得使用画板常量当 live。 | 待主会话代定 |
| 意味検索 | `semantic.available` 控制整卡；本机 `orbit.search.semantic` 只写 on / off，复用 R30 搜索读取。 | S02 / S31 已补画，待实现 |
| 更新の提案来源、逐字段反映 | live `chat / activity / contact`；名刺 / 経歴書来自现有 extraction 草稿，选中项经 PUT profile；联系人卡只出 fixture。 | 服务端枚举不变，待实现 |
| 更新撤销说明 | 没有撤销接口；S04 / S14 / S25 删除此承诺。原 b7 不在本线可改范围，#46–51 的撤销文案请求协调者改稿。 | 已通知主协调，原 b7 保留 |
| 公開プロフィール共通点 | 设计示例块 + サンプル，仅 fixture；不冒充 live。 | 待 fixture |

## 改稿与补画清单

b5：①Web 子菜单付费项；②App 付费行；③NFC 分组；④25 / 50 / 100 与四项完成度；⑤Gmail / 同期历史 / 上线通知；⑥100% 无源统计；⑦记忆来源。每处以「2026-10-18 主会话代定 §C-1（RD-33）· R18a」注释。原画板序号不变。

b12：仅末尾追加 `.g11`；标题 `W-R18a-01`–`04`、`W-R18a-10`–`14`、`W-R18a-20`–`25`、`A-R18a-30`–`31`。各块写出依据与「主会话代定 §C-1 · 待主会话复核认可」。1440 引用改后的 b5 / b7；1024 图标左栏、收起右栏；390 单列与返回标题，操作不被底栏胶囊覆盖。App 两块按原稿加参加行 / 意味検索。

## 门禁与外部依赖

Web 22 条 / 38 张、App 12 条 / 15 张登记在 `views/{web,app}-R18a.json`，未执行像素门禁。言語と外観的三条区域门禁坐标尚未填写；不得作为整板通过。App 无深色原稿的其他画面只截图，不新增门禁。

D 线导航壳先决提交：`56da437ef`（由主协调提供；本线未改壳文件）。R31a / R31b 合入之前不做像素收口。本表涉及的新缺口、A 线请求、原 b7 改稿请求在 REPORT 定稿时逐项转录。

基线由主协调在任何运行时代码改动前采集：Web 7475 项 / 6428 pass / 32 fail / 1015 skip；App 3323 项 / 3319 pass / 2 fail / 2 skip。Web 含 25 个显式缺 DB URL 失败；另有六类既存失败及 `doors (b12 W-R12-01)` 的 `kit .wmodal.w560` 首轮失败，后者正确的针对性重跑 2/2 通过，不能据此宣称全量通过。App 两个失败为英文词典键数及旧 joined-person 点击超时。原始日志在主协调的 `/var/folders/3q/sc3_n8917jn8w_j_jltbz_xr0000gn/T/orbit-cd-baseline.fk6V4SASy3/{c-orbits,c-app}.log`。

提交顺序例外（主协调明确确认）：不允许 stash / autostash。先 fetch 对照上游，按归属路径提交当前设计文件，再在干净工作树 `pull --rebase origin redesign`；有冲突只处理本线归属，绝不 reset / stash / push。

## 后续授权改稿：§C-1（2026-10-18）

上文保留 SC01 当时的检查与待定项，不代表后续状态。用户续行已明确采纳以下最小改稿；每处标注「主会话代定 §C-1」，不新增接口、组件或画板 ID。

| 当时缺口 | 本次决定与范围 |
| --- | --- |
| 原 b7 #46–51 撤销 / 变更履历承诺 | 现获准原位删除正文及操作注释中的不支持承诺；选择字段后反映和来源结构不变。 |
| b5 / b12 连携同步时刻、线程数、面谈数 | 只移除无 API 数据；Gmail 改用已有元数据读权限说明；保留真实连携状态及解除操作。 |
| b5 / b12 目标预算、期限、周数 / 总周数、进度、子目标计数 | 只保留实际 summary 的 goal 与已有修改入口，不以示例常量代替 live 数据。 |
| 原生日历权限 | 不加依赖、不重建；删去该权限行，保留相机 / 通知。Google Calendar OAuth 连携不冒充 OS 权限。 |
| 履历文件类型 | b7 / b12 示例从 PDF 改为已支持的文本；不宣称 PDF / DOCX 二进制解析。 |

本次改稿提交时，补充渲染预检尚在等待全机重任务锁；后续完成的结果记录如下。语法及 diff 结构检查不能代替渲染、像素或原生验收。

轻量登记回归发现 App suite 仍使用 `few / semantic / empty / many`，而运行时开发入口只接受 `25 / 50 / 100`。先观察 RED（4 项中 1 失败，A-R18a-08），再仅修正五个登记 URL；GREEN 4/4，另保留 12 个 ID、画板引用和主题矩阵不变。日志：`app-board-registration-{red,green}.log`。b5 / b7 / b12 各两个内联脚本可解析；b12 在 `.g11` 前的原始内容逐字节不变。大型快照首次读取超过 Node 默认 subprocess buffer（ENOBUFS），指定 16 MiB 后完成同一只读对照；不是产品或渲染失败。

### 后续渲染预检完成（非像素门禁）

在 clean `0bab5674d`、上游 `2569ad835` 上，经 `heavy.sh c` 连续完成 8 次 `board-preflight.mjs`（exit0）。改前使用同基底的 `--rev eb4cf4dd0`；改后读取当前文件。Web / App suite 与原 b5 的 19 个指定索引、b7 #46–51 分别前后核对，画板标识、尺寸、类型、主题均不变。

| 改后范围 | 登记 / 引用数 | 近似 token | 缺 token | 疑似不自洽 | 疑似无功能 |
| --- | --- | --- | --- | --- | --- |
| Web suite | 22 | 8 | 65 | 0 | 23 |
| App suite | 12 | 3 | 84 | 0 | 11 |
| 原 b5 目标索引 | 19 | 8 | 94 | 0 | 13 |
| 原 b7 #46–51 | 6 | 0 | 21 | 0 | 11 |

渲染数据来源行中，b5 不支持的同步 / 线程 / 面谈 / 周数 / 子目标文案为 13→0，b7 撤销 / 履历承诺为 5→0。原始 `preflight-c1-{before,after}-{web,app,b5,b7}.{json,log}`，suite 的逐项数据来源 `.md`，均在既有证据目录。自动提示不是已确认缺陷或 token / 组件通过，且这些引用互有重叠，不算 59 个独立画板。协调者只读审查本次 §C-1 diff 未发现阻塞；原生操作与像素验收仍 OPEN。
