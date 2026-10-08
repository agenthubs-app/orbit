- **P1 — `docs/sprints/W0034-runtime-allowlist-prod/PLANNER.md:121`（W34-4）**：方案已预见 Node ICU 78 与 PG ICU 67 的大小写映射不同，却仍允许把联系人搜索生产组合加入白名单，仅把探针失败后 30 秒退避期间可能漏项/重复列为“残余风险”。这与 GOAL 中“不会给出可能漏数据或重复的分页”以及 SC-W0034-03 的 fail-closed 目标冲突；而且同一存储游标不能保证两套不同匹配集合之间切换后的分页完整性。建议：联系人搜索新增字符的 `lower()` 差分必须成为硬阻断条件；若确有差异，就不要加入该生产组合，或先另行实现固定单一匹配语义/把匹配模式绑定进游标，使整段分页不能在 PG 与 JS 路径间切换。

- **P1 — `docs/sprints/W0034-runtime-allowlist-prod/PLANNER.md:88,119`（SC-W0034-01、W34-2）**：PG 判定只保留 `pgMajor=16` 和 ICU collversion，意味着在 PG 16 的任意后续 minor 上自动放行；但差分只在 16.15 上执行，方案没有证明 PostgreSQL minor 不会修正 ICU `lower()`、collation 调用或比较行为。`collversion` 只描述 ICU 排序数据，并不能覆盖 PostgreSQL 自身实现。建议：至少将白名单键改为经验证的 PG minor 范围或明确的 `server_version_num` 集合；若坚持只认主版本，应补充依据和跨 minor 差分测试，并把未知 minor 保持 fail-closed。

- **P1 — `docs/sprints/W0034-runtime-allowlist-prod/PLANNER.md:89,121`（SC-W0034-02、W34-4）**：新增字符探针只要求“跨页不漏不重、总数一致”和记录 PG/JS 差异，但未要求模拟真实的跨请求路径切换：第一页走 PG、随后探针失效进入 JS 回退，以及反向恢复。现有“fast and fallback pages share storage-order cursors”只覆盖旧字符，不能证明匹配集合不同时安全。建议：加入双向切换的多页测试，覆盖每个新增大小写字符和所有搜索字段；任何漏、重或 `summary.total` 与逐页集合不一致都应阻止联系人生产组合入表。

- **P2 — `docs/sprints/W0034-runtime-allowlist-prod/PLANNER.md:19,118`（事实 2、W34-1）**：`153.14 ↔ ICU 67` 的推断方向合理，但从 Neon `main` 分支 Dockerfile和 GCC 字符串反推已部署二进制的 ICU 构建并非充分证据；bullseye 源码编译只能复现同版本族，不能证明与 Neon 构建完全相同。建议：将结论表述为“高度可信的复现代理”，不要写成已证明等同；记录镜像 digest、PostgreSQL 源码 SHA、`ldd` 实际库、架构和探针输出，并以生产实际元组继续作为 fail-closed 判定依据。若 a2 失败退到 PG 16.9 的 a1，只能作为补充证据，不能宣称复现了 PG 16.15。

- **P2 — `docs/sprints/W0034-runtime-allowlist-prod/PLANNER.md:89`（SC-W0034-02）**：探针要求“覆盖 id、due、名字、组织、证据、标签字段”，但没有逐项规定哪些字段参与排序、哪些参与搜索匹配，也没有列出期望字符及预期路径；执行者可能只打印差异就满足文字条件，SC 不够客观可测。建议：把探针整理成显式矩阵：字符/字段/操作（排序或 lower）/PG 结果/JS 结果/页大小/预期集合，并规定每个矩阵项必须有断言，不能仅输出日志。

- **P2 — `docs/sprints/W0034-runtime-allowlist-prod/PLANNER.md:90`（SC-W0034-03）**：日志字段白名单本身不会泄露用户数据，但“日志抛错不影响原错误码”没有覆盖 `JSON.stringify` 或 `console.warn` 被替换、代理或测试桩抛错的情况；若日志调用先抛出，fail-closed 的稳定错误码会被改变。建议：将结构化日志封装为不抛异常的 best-effort 操作，并增加 `console.warn` 抛错时仍返回原业务错误码的单测；继续只从显式挑选的版本元数据构造对象，禁止直接展开数据库行、异常对象或请求上下文。
