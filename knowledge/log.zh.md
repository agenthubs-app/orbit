# Orbit 知识库维护日志

## [2026-06-30] design | 建立 Orbit 文档库与知识库结构

- 根据用户目标设计 `knowledge/` 结构化知识库。
- 参考 LLM-maintained wiki 模式，采用文档库、主题 wiki、开发历史、learnings 和维护日志分层。
- 记录中文优先、来源可追溯、运行快照不进入默认文档库的维护规则。

## [2026-06-30] implementation | 文档库与知识库第一版

- 建立 `knowledge/` 知识库入口、文档 catalog、开发历史和 learnings 中文索引。
- 同步 `repos/orbits/shared/knowledge/knowledge-manifest.ts`。
- 新增 `/dev/knowledge` 可视化 Wiki 页面。
- 验证命令记录在 `knowledge/history/development-log.zh.md`。

## [2026-06-30] implementation | 文档库全量覆盖审计

- 将 catalog 扩展到 146 个文档条目。
- 扫描范围内未纳入 Markdown 降为 0。
- 为每个 catalog 条目增加中文审计依据，并同步到 app-local manifest 与 `/dev/knowledge`。
- 排除范围明确为运行快照、临时目录、依赖目录和参考项目。

## [2026-06-30] implementation | 文档新鲜度审计收敛

- 将当前 catalog 中 `needs-code-check` 条目降为 0。
- 为历史设计、feature DESIGN、mockdata、harness 和数据层文档补充代码/测试/历史定位证据。
- 保留 1 个 `known-stale` 旧组件级 sprint 设计，避免误当成当前权威。
- 收紧 catalog 测试，防止当前 catalog 再残留未审计 freshness 占位。

## [2026-06-30] maintenance | 记录 LLM Wiki 参考模式

- 在 `knowledge/schema.zh.md` 记录 Karpathy LLM Wiki 参考来源和 Orbit 映射。
- 明确 Orbit 知识库采用可审计 Markdown/catalog/manifest 层，不引入 RAG、embedding 或向量数据库。

## [2026-06-30] implementation | 可浏览知识库 Wiki Explorer

- 将 `/dev/knowledge` 从摘要页升级为可交互 Wiki Explorer。
- 页面可查看全部 146 个文档条目，并提供搜索、筛选和详情面板。
- 知识主题、开发历史和经验库在同一页面保留入口。
- 运行时仍只读取 app-local manifest，不读取父目录知识库文件。

## [2026-06-30] implementation | 真实 Wiki 风格浏览工具

- 根据用户反馈移除 dashboard/list 呈现方式。
- 将 `/dev/knowledge` 改为 wiki shell：顶栏、左侧全站导航、中心文章、右侧目录和 infobox。
- 文档库改为 Wiki 风格索引表，并继续覆盖 146 个文档。
- 页面测试防止回退到 workbench card/grid 结构。

## [2026-06-30] implementation | Wiki 支持打开 Markdown 正文

- 为 `/dev/knowledge` 增加点击文档后读取并渲染 Markdown 原文的能力。
- 新增 dev-only 文档内容 API，只按 manifest 白名单 id 读取文件，生产环境隐藏。
- 页面继续保持 app-local manifest 边界，不在客户端直接读父目录文件。

## [2026-06-30] implementation | Wiki 文档页独立化与 Markdown 渲染修正

- 将 `/dev/knowledge` 的文档打开模式改为独立文章页，主页保留为导航和索引。
- 文档页只显示文档元信息和 Markdown 正文，避免正文被夹在主页多个区块中。
- 用 `react-markdown` 和 `remark-gfm` 替换手写 Markdown parser。

## [2026-06-30] implementation | Wiki 文档中文镜像层

- 为当前 147 个 catalog 文档生成 `knowledge/docs/zh/*.zh.md` 中文阅读版。
- catalog 和 app manifest 增加 `localizedSourcePath`。
- `/dev/knowledge` 打开文档时默认读取中文镜像，不再展示英文原文作为正文。

## [2026-06-30] implementation | Wiki 导航链接 URL 化

- 将 `/dev/knowledge` 主要导航从客户端状态按钮改为真实 URL 链接。
- 支持索引、主题、历史和经验条目通过 query 参数首屏打开。
- 修正文档独立页上的最近更改和经验库空锚点。

## [2026-06-30] implementation | 中文 Wiki 镜像保留中文源正文

- 修复部分文档页只有摘要、看不到完整文章正文的问题。
- 中文源文档生成镜像时追加完整“源文档正文”。
- 以 `feature-bootstrap-design` 增加回归测试，确保 Wiki 页面首屏渲染源正文段落。

## [2026-06-30] implementation | Orbit AI 共享 runtime 文档入库

- 补充 Orbit AI trace 英中设计，记录 shared live runtime、planner-only 兼容入口和人脉推荐方法选择。
- 补充 `features/orbit-ai/DESIGN.md`，把 `ORBIT_CONTACT_RECOMMENDATION_METHOD`、`contacts.recommend` 和 graph-gated RAG 边界写入模块文档。
- 更新 catalog 元数据，重新生成中文镜像和 app-local knowledge manifest。
