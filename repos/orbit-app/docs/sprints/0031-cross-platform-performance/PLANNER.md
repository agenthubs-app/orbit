# Sprint 0031 App 与 Web 关键路径性能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure and materially improve Orbit App and Web critical-path responsiveness without changing business behavior, authority boundaries or user data semantics.

**Architecture:** Build one redaction-safe cross-platform sample/summary contract, drive Release App and production Web harnesses with the same 3-warmup/10-run protocol, then choose exactly three optimizations through the design's deterministic trigger table. Keep caches subordinate to server truth, preserve abort/account isolation, and separate controllable AI latency from external provider time.

**Tech Stack:** Expo 57, React Native/React 19, Expo Router, SQLite/Hermes, Next.js 16 production runtime, React 18, TypeScript, Node test runner, Playwright, Performance APIs, Xcode/iOS Simulator, existing Server-Timing and GitNexus tooling.

**Spec:** `repos/orbit-app/docs/sprints/0031-cross-platform-performance/DESIGN.md`

## Global Constraints

- User-approved scope is one cross-platform Sprint assigned to B line; optimize both App and Web, not only AI or one page.
- Baseline is `chat-agent@c1ba721d13bea4d1100b36064647014f3466adb4` or a newer mainline SHA explicitly recorded before run-01. B line must create `codex/b-line-sprint-0031` and must not continue on its old Sprint branch.
- Preserve all pre-existing dirty/untracked files in the B worktree. Do not stage `AGENTS.md`, `CLAUDE.md`, design exports or another line's files.
- Use Release App and production Web for final numbers. Debug/Metro and RNW may diagnose but cannot satisfy SC-0031-01/04/05.
- Each scenario uses exactly 3 warmups plus 10 recorded runs in the same environment. Keep failed samples and redact payloads, cookies, tokens, personal text and provider prompts.
- Use TDD for behavior and performance-budget code. Preserve RED→GREEN evidence for each selected optimization.
- Run GitNexus upstream impact before editing each existing function/class/method. HIGH/CRITICAL findings must be reported before editing and covered by named consumers.
- Do not change business DTOs, permissions, actor ownership, write semantics, visual design or database schema. Do not call paid providers during automated performance loops.
- Web/API must run throughout App validation. After any Web/shared change, production build and restart before Simulator acceptance.
- Sprint closes only after B commits a fixed SHA, the coordinator merges it to `chat-agent`, and the exact merge tree passes the specified verification.

---

### Task 1: Establish the B-line baseline and shared statistics contract

**Files:**
- Create: `repos/orbits/shared/performance/performance-sample.ts`
- Create: `repos/orbits/tests/performance/performance-sample.test.ts`
- Create during execution: `repos/orbit-app/docs/sprints/0031-cross-platform-performance/evidence/run-01/baseline.json`
- Create during execution: `repos/orbit-app/docs/sprints/0031-cross-platform-performance/evidence/run-01/environment.md`

**Interfaces:**
- Produces: `PerformanceSample`, `PerformanceSummary`, `summarizePerformanceSamples(samples)` and `comparePerformanceSummaries(baseline, optimized)`.
- Consumers: App and Web measurement scripts in Tasks 2 and 3.

```ts
export interface PerformanceSample {
  commit: string;
  durationMs: number;
  environment: "app-release-simulator" | "web-production-local";
  failed: boolean;
  metric: string;
  run: number;
  scenario: string;
  unit: "bytes" | "count" | "milliseconds" | "ratio";
}

export interface PerformanceSummary {
  failedRuns: number;
  metric: string;
  p50: number;
  p95: number;
  scenario: string;
  successfulRuns: number;
}
```

- [ ] **Step 1: Record branch and environment without touching owned changes**

Run `git status --short --branch`, `git log -5 --oneline`, Node/Xcode/Simulator versions and available disk space. Create `codex/b-line-sprint-0031` from the approved planning commit. Record the exact mainline parent, Web port, runtime mode and simulator UDID without recording secrets.

- [ ] **Step 2: Write RED statistics tests**

Test exactly 10 successful formal samples, rejection of warmup rows, duplicate run numbers, mixed commits/environments/units, NaN/negative values and secret-shaped keys. Assert p50 is the mean of sorted positions 5 and 6 and p95 is position 10.

```ts
assert.deepEqual(summarizePerformanceSamples(samples), {
  failedRuns: 0,
  metric: "navigation_ms",
  p50: 55,
  p95: 100,
  scenario: "app.notes",
  successfulRuns: 10,
});
```

- [ ] **Step 3: Run RED**

From `repos/orbits` run:

```bash
node --test --import tsx tests/performance/performance-sample.test.ts
```

Expected: FAIL because the shared module does not exist.

- [ ] **Step 4: Implement the pure summarizer and run GREEN**

The module must not read environment variables, clocks, files or payload bodies. Run the same command and require all tests pass.

- [ ] **Step 5: Commit the contract**

Run impact for any existing symbol edited, `git diff --check`, staged GitNexus detect and staged diff review. Commit only the contract/test and Sprint evidence directory skeleton:

```bash
git commit -m "test(performance): establish cross-platform metrics contract"
```

---

### Task 2: Measure the Release App critical paths

**Files:**
- Create: `repos/orbit-app/src/performance/app-performance.ts`
- Create: `repos/orbit-app/scripts/measure-critical-performance.mjs`
- Create: `repos/orbit-app/tests/performance/app-performance.test.ts`
- Modify: `repos/orbit-app/app/_layout.tsx`
- Modify: `repos/orbit-app/src/hooks/useApiResource.ts`
- Modify: `repos/orbit-app/src/data/snapshot-store.ts`

**Interfaces:**
- Produces: `markAppPerformance(input)`, `measureAppPerformance(input, work)`, `drainAppPerformanceSamples()`.
- Mark names are limited to `app.startup`, `app.auth_restore`, `app.navigation`, `app.resource`, `app.snapshot`, `app.react_commit`.

```ts
export function measureAppPerformance<T>(
  input: Omit<PerformanceSample, "durationMs" | "failed">,
  work: () => Promise<T>,
): Promise<T>;
```

- [ ] **Step 1: Write RED instrumentation tests**

Use an injected monotonic clock. Assert success/failure samples, no payload/body fields, stable scenario names, negative duration rejection and complete reset on actor/baseUrl change.

- [ ] **Step 2: Run RED**

```bash
node --test --import tsx tests/performance/app-performance.test.ts
```

Expected: FAIL on missing module/exports.

- [ ] **Step 3: Implement minimal instrumentation**

Add marks around root-layout start/auth-ready, `useApiResource` snapshot/network phases and snapshot SQLite/parse phases. Instrumentation must be disabled unless `EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN=1`; disabled mode performs no logging or array allocation after the flag check.

- [ ] **Step 4: Build the App runner**

The runner must terminate/relaunch the fixed Simulator app, execute the six DESIGN scenarios, ignore the first 3 warmups, collect 10 formal samples, and write only the shared sample shape. Reject output unless every scenario has exactly 10 formal samples and zero unexpected route/write actions.

- [ ] **Step 5: Capture the immutable App baseline**

Build Release, install it on the fixed iPhone 17 Pro/iOS 26.4 Simulator, point it at the running production Web/API and execute the runner. Append raw samples to `baseline.json`; do not overwrite or normalize slow/failed rows.

- [ ] **Step 6: Commit measurement-only App changes**

Run the instrumentation test, affected auth/resource/snapshot tests and App typecheck. Commit:

```bash
git commit -m "perf(app): measure release critical paths"
```

---

### Task 3: Measure production Web and API critical paths

**Files:**
- Create: `repos/orbits/scripts/measure-critical-performance.mjs`
- Create: `repos/orbits/tests/performance/critical-path-harness.test.ts`
- Create: `repos/orbits/shared/performance/server-timing.ts`
- Create: `repos/orbits/tests/performance/server-timing.test.ts`
- Modify only for timing headers: route handlers selected by the measured six scenarios

**Interfaces:**
- Produces: `parseServerTiming(value)`, `withServerTiming(response, spans)` and production-browser samples using the shared contract.

```ts
export interface ServerTimingSpan {
  durationMs: number;
  name: string;
}

export function parseServerTiming(value: string | null): readonly ServerTimingSpan[];
```

- [ ] **Step 1: Write RED harness and header tests**

Assert cache-disabled first navigation, warmed navigation, Core Web Vitals, transfer/decoded bytes, request count, non-provider API spans, malformed header rejection and redaction. The harness must fail if it runs against `next dev` or a build whose recorded SHA differs from the measured commit.

- [ ] **Step 2: Run RED**

```bash
node --test --import tsx tests/performance/performance-sample.test.ts tests/performance/critical-path-harness.test.ts tests/performance/server-timing.test.ts
```

- [ ] **Step 3: Implement the browser/API harness**

Use Playwright against an already-built `next start`; collect Navigation/Resource/PerformanceObserver entries without screenshots in timed intervals. Measure `/app/home`, `/app/contacts`, `/app/followups`, `/app/schedule`, `/app/profile`, `/app/agent` and the local-boundary AI POST. Store URL templates only, never query content or response bodies.

- [ ] **Step 4: Add reusable timing headers narrowly**

Reuse the existing AI timing names. Add `orbit-total`, `orbit-auth`, `orbit-read`, `orbit-project` and `orbit-serialize` only to measured route handlers that lack equivalent timing. Headers must not expose record counts, IDs or errors.

- [ ] **Step 5: Capture the immutable Web baseline**

Production-build the exact baseline, start it on an isolated port, verify `/api/health` is `live/ok`, then run 3 warmups + 10 formal runs. Append raw samples to the same `baseline.json` and stop only the isolated measurement process.

- [ ] **Step 6: Commit measurement-only Web changes**

Run the three performance tests, affected route tests, Web typecheck and production build. Commit:

```bash
git commit -m "perf(web): measure production critical paths"
```

---

### Task 4: Select and optimize exactly three measured bottlenecks

**Files:**
- Candidate App: `repos/orbit-app/src/data/snapshot-store.ts`
- Candidate App: `repos/orbit-app/src/api/client.ts`
- Candidate App: `repos/orbit-app/src/hooks/useApiResource.ts`
- Candidate App screens: only the slow screen-private file named by profiler evidence
- Candidate Web: `repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx`
- Candidate Web: existing non-first-view components imported by that route
- Candidate Web/API: only the measured route/provider files named by `Server-Timing`
- Create: `repos/orbit-app/docs/sprints/0031-cross-platform-performance/evidence/run-01/selection.md`

**Interfaces:**
- Consumes: baseline summaries and the DESIGN candidate trigger table.
- Produces: exactly three selected bottleneck IDs, one primary metric each, before value, trigger evidence, planned symbols/files and rollback boundary.

- [ ] **Step 1: Rank without editing product code**

Generate summaries and select exactly three candidates using the DESIGN order. At least one must be App and one Web. Record rejected candidates and why their trigger did not fire.

- [ ] **Step 2: Run impact and report shared risk**

Run upstream impact for every existing selected symbol. `useApiResource`, `snapshot-store`, API client and shared route/provider functions are expected to have broad consumers; HIGH/CRITICAL results must be reported before editing, with the exact affected paths added to regression commands.

- [ ] **Step 3: Write one RED test per selected bottleneck**

Required assertion shapes:

```ts
assert.equal(observedDuplicateGets, 1);
assert.ok(summary.p50 <= baseline.p50 * 0.70);
assert.ok(unselected.p95 <= baselineUnselected.p95 * 1.10);
```

For cache work also assert actor/baseUrl/logout/write/refresh invalidation. For dynamic imports assert the closed panel module is absent from the first-load chunk. For focused reads assert unrelated records are not loaded and fallback behavior stays identical.

- [ ] **Step 4: Verify all three RED failures**

Run each focused test independently. Expected: failure must identify the measured behavior or budget, not a missing fixture or environment variable.

- [ ] **Step 5: Implement the minimum chosen candidates**

Apply only the triggered candidate rules in DESIGN. Do not add speculative caches, global memoization, schema changes or unrelated refactors. Keep each optimization independently revertible.

- [ ] **Step 6: Run GREEN and capture optimized samples**

Run focused tests, rebuild production Web and Release App, repeat the full 3+10 protocol into `optimized.json`. All three selected p50 values must be ≤70% of baseline; all unselected p95 values must be ≤110% of baseline.

- [ ] **Step 7: Commit by independently testable optimization**

Each selected bottleneck gets one path-limited commit after impact/detect review, using one of:

```bash
git commit -m "perf(app): reduce measured resource latency"
git commit -m "perf(web): reduce measured route payload"
git commit -m "perf(api): reduce measured read latency"
```

Use the message matching the actual selected candidate; do not create empty commits for unselected categories.

---

### Task 5: Verify perceived AI response without hiding provider latency

**Files:**
- Modify if baseline fails 150 ms: `repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx`
- Modify corresponding existing AI UI test file
- Extend: `repos/orbits/tests/performance/critical-path-harness.test.ts`

**Interfaces:**
- Consumes: existing `data-orbit-agent-request-state`, `aria-busy` and AI `Server-Timing`.
- Produces: `feedback_ms`, `local_ms`, `provider_ms`, `total_ms` samples; no response-body logging.

- [ ] **Step 1: Add the 150 ms interaction budget test**

Intercept the provider boundary with a controlled delayed response, click the visible send control, and measure until the visible request state changes to busy. Require p95 ≤150 ms across 10 runs while the request remains unresolved.

- [ ] **Step 2: Add timing separation assertions**

Require local boundary requests to expose local spans without provider spans; controlled provider requests must expose distinct provider/total spans. Never require an external provider total-time budget.

- [ ] **Step 3: Fix only if RED**

If feedback exceeds 150 ms, move only synchronous pre-request work after the busy state commit or defer nonessential history/panel derivation. Do not skip safety validation, audit artifact creation or confirmation boundaries.

- [ ] **Step 4: Run AI functional and performance GREEN**

Run existing AI route/UI/artifact tests plus the performance harness. Paid provider keys must be unset; the controlled provider fixture is the only model boundary.

---

### Task 6: Full cross-platform acceptance, report, commit and handoff

**Files:**
- Create: `repos/orbit-app/docs/sprints/0031-cross-platform-performance/REPORT.md`
- Create: `repos/orbit-app/docs/sprints/0031-cross-platform-performance/evidence/run-01/optimized.json`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: applicable `bridge/status.md`, `bridge/handoffs.md` and a new BR file only if Web/App contract or shared API behavior changed

**Interfaces:**
- Produces: SC mapping, raw/summarized before-after evidence, fixed B-line final SHA and coordinator handoff.

- [ ] **Step 1: Run the affected functional matrix**

Run App performance/resource/snapshot/auth tests plus every screen consumer named by impact, App typecheck, Web performance/route/provider/AI tests plus every consumer named by impact, and Web typecheck.

- [ ] **Step 2: Run integration checks once**

Because this Sprint changes both App and Web and is H/I risk, run each affected end's full test suite once after local code convergence. Existing unrelated failures must be reproduced independently and recorded; they cannot be silently dropped or called pass.

- [ ] **Step 3: Rebuild and restart the actual Web service**

Build current `repos/orbits`, keep the old server until build succeeds, then stop the known old PID and start the new production output. Require `/api/health` 200 with `live/ok`; confirm process cwd and build SHA.

- [ ] **Step 4: Build/install Release App and run native journeys**

Build the exact B-line final source, install on iPhone 17 Pro/iOS 26.4, launch and run all six App scenarios against the current Web service. Verify no old-account flash, stale writes, failed deep links or feature loss.

- [ ] **Step 5: Write the report without averaging failures away**

For every SC list baseline/optimized p50/p95/delta, raw evidence paths, failed sample count, selected/rejected candidates, functionality results and external limits. A selected candidate below 30% improvement or an unselected path above 10% regression keeps the Sprint non-completed.

- [ ] **Step 6: Commit the report and deliver a fixed SHA**

Run `git diff --check`, GitNexus staged detect and staged diff review. Commit Sprint-owned report/evidence/registry/Bridge files, then send the coordinator the branch, fixed final SHA, commit list, RED→GREEN evidence and complete affected-test list.

- [ ] **Step 7: Coordinator merge gate**

The coordinator merges the fixed SHA to `chat-agent`, verifies the exact merge parents, reruns the affected performance and functional matrix, confirms current Web/Simulator artifacts, records the merge SHA and only then marks Sprint 0031 completed. The coordinator performs an ordinary push only under existing applicable authorization and verifies `origin/chat-agent` equals local mainline.

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0031-01 | 固定 Release App 与 production Web 的六条核心路径各有 3 次预热＋10 次正式原始样本，失败不被删除 | `baseline.json`、环境记录、统计 contract 测试、build/runtime SHA |
| SC-0031-02 | 恰好三个测得瓶颈被优化，至少一项 App、一项 Web，每项 p50 改善 ≥30% | selection、三组 RED→GREEN、`optimized.json` 与同环境对比 |
| SC-0031-03 | 其他核心路径 p95 不退化 >10%，缓存/actor/abort/权限/导航/业务结果保持正确 | 全核心路径比较、受影响功能矩阵、actor/baseUrl/logout/refresh 负断言 |
| SC-0031-04 | AI 150 ms 内出现 busy 反馈，本地与 provider 延迟分开，自动循环不调用付费 provider | 10 次交互样本、Server-Timing、controlled provider 测试、0 次付费调用记录 |
| SC-0031-05 | 当前 production Web 与 Release App 在同一服务/账号真实运行，固定 SHA 已提交并合并回主线 | Web build/restart/health、iOS build/install/六路径、B final SHA、主线 merge SHA 与合并树复验 |

## Plan self-review

- Spec coverage：六个 App/Web 场景、三项 30% 改善、10% 回退门槛、AI 可控/外部时延分离、真实 build/runtime 和 Git 闭环均映射到 Task 1–6 与 SC-01～05。
- Placeholder scan：没有未定义的 TBD/TODO；候选选择由固定触发条件和排序规则决定，不由执行者主观扩展。
- Type consistency：App/Web runner、统计 contract 和报告均使用 DESIGN 中同一 `PerformanceSample`/`PerformanceSummary` 字段；p50/p95 样本规则一致。
