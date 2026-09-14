# Sprint 0014 — 执行总结

## 目标实现情况

- 人脉列表、详情、关系搜索与邀请，名片摄入与复核，以及活动发现、详情和报名主链路已接入账号级中／日／英语言环境。
- 切换语言时保留搜索词、筛选、编辑草稿、OCR 修订和报名答案；姓名、公司、活动标题、题目、稳定 ID 与服务端业务文本仍按原文处理。
- 默认中文导航与既有可访问标签保持兼容；窄屏、深色模式和双倍字号下的主要入口与操作目标已通过真实渲染交互检查。
- 本轮未调用 OCR、模型或其他付费 provider，未修改报名资格、联系人权限、OCR 结构或服务端业务规则。

## 运行记录

- 目标／原需求：R-12 第二组；SC-0014-01～04。
- 结果：completed。
- run：run-01；Generator owner `/root`；2026-09-15 06:05～07:30 JST。
- Planner revision／SHA256：revision 1；`19628ee910d5240c8114b686cc15c95392359fd3f06d7ad134916362c64758b9`。
- 基线 HEAD／承接的脏文件：`caf533bb8`；运行登记提交为 `42edbdc15`。用户未跟踪的设计 PNG/zip/目录、`repos/orbit-app/prototypes/` 和 `.gitnexus` 全程保留且未暂存。
- 被验收的最后功能 HEAD：`9761b343dcf9db4caff14b470879b02fd26b0700`。
- 原环境／账号角色／设备：本地 Node 测试环境、React Native Web 真实路由渲染；合成 actor／联系人／活动／报名与名片数据，provider keys 清空。未使用生产账号或真实业务数据库。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 人脉、邀请、名片和活动三语 chrome；动态语言切换与 literal 业务数据边界 | `src/i18n/**`、`src/screens/contacts/**`、`src/screens/events/**`、`src/components/BusinessCardBatchReviewForm.tsx` | `9761b343d` | 01～04 |
| 联系人、关系搜索与报名状态 view-model 按语言投影，保留默认中文和请求／ID 不变量 | `src/view-models/contacts.ts`、`relationship-search.ts`、`event-registration.ts` | `9761b343d` | 01～04 |
| 三语字典一致性、动态切换、脏稿、payload、布局及旧源码契约回归 | `tests/app-locale-relationships-events.test.tsx` 与受影响直接测试 | `9761b343d` | 01～04 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0014-01 | pass | 人脉列表／详情／邀请真实路由，三语 chrome、成功／错误、搜索与返回导航 | 人脉定向组合与完整 App 回归通过；姓名、公司、关系原文保持 literal。 |
| SC-0014-02 | pass | 单张／批量名片入口、双面复核、冲突来源、脏 OCR 编辑与确认 payload | 名片定向文件通过；切语言后字段值、来源选择、card/item ID 和提交体不变；新增 OCR／模型调用 0。 |
| SC-0014-03 | pass | 活动目录组合筛选、详情、报名状态／动作、必答／选答与失败保稿 | 活动定向文件通过；切语言后 query、筛选、活动 ID、题目与答案不变。 |
| SC-0014-04 | pass | 动态 locale、长业务字段、320/390/宽屏、dark、1.6～2.0 字号与操作目标 | 相关真实渲染交互通过；默认中文兼容修复复验通过，完整 App 2753/2753。无原生专属代码改动，未另做实体设备验收。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC |
| --- | --- | --- | --- |
| 0014 目标组合：contacts、card、events、registration、新三语测试 | 最后产品 diff，2026-09-15 | exit 0；197/197 | 01～04 |
| 首轮 App `npm test` | 最后产品 diff | exit 1；旧固定中文源码断言 11 项、概览／返回标签兼容 4 项失败 | 01、03、04；如实触发有限修复 |
| 源码 locale 接线与默认中文导航／布局失败复验 | 最后产品 diff | exit 0；37/37 + 5/5 | 01、03、04 |
| 第二轮 App `npm test` | 最后产品 diff | exit 0；2753 pass、0 fail、0 skip；宿主存在 Google/DeepSeek 变量，因此不作为零-key 最终证据 | 01～04 |
| 最终 App `npm test`，显式清空 OpenAI／Anthropic／Google／Gemini／DeepSeek keys | `9761b343d` | exit 0；2753 pass、0 fail、0 skip；329079ms | 01～04 |
| `npm run typecheck`、`git diff --check` | 最后产品 diff | exit 0 | 01～04 |

本 Sprint 因共享 view-model 与报名／名片写入消费者按 H 档执行完整 App 回归。首轮失败均来自迁移后旧源码硬编码断言或默认中文标签兼容，不是通过放宽行为验收掩盖：源码测试改为验证 locale key 接线，产品补回专用“添加人脉”和列表返回标签；受影响用例先通过，再取得两轮 2753/2753。最终一轮命令显式清空全部 provider key，作为完成门禁。

未运行生产部署、真实业务账号／数据库、实体 iPhone 相机与付费 OCR／模型。0013 已证明同账号语言偏好跨设备回读；本轮只消费该稳定 Context，不重复写语言服务端。全部 provider key 在全量测试环境中清空，新增外部调用与费用均为 0。

## 交接

- 0015 可复用新增字典、`useOrbitLocale` 和 view-model 的可选 language 参数；只能翻译产品 chrome／已知枚举，聊天、事项内容、日期字段及用户输入继续 literal。
- App 最后功能版本为 `9761b343d`；Web/API 本轮无产品改动，仍使用 0013 的账号语言偏好服务 `cc3930449`。
- 无活测试进程、临时数据库或测试数据写入。用户未跟踪设计素材、prototype 与 `.gitnexus` 未纳入提交。
- GitNexus unstaged 扫描误映射到未改 AGENTS/CLAUDE 文档，staged 扫描又返回 0 changes，与 Git 暂存清单冲突；未把该结果当低风险证据，按实际 32 文件 diff、预改 impact、定向回归和完整 App 回归审查。
- 回退应精确反向处理 `9761b343d`，不得清理用户未跟踪文件。
- 下一步按依赖启动 0015；0014 的 `ContactsScreen` 与共享 App 字典锁已释放。真实实体设备和跨端共同环境的系统级验收仍由 0016／0017 承接，不重复计入 0014 本地完成。
