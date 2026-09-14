# Sprint 0007 — 双面名片与一次创建执行报告

## 目标实现情况

本轮已提交双面名片的本地跨端实现：用户选择一张正面和可选反面，App 按同一 `cardId` 聚合两面图片与 OCR 字段，冲突必须明确选择来源或手工填写；确认请求绑定稳定意图、两面版本／摘要快照和字段来源。服务端在事务内锁定整卡，只创建一个联系人，把两面标成同一 `confirmedContactId`，并保持旧单面客户端的原有指纹与确认行为。

本地契约、交互、账户隔离、重拍失效、幂等重放、双击／并发和原子清理均已验证。Sprint 仍为 **blocked**：实体 iPhone 离线，没有共同 API/OCR 环境、真实非空批次、已授权联系人对象和 Web/App 同记录回读证据，不能用 Simulator 或隔离 PostgreSQL 冒充 SC-0007-01～05 的实体与真实链路验收。

## 运行记录

- 目标／原需求：R-07／B5；同一张卡正反面经过来源复核后只创建一个联系人。
- 结果：**blocked**；`run-01`，run_count = 1。
- Generator owner：当前主代理 `/root`；2026-09-14 启动，2026-09-15 01:05 JST 结束本地实现与验证。
- Planner revision／SHA256：`1`／`05b1e519f405a25ef4da034abd1115cf5f4c501c5552448efa9e56bc013ede46`。
- 基线 HEAD：`fca77373f123c03e29a0584cba46bade5f5eb907`；D 线工作树起始无产品脏文件，另一原始工作区的其他线路改动未覆盖。
- 被验收的最后功能 HEAD：`0a1ca09a46dd996d1e48aad19112213211c440b0`。
- 环境：Node `v25.8.1`、npm `11.11.0`、隔离 schema 使用本机 `postgres:///postgres`；没有运行真实环境迁移。
- 设备：实体 iPhone `shinhaha (26.2)` 为 offline；Simulator 可见，但不足以完成 Planner 要求的实体相机和真实 OCR 验收。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 双面 manifest、回执、确认意图／快照／来源 Schema，并同步 App 副本 | `repos/orbits/shared/{contract,api-schema}/business-card-batch.ts`、`repos/orbit-app/src/api/{contract,schema}/business-card-batch.ts` | `0a1ca09a4` | SC-01、02、04 |
| 卡片身份迁移定义、整卡锁与原子确认、旧指纹兼容、跨批次联系人身份隔离 | `repos/orbits/features/acquisition/business-card-ingest-v2/{contract,migrations,repository}.ts`、v2 `handlers.ts` | `0a1ca09a4` | SC-02、03、04 |
| App 正面＋可选反面采集、两面切换、冲突选择、来源展示、重拍／重 OCR 失效和整卡确认 | `BusinessCardIngestStartScreen.tsx`、`BusinessCardIngestScreen.tsx`、`BusinessCardBatchReviewForm.tsx`、两个 business-card view-model | `0a1ca09a4` | SC-01～04 |
| 契约、数据库、路由、交互、视觉和旧客户端回归 | 本提交的 App/Web 名片测试文件 | `0a1ca09a4` | SC-01～04 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0007-01 | blocked | App 双面 view-model 6/6、D 线交互 2/2、视觉复核 28/28 | 本地证明正面必选、反面可选、冲突不自动确认、字段来源和双面切换；缺实体拍摄及实体链路中的原图访问／过期证据 |
| SC-0007-02 | blocked | PostgreSQL API／repository 28/28；App 重试意图与回执测试通过 | 本地证明同意图、双击和并发只建一次，跨批次相同 client `cardId` 不碰撞；缺授权真实确认请求及两端重开同一联系人 |
| SC-0007-03 | blocked | MIME／摘要／版本／账号隔离、失败反面重试和重拍失效测试通过 | 本地边界通过；缺实体相机拒权、取消和重拍操作证据 |
| SC-0007-04 | blocked | App 全量 2603/2603，旧单面和离开／恢复回归通过 | 缺已初始化环境中的真实非空批次 GET、后台返回记录和原生截图 |
| SC-0007-05 | blocked | 未运行真实副作用链路 | 实体 iPhone 离线，且没有共同 API/OCR 配置、脱敏样本批次、授权联系人对象及累计费用回执 |

## 最小验证与未运行项

| 命令／场景 | 结果 | 范围／证据 |
| --- | --- | --- |
| App `npm run typecheck` | exit 0 | 最终工作树；`sprint-0007-app-typecheck.log` |
| Web `npm run typecheck` | exit 0 | 最终工作树；`sprint-0007-web-typecheck.log` |
| App `npm test` | 2603 pass，0 fail／skip／todo；exit 0 | 最终全量；`sprint-0007-app-full.log` |
| Web `npm test` | 2990 pass，51 fail，187 skip，0 todo；exit 1 | `sprint-0007-web-full.log`；51 个失败中 47 个与 `sprint-0023-seed-web-full.log` 的既有失败名称完全相同 |
| provider 隔离复验 | 63/63 pass；exit 0 | 清空 DeepSeek/OpenAI/Gemini/Google key 后，当前全量新增的 4 个失败全部消失；`sprint-0007-provider-isolation.log` |
| Web 共享 Schema | 38 pass，1 expected skip，0 fail | 双面字段、旧响应兼容及严格解码 |
| PostgreSQL API／repository | 28/28 pass；exit 0 | `ORBIT_EVENT_DATABASE_URL=postgres:///postgres`，每例隔离 schema；未迁移真实数据库 |
| `git diff --check`／GitNexus staged detect | exit 0／low | 28 个暂存文件；GitNexus 映射 27 个已索引文件、139 个变更符号、0 条受影响流程 |

首次全量期间数据卷空间耗尽，PostgreSQL 报 `No space left on device`；仅删除明确的 VS Code ShipIt 可再生缓存后恢复空间，确认没有残留测试 schema，再重跑数据库专项与最终全量。App 首次全量的 3 个失败来自旧视觉层级和 v2 请求体断言，更新为验证实际字段行及确认元数据后，定向 28/28、最终 2603/2603。

Web 最终全量的 4 个新增失败来自宿主机已有 `DEEPSEEK_API_KEY`／`GOOGLE_API_KEY`，测试只清除了部分 key，因而进入 provider 请求路径；隔离复验已证明不是 D 线代码回归。其余 47 个失败是既有审计／数据库环境基线，仍不记为通过。

## 交接

- 已验证成果：本地两面同卡、来源复核、整卡原子确认、旧单面兼容和 App/Web 契约同步；功能提交为 `0a1ca09a4`。
- 未提交改动：本报告、Sprint 登记表和 Bridge 交接将在独立文档提交中收口；没有 D 线测试进程或服务残留。
- App／API 影响：新 App 发送显式 `cardId`／`side` 和确认元数据；旧 App 仍按每图一张单面卡处理。服务端确认后回读 `confirmedFieldSources`；旧响应可省略该字段。
- 费用：原记录为 USD 0.012780／USD 5.00。最终 Web 全量至少有 4 个用例进入外部 provider 路径；日志未给 token／费用，首次中断轮是否也执行到同一区段无法确认，故本轮增量 **待核算，不能记为 0**。隔离复验无 provider 请求。
- 未执行：真实环境迁移、真实联系人写入、部署、push、merge、实体 iPhone 操作和 SC-05 端到端。
- 回退：需要撤销本地功能时可审阅后执行 `git revert 0a1ca09a4`；迁移定义已提交但未对真实环境 apply。
- 关闭条件：实体 iPhone 在线；提供同一可用 API/OCR 环境、授权账号和脱敏双面样本；完成拍摄→OCR→来源选择→一次创建→Web/App 重开，并记录版本、卡／联系人脱敏 ID、图片生命周期和实际费用。
