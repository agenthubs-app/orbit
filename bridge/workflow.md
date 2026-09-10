# 协作与验证流程

## 两人开发、Bridge 协调

| 角色 | 维护内容 | 交接给下一方的内容 |
| --- | --- | --- |
| Web/API 开发 | Web 页面、feature 服务、HTTP handler、共享响应/Schema | 行为变化、端点/方法、DTO 变化、权限/状态/版本规则、已跑测试及可用版本 |
| App 开发 | 原生交互、view-model、HTTP 消费、受控副本、平台能力 | 对应能力映射、缺少 API、刷新/缓存策略、旧版本兼容性、原生证据 |
| Bridge 协调 | 当前状态、差异队列、跨端验收与历史 | 明确下一责任方和关闭条件；不能替任一方声明未验收完成 |

Web agent 只在自己的目录工作时，可把 handoff 内容交回当前会话，由 Bridge 写到根目录；不要为了登记状态越过它的目录权限规则。

## 每次变化如何同步

1. 任务开始：读取当前 status/handoffs 和 Git 状态，识别相同文件是否有他人进行中改动；使用模板创建唯一 `BR-xxx`。
2. 明确变化：记录旧行为、新行为、受影响消费者和验收。如果仅 UI 变化，说明业务/请求是否相同；如果行为不同，不能归为纯样式。
3. 提供方完成：给出精确 commit 或可复核 diff、端点和测试，更新本端状态为 ready。总体最多 `source_ready`。
4. 消费方接手：契约变化后运行既有 `npm run sync:contract`，修 App mapper/请求/状态处理；请求类型未共享也要核对。通过本端检查后最多 `consumer_ready`。
5. Bridge 联验：按照 contracts.md 的双向回合核实真实持久化、刷新、授权、冲突和必要失败路径。证据对应具体两端版本与环境。
6. 完成交接：两端与验收状态均完成才 `verified`；更新 capabilities/status/history。明确接受的差异须记录批准来源；没运行就写未运行。

发布 API 前要考虑已经分发的旧 App：同步当前源码不能更新用户已安装的二进制。删除字段、收窄枚举、改变版本条件等变化必须给出旧客户端兼容/迁移窗口，未完成前不能声称发布就绪。

## 本轮可复跑的检查

下面均在所列目录执行。副本校验只读；domain 测试会在独立临时目录创建并清理同步夹具。不要为了状态盘点直接运行数据 seed、迁移或云同步脚本。

App，工作目录 `repos/orbit-app`：

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/route-parity.test.ts tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts
npm run typecheck
npm test
```

Web，工作目录 `repos/orbits`：

```sh
npm run typecheck
node --test --import tsx tests/contract-surface.test.ts tests/api-schema/mobile-contacts-dashboard-schema.test.ts tests/services/mobile-contacts-dashboard-service.test.ts tests/api/mobile-contacts-dashboard-route.test.ts
```

仅在批准的契约变化需要适配时，在 App 目录执行：

```sh
npm run sync:contract
```

Web 全量测试和构建按 [发布指南](../repos/orbits/docs/operations/free-beta-launch.md) 使用 Node 22 和专用隔离数据库；不能盲目加载日常 `.env` 后跑可能写库的整套测试。文档里的“21 失败”是历史基线，复跑后保留原记录并追加新结果。

## 快照更新

初始 JSON 是一次性只读盘点结果，不是会自行更新的清单。新增日期快照时至少记录：

- 根 Git SHA/分支、采集时间、两端 uncommitted 路径；目录聚合项不能当作单文件数量。
- 精确 Web `app/(app)/app/**/page.tsx` 与 App route 文件映射；排除 layout，剥离 route group，用 `/app` 前缀规则做比较。不得把 `orbit-real-*-page.tsx` 这种组件算成路由。
- 所有共享 `.ts` 源文件/副本 hash 与文件名集合，Schema 和两文件 domain 白名单分别核实。
- 命令、cwd、Node 版本、exit code、通过/失败/跳过数，以及未检查范围。
- 新发现的业务差异放进 handoff；只更新数字不能代替同步工作。

没有版本变化且现有证据仍适用时，不反复跑全量测试。出现新改动、失败或未解决风险，再选对应检查。
