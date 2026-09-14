# Sprint 0020 — 执行受阻，保留部分实现

## 目标实现情况

本轮没有完成全部 Sprint，也没有完成 0020。已实现共享二级行业字典、本人资料的保存与回读、Web/App 资料选择控件、服务层结构化搜索，以及尚未注册到 AI 的本人资料只读入口。

本地验证能够证明：有效父子行业可以保存并重新读取，切换一级会清空旧二级，省略行业字段的更新保留原选择，非法配对拒绝写入；资料回读失败保留草稿。它不能证明真实双端同记录验收、原生操作、联系人二级写入、AI 工具调用或全部测试数据补齐。

运行中发现冻结白名单漏掉了必需的 HTTP、provider、trace 和数据生成源文件。已停止这些依赖部分，没有修改冻结 Planner；联系人暂不支持的二级写入在 live 服务层明确拒绝。Web 全量也未达到 H 档通过条件。因此本轮代码保持未提交，不能作为已交付功能版本。

## 运行记录

- 结果：**blocked**；run-01 已结束，run_count = 1，不自动启动第二轮。
- Generator／协调者：当前主代理 `/root`；没有另派实现者或 Evaluator。
- 时间：2026-09-14 10:04～11:04 JST。
- Planner revision：1；SHA256：`529bd9a278bf357f59d4ba3ae8a7e7485b479dcc5fe4985f53efc13dd016dcd6`，执行结束时未改变。
- 起始／最后功能 HEAD：`808515a82`。本 run 没有功能 commit；下方证据针对该 HEAD 加本轮未提交源码，不把 HEAD 本身称为新功能版本。
- 原地 `chat-agent`；起始 tracked 工作树干净，既有未跟踪素材、prototype 与 `.gitnexus` 保留。
- 用户批准现有 0020 代码方案并要求连续实施所有 Sprint；这不扩展冻结生产文件范围、其他实质设计增量或真实副作用权限。

## 保留的源码

路径分别相对 Web `repos/orbits` 和 App `repos/orbit-app`；全部尚未提交。

| 部分 | Web | App | 当前边界 |
| --- | --- | --- | --- |
| 14／79 行业目录 | `shared/contract/industries.ts`、`shared/domain/industries.ts` | 对应 `src/api/contract/industries.ts`、`src/api/domain/industries.ts` | 通过现有同步脚本生成副本；三语标签、父子验证、稀疏合并 |
| 资料契约与保存 | `shared/contract/profile.ts`、`shared/domain/contracts.ts`、`features/profile/{contract,live-service,mock-service}.ts` | `src/api/{contract/profile,profile-detail-contract}.ts`、`src/view-models/profile.ts` | 保留旧行业文本；验证在写入之前 |
| 资料选择控件 | `app/(app)/app/profile/orbit-real-profile.tsx` | `src/screens/profile/ProfileScreen.tsx` | Web 从认证 GET 补读结构化字段；未改旧服务端投影；原生／真实跨端未验 |
| 联系人读取／模型 | `shared/contract/contacts.ts`、`features/contacts/{detail-contract,live-detail-service,mock-detail-service,contact-graph-query}.ts`、`storage/contact-live-record-provider.ts` | `src/api/contract/contacts.ts`、`src/view-models/contact-detail-editor.ts` | 读取投影保留二级 ID；live 二级写入受阻，不开放未接通的编辑 UI |
| 结构化搜索 | `features/search/{contract,fixtures,live-service}.ts`、`backends/basic-rules-backend.ts` | 未接搜索 UI | 各层数组内 OR、两层间 AND；HTTP 路由仍丢弃新过滤字段 |
| 本人资料 reader | 新 `features/profile/self-profile-reader.ts` | 无 | 认证 actor、白名单、无缓存／默认用户回退；尚未接 capability／registry／runtime |
| 行为测试 | 新 `tests/pages/secondary-industry-editors.test.tsx`、`tests/capabilities/{secondary-industry-records,self-profile-reader}.test.ts`；修改目录测试和资料页回归 | 新 `tests/secondary-industry-interactions.test.tsx`；修改 `tests/ink-signal-profile.test.ts` | 两项联系人验收测试保留可执行失败断言，并明确标为 TODO，不算通过 |

曾修改的 `features/contacts/live-service.ts` 和 `app/api/contacts/[id]/handler.ts` 已因超出白名单完全撤回；资料页 adapter 的试改也已撤回。最终根 diff 对这些文件为空。未覆盖用户改动。受阻联系人写入差异保存在忽略目录的 `blocked-contact-writes.patch`，不是已应用接口。

## 验收结果

| SC | 结果 | 证据与未完成部分 |
| --- | --- | --- |
| SC-0020-01 | 本地契约验证通过；H 收口未通过 | 79 子项参数化测试、父子错配／省略／清空、两端类型与同步通过；全局发布门槛未满足 |
| SC-0020-02 | blocked | 本人资料两端控件与隔离保存／回读通过；联系人 HTTP/provider 接线、原生与同记录真实双向写读未完成 |
| SC-0020-03 | blocked | 服务层过滤区分同父不同子；搜索 HTTP 接线与 profile.getSelf 注册、observation、synthesis、同版本真实调用未完成 |
| SC-0020-04 | blocked | reader 的 actor 隔离、空／失败、字段白名单和零写入测试通过；实际工具参数与 trace 隐私链路尚未实现 |
| SC-0020-05 | blocked | 只做了源码入口和实际 fixture 集合盘点；完整 executable inventory、正常数据映射／补齐、dry-run/apply 脚本、测试库写入与幂等回读均未完成 |

### 冻结范围的具体缺项

| 必需动作 | 证据／缺少的范围 | 为什么不能用现有部分代替 |
| --- | --- | --- |
| 联系人二级 HTTP 写入 | `features/contacts/live-service.ts` 只声明三个参数；`app/api/contacts/[id]/handler.ts` 不解析二级字段，均未列入 Planner | 不加类型断言掩盖契约缺失，不让界面假报保存 |
| 联系人详情完整 UI 接线 | `app/(app)/app/contacts/orbit-real-card-connection.tsx` 及其 `compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts` 不在白名单 | 独立 picker 文件不足以证明真实详情页带入／重开子项 |
| 搜索 HTTP 过滤 | `app/api/search/relationships/route.ts` 的 GET／form／JSON 解码仅复制旧字段，未列入白名单 | 后端孤立测试通过不意味着 App/Web 请求实际执行新过滤 |
| AI trace 脱敏 | `features/orbit-ai/live-conversation-trace.ts` 的 `sourceView(artifacts)`、`sourceView(conversation)` 与 conversation clone 保留完整输出，未列入白名单 | 单独配置 registry 的 redactObservation 无法阻止本人资料进入完整 trace；因此未注册新工具 |
| 生成数据补齐 | Web 生成文件标明不能手改；实际源在根 `harness/relationship_data_goal_runner.py` 和 `repos/mockdata` | 需要先补精确生成源／产物范围，不能只改生成结果；没有执行该生成器或任何 seed |
| H 档与资料页运行证据 | 本轮页面变化令既有“18 项已验交互”证据检查失效；历史审计缺口及数据库测试环境也未关闭 | 不修改审计断言充数，不将新单测当成全部旧交互的真实验收；需明确证据维护范围和适用基线失败处理 |
| 真实验收／数据更新 | 未获精确环境、workspace、actor、记录版本、原生设备操作及相应副作用许可 | 没有执行旧测试库补齐、迁移、部署、换号或清缓存 |

上述缺项需由 Planner 补充适用范围与接续方式；不能把本报告当成已批准的白名单扩张。

### 测试数据盘点结果

实际导入安全 fixture 注册表后，旧集合含 profile 1、contacts 2、networkPeople 2、attendees 2；默认生成集合含 profile 1、contacts 66、networkPeople 132、attendees 500。这些候选投影中有效完整父子对计数均为 0。它们不是去重人数，也未被全部判定为应补齐的正常对象。

当前关键词扫描得到 Web 121 个候选文件、App tests 29 个候选文件；扫描遗漏不带行业字段的正常构造器，因此不能视为完整覆盖证明。未导入带顶层 main／环境读取／数据库初始化的 seed 脚本。维护脚本还必须实现真正的版本条件写入，不能以普通 get→upsert 冒充原子冲突保护。

## 验证记录

证据目录相对 App：`build/harness-state/evidence/sprint-0020/run-01/`；日志在 `build/harness-logs/`，均被忽略。

| 检查 | 结果 | 范围／证据 |
| --- | --- | --- |
| 二级目录 RED→GREEN | 3 pass／2 fail → 5 pass | 全目录、三语、父子／非法值；不是只验一个示例 |
| Web 资料页、后台直接消费者与 reader | 19／19 pass | 实际 handler→memory store→回读；追加重开用例 1／1 pass；不是浏览器／真实数据库验收 |
| 联系人／资料／自然搜索相关四文件 | 16 pass、2 TODO | TODO 的两项仍执行并失败：联系人往返与 HTTP 二级字段；未算通过 |
| App 资料及联系人模型相关集 | 23／23 pass | 字段读取、草稿、请求、回执、非法配对 |
| App 资料完整浏览器交互文件 | 156／156 pass | 已含新行业选择和失败保稿；受控 HTTP，不是原生设备证据 |
| Web typecheck | exit 0 | 修复当前改动的 TS 窄化与隔离四参数接口问题后通过 |
| App typecheck | exit 0 | 完整当前 App 源码 |
| App 全量 | **2581 pass，0 fail／skip／TODO；exit 0** | `sprint-0020-app-full.log`；209.258 秒，包含同步检查 |
| Web 全量 | **2932 pass，51 fail，168 skipped，2 TODO；exit 1** | `sprint-0020-web-full.log`；228.423 秒；未通过 H 档 |
| Web 审计提交前源码对照 | 10 fail、1 pass；exit 1 | `sprint-0020-web-baseline-audit.log`；只读 HEAD 字节覆盖 29 个 tracked TS 文件，未替换工作区。10 项缺口在基线也失败；资料页 18 项检查在基线通过、本轮失败 |
| provider 环境故障定向复验 | 4／4 pass；exit 0 | 清空全部支持的 provider key、显式 Gemini、默认 fetch 拒绝保护；无产品代码修复 |
| 根 diff check／变更分析 | diff check exit 0；detect all 为 medium | 31 个 tracked 文件／88 个已索引符号／1 条联系人流程；新增符号需结合源码检查，未把索引未收录当成无风险 |

Web 51 项失败中，4 项与未完全隔离 provider 环境有关，已离线定向复验；10 项审计缺口经 HEAD 对照确认已存在；1 项资料页运行证据因本轮改变失效；其余 36 项在无数据库配置的测试进程中失败。168 项跳过及 2 项 TODO 均未作为通过。没有为此执行数据库初始化或修改无关生产模块。

## 费用与意外调用

此前累计费用 USD 0.012780，用户硬上限 USD 5.00，未重置或提高。

首次 Web 全量测试清空了一组模型密钥环境变量，但遗漏 `DEEPSEEK_API_KEY`。既有 provider 会回退至 DeepSeek，导致部分预期未配置测试进入 provider 路径，且会话／语言测试出现成功结果。测试未捕获实际 token 用量，**本轮新增费用待核算，不能写为 0**。测试进程已结束；在核算前停止额外付费调用。未打印密钥或修改持久化凭证。

随后通过默认 fetch 拒绝保护与完整空 key 列表离线复验，4 项通过。详见 `cost-reconciliation.md` 和 `no-provider-network.mjs`。这次意外调用不构成 SC-0020-03 的真实新工具验收。

## 交接与剩余整体任务

所有产品改动保留在原工作树，未执行功能 commit、push、merge、部署或破坏性回退。功能 HEAD 仍为 `808515a82`；报告／登记表单独进行 D 档文档提交。没有活跃测试进程或额外 Generator。恢复时先核对当前 diff，不删除本轮代码或既有用户文件。

当前没有可继续直接实施的已就绪独立 Sprint：

| 剩余任务 | 具体门槛及已做的独立核查 |
| --- | --- |
| 0003 | B1 字段、完成判定、旧账号策略及跨端白名单增量待审；源码与反例已写入 TECHNICAL_PREPARATION |
| 0009 | 已确认设备跟随方向，但旧 Planner 仍写账号优先；DST、全天、异常、脏稿的技术提案和进入条件未闭合，68 项既有日期基线已核 |
| 0005／0021 | B3 稳定 ID、首次保存、旧快照覆盖与恢复协议待审，已在隔离内存复现数据覆盖；分组管理依赖该基础 |
| 0004 | B2 历史 42P01 已定位，当前库／schema／迁移状态需精确环境许可；报名依赖 0003 |
| 0007／0008 | 双面图片生命周期和卡片级确认、身份绑定和站内投递属新跨端协议；技术准备已完成。摘要移除仍有原 Planner 明确的范围审阅门槛 |
| 0006／0010／0011／0022 | 依赖行业／可靠会话／时间／任务协议；B6 并发丢写已复现，入口和消费者清单已核，不能以旧不安全接口或 stub 代替 |
| 0012～0017 | 消息依赖双用户真实链路；语言来源与账号同步增量待审；原生和跨端验收依赖已交付主流程及明确设备／对象 |
| 0018／0019 | 原后期前置、B8 笔记权限、旧内容分类／迁移、建议接受协议未闭合；已确认产品入口不代替这些写入协议 |

现有执行指令和产品决定继续复用，不重复要求批准同一内容。详细证据沿用 [执行顺序与技术准备](../EXECUTION_ORDER.md) 的对应文档。本轮停止原因是以上实际门槛和 H 验证未通过，不是规划结束或等待逐 Sprint 的重复确认。单次 Generator 已结束；接续失败／受阻 SC 的计划与审批方式须显式处理，不自动克隆或重跑本 run。
