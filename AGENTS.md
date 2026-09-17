<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **orbit** (397312 symbols, 571875 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/orbit/context` | Codebase overview, check index freshness |
| `gitnexus://repo/orbit/clusters` | All functional areas |
| `gitnexus://repo/orbit/processes` | All execution flows |
| `gitnexus://repo/orbit/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

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
