<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **orbit** (98854 symbols, 211901 relationships, 883 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/orbit/context` | Codebase overview, check index freshness |
| `gitnexus://repo/orbit/clusters` | All functional areas |
| `gitnexus://repo/orbit/processes` | All execution flows |
| `gitnexus://repo/orbit/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Web / App Bridge

- Web 与 App 的跨端协作入口是 [bridge/README.md](bridge/README.md)。涉及客户端可见行为、API、共享契约或状态同步时，先读 `bridge/status.md` 和 `bridge/handoffs.md`。
- 交接时记录本端版本、另一端影响、未完成事项和验证范围；模板见 `bridge/templates/handoff.md`。仅路由或类型检查通过不能标记业务对齐完成。
- 保持各子目录的编辑边界；无权写根目录的开发任务应提供交接内容，由 Bridge 协调者更新台账。进行中的另一端未提交改动不得覆盖。

## 自主执行与停止条件

1. 阻塞必须绑定具体动作及其依赖，不能从单个动作扩大到整个 Sprint 或项目；其他已授权、无依赖的工作继续执行。
2. 区分“需要用户决定”和“需要代理查明”。能通过源码、测试、既有约定查明的问题，由代理自行解决。缺设计批准时，可以继续完善待审方案，但不得擅自实施。
3. 用户离线且要求继续时，维护“可执行、可调查、等待决定”三类清单。一项受阻后，从前两类领取下一项，不向离线用户提问；清单和后续动作均限于用户已授权范围。
4. 因阻塞结束前，逐项说明剩余任务的具体缺项、阻塞证据，以及为什么不能继续任何独立部分。只要仍有有价值的可执行或可调查事项，就不能因阻塞结束。
5. 规划完成、一次提交、测试通过、进度检查点都不是停止理由。同时，不得靠重复文档、无关测试或空等制造“持续工作”。用户暂停、任务完成、明确硬限额或真正全部受阻才可结束。

这些规则不取消设计／规格审阅、TDD、文件边界、写入／发布授权、破坏性操作确认或预算限制；审批只阻塞对应动作及其依赖，不是整个项目的锁。已批准的同一动作、对象、范围与版本继续复用批准，不重复询问。
