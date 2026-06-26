# Orbit Long-Run Harness

This harness orchestrates Planner, Generator, Evaluator, and Verifier agents for the new Orbits
service in `repos/orbits`.

`repos/tokyo-business-connect` is reference-only. It exists as an example project and must not be
used as the implementation target.

## Roles

- Planner turns the Orbit brief and design notes into sprint-ready specs.
- Generator modifies only the new app repo inside `repos/orbits`.
- Evaluator grades the implementation against the sprint contract and collected evidence.
- Verifier reviews the user experience from a participant, returning participant, or organizer
  perspective. It does not grade sprint success criteria; it asks whether the design feels clear,
  trustworthy, efficient, and specific to Orbit.

## Workspace Boundaries

- App root: `repos/orbits`
- Harness state: `harness-state/`
- Logs: `harness-logs/`
- Run artifacts: `harness-state/runs/run-id/sprint-N/iter-M/`
- Temp files: `harness-state/tmp/`

Generated evidence, screenshots, command output, eval JSON, verification JSON, browser traces,
and temp files must stay under the harness roots above.
New `run-sprint` executions group iteration outputs in one run folder:

```text
harness-state/runs/run-id/sprint-N/iter-M/
  evidence.json
  eval.json
  verification.json
  handoff.json
  git/
  commands/
  browser/
  screenshots/
  axe/
  lighthouse/
  source/
  api/
  artifacts/
```

Legacy top-level `harness-state/evidence/`, `harness-state/evals/`, and
`harness-state/verifications/` directories may exist for older helper calls or historical runs,
but new sprint-loop output should be inspected through `harness-state/runs/`.
Generator processes run with cwd already set to `repos/orbits`, so generated files should use
app-relative paths such as `package.json` or `app/page.jsx`. Creating a nested
`repos/orbits/` directory inside the app repo is treated as a sprint boundary violation.

Preflight validates these roots before it creates or inspects runtime directories.
`app_root`, `artifact_root`, `log_root`, `evidence_root`, and `tmp_root` must be non-empty
project-relative paths without absolute paths or `..` traversal. In greenfield mode, harness
artifact, log, evidence, and temp roots must not overlap `repos/orbits`. If this check fails,
preflight stops before app/git/browser checks, and the preflight report falls back to
`harness-state/preflight/preflight.json` instead of following the unsafe artifact root.

## Commands

Install/update the uv-managed harness dependencies first:

```bash
uv sync
```

```bash
uv run python -m harness.harness init
uv run python -m harness.harness plan --brief "Build the first Orbit MVP"
uv run python -m harness.harness doctor
uv run python -m harness.harness run --brief "Build the first Orbit MVP" --app-url http://localhost:3000
uv run python -m harness.harness hygiene
uv run python -m harness.harness run-sprint --sprint 1 --app-url http://localhost:3000
```

`init` creates the isolated `repos/orbits` app repo, bootstrap contracts, and
`harness-state/bootstrap-product-context.md`. It does not write Planner-owned `spec.md`,
`sprints.md`, or `plan-manifest.json`.

`plan` runs the Planner and writes a concise `harness-state/spec.md`,
`harness-state/sprints.md`, `harness-state/plan-manifest.json`, and
`harness-state/contracts/contract-sprint-N.json`. `spec.md` is only the high-level execution
overview; the detailed sprint implementation and evaluation requirements live in the contract
JSON files.
If the Planner needs multiple turns before `SPEC_COMPLETE`, the harness accumulates all Planner
reply chunks before parsing contracts or saving `spec.md`.
Planner backend adapters do not synthesize `SPEC_COMPLETE`; the completion marker must come from
the Planner output itself, and missing markers stay in the normal planning retry path.
If the Planner emits `SPEC_COMPLETE` but the sprint contract seed section is missing, malformed,
or fails deterministic review, the harness writes the invalid draft under `harness-state/tmp/`,
feeds the parse/review error back to the same Planner session, and requires a complete corrected
SPEC before saving plan state. The repair prompt includes the invalid draft excerpt, so stateless
Planner backends such as Codex still receive enough context to correct the full SPEC.
Planner state is saved only after at least one reviewed sprint contract exists. Empty contract
seed lists are rejected instead of producing a no-op run. Each Planner contract must use a unique
positive integer `sprint_number`; duplicate or non-positive sprint numbers are rejected before
state is written, so contract files, evidence directories, and handoff files cannot collide.
Boolean values and fractional numbers are rejected instead of being coerced or truncated into
integer sprint numbers.
Deterministic contract review applies the same positive-integer check to constructed
`SprintContract` objects, so direct programmatic calls cannot create `sprint-True` or
`sprint-1.5` state paths.
Each contract must have a non-empty string `goal`; `out_of_scope` must be a list of non-empty
strings when present, so prompt generation never receives malformed scope text.
Each contract's `success_criteria` must be a list. Each success criterion must have a non-empty
string `id` and non-empty string `description`; malformed criteria are rejected during
deterministic contract review. Planner contract seed JSON must declare `contracts` as a list of
objects and each `success_criteria` field as a list of objects. Non-object contract entries,
non-list criteria blocks, or non-object criteria entries are rejected before `SprintContract`
objects are built.
Contract `evidence` must be a JSON object; falsy non-objects such as `[]` or `""` are rejected
instead of being treated as an omitted evidence object.
The final plan-state writer re-runs deterministic contract review before writing `spec.md`,
contract JSON, or `plan-manifest.json`, so internal callers cannot persist unreviewable contracts.
The Planner manifest is valid only when `spec.md`, `sprints.md`, at least one listed contract
file, and the manifest contract count all agree. Manifest artifact paths must be non-empty
relative paths inside the project; malformed, absolute, or `..`-escaping paths are rejected.
Listed contracts must live under `harness-state/contracts/`, match
`contract-sprint-N.json`, be loadable, confirmed, and pass contract review.
Planner contract parsing scans the `Sprint Contract Seeds` section for the first valid contract
seed JSON: either an object with a `contracts` list or a legacy top-level list whose entries look
like sprint contracts. Incidental diagnostic JSON objects or arrays do not displace the actual
executable plan.
`run` starts with that Planner phase, enforces preflight against the Planner-produced manifest,
then executes each generated sprint through Generator -> Evidence -> Evaluator -> Verifier.

After each Generator pass, a Claude-backed self-assessment reviews the changed files, sprint
criteria, and Generator summary. If it is not confident, the harness gives Generator a focused
self-assessment repair pass before collecting evidence and invoking Evaluator/Verifier.
Self-assessment is enforced as a read-only phase: the Claude reviewer only receives `Read` and
`Glob` tools, and any app, harness-state, harness, or reference repo file mutation outside log
output still fails the sprint before evidence collection.
The Generator prompt includes the full contract evidence surfaces JSON, so declared routes,
API probes, commands, source files, and public route allowances remain visible during
implementation rather than existing only for the later evidence collector.
The Generator prompt also includes the sprint `file_boundary`. After every Generator pass and
self-assessment repair pass, the harness compares changed app files against that boundary:
`owned_paths` and explicit `allowed_shared_paths` may change, `forbidden_paths` and unrelated
capability files fail the sprint before evidence collection. This keeps component work isolated
for parallel development and prevents broad edits that only happen to fit the global repo
allowlist.
Mock contracts must declare `file_boundary.mock_to_live_doc` and list that document in
`evidence.source_files`. The document is part of the sprint deliverable and must explain live
service/provider files, the switch from mock to live, required env vars or permissions,
privacy/provenance constraints, and replacement tests.
The final post-repair handoff is persisted before evidence collection, so recovery and audit
state match the code being evaluated.
Generator summaries remain `partial_features` in handoff state until Evaluator and Verifier both
pass; only then does the harness promote them to `completed_features`.
If a sprint passes before `loop.min_iterations`, the verified handoff is promoted immediately and
the next Generator pass receives a `QUALITY IMPROVEMENT` directive to preserve the baseline while
making incremental improvements.
If Evaluator or Verifier crashes, times out, or returns unusable output, the loop records a
failed result JSON for that role and continues through the normal failed-iteration path instead
of dropping the sprint state.
If evidence collection itself crashes, the current iteration still gets an `evidence.json`,
failed eval JSON, and failed verification JSON before the loop moves on.
Planner execution is bounded by `loop.planner_max_turns` and `loop.planner_timeout_seconds`, so
strict planning prompts can complete without relying on a hardcoded SDK turn cap, while a stuck
Claude/Codex Planner still cannot hang `plan` or the start of `run` indefinitely. Claude-backed
Planner runs with `allowed_tools=[]`; it plans from the harness-injected brief and product
context instead of reading or writing the repo through tools. Planner contract parse/review repair
attempts are bounded by `loop.contract_review_rounds`; the harness allows the initial Planner
output plus that many repair attempts before failing.

`run-sprint` requires a Planner-produced manifest. Bootstrap state from `init` is not treated
as an executable plan. If the manifest is absent or stale, `run-sprint` exits unless you provide
an explicit `--brief` to replan first. Passing `--brief` forces a fresh Planner run even when an
older manifest is still valid.
The `run_sprint()` function also re-runs deterministic contract review at entry, so direct
programmatic calls cannot bypass the same bad-contract checks used by Planner output and
manifest-loaded contracts.

`doctor` writes `harness-state/preflight/preflight.json` and checks workspace path safety, the
Planner manifest, app repo isolation, app Git config consistency, app Git remote, app worktree
state, protected reference repos, artifact hygiene, supported agent config values, loop bounds,
configured agent runtimes, and Playwright Chromium availability. Missing GitHub remote is a
warning while push is disabled; unsafe workspace roots, invalid Codex approval/reasoning config,
invalid loop bounds, inconsistent commit/push settings, dirty app worktree with git commit/push
enabled, unreadable app Git status, protected repo changes, missing Codex/Claude/Deepcode runtime,
or missing browser runtime are failures.
`doctor` runs this workspace path preflight before retention cleanup, so bad path config still
produces a preflight report instead of failing before diagnostics are written.

`run` and `run-sprint` also enforce this preflight gate before generation. Warnings are recorded
but allowed; failures stop the run. After generation, either command exits nonzero when the final
Evaluator or Verifier verdict is not `pass` or `conditional_pass`, so CI/GitHub automation cannot
treat a failed sprint as successful.

`hygiene` uses the current `workspace.artifact_root`, `workspace.log_root`,
`workspace.evidence_root`, and `workspace.tmp_root` values from config when deciding which
generated artifacts are allowed. It also scans harness and test source directories for artifact-like
files such as `eval.json`, `console.log`, and screenshots without flagging ordinary source files
such as `evaluator.py`. Changing artifact roots no longer requires changing hygiene code.

Run the target app separately from `repos/orbits`:

```bash
npm run dev
```

## Configuration

Edit `harness/config.yaml` to change agent backends, models, Planner/Generator timeouts,
Planner contract repair rounds, iteration limits, verifier thresholds, write allowlists, or
protected paths.

The config loader is strict about section shape and field names. A non-mapping config root or
section fails at load time. Unknown top-level keys, unknown agent roles, misspelled agent fields,
unknown nested `thinking`/`codex`/`deepcode` keys, unknown workspace keys, and unknown
`workspace.git` keys also fail with a section-specific `ValueError`. Omit a supported key to use
its dataclass default; do not rely on typoed keys being ignored.
Workspace list fields must be explicit lists of strings when provided; `write_allowlist: []`
is preserved as an empty allowlist rather than replaced with defaults. Workspace mode, retention
counts, and `workspace.git` booleans, string values, and strategy enum are also validated at load
time.

For Codex agents, `reasoning_effort`, `approval_mode`, and `provider` are mapped into the
Codex CLI command. The default `approval_mode` is `workspace-write`, so Codex runs with the app
repo as its writable workspace instead of bypassing the sandbox. `quiet` is retained as a reserved
harness logging preference because the current `codex exec` CLI does not expose a quiet flag.
Large sprint prompts are sent through stdin rather than argv to avoid command-length limits and
process-list prompt exposure.
Preflight rejects unsupported Codex `approval_mode` and `reasoning_effort` values before any
sprint starts. Evaluator and Verifier Codex backends must use `approval_mode: read-only` because
reviewer verdicts must be based on collected evidence, not new filesystem inspection or edits.
`codex.extra_args` may not override harness-owned controls such as sandbox, working directory,
model/provider/reasoning config, output format, config source, or stdin prompt handling; the
command builder enforces the same rule.

For Claude-backed agents, the harness builds options from config and filters them against the
installed `claude-agent-sdk` `ClaudeAgentOptions` signature. Thinking budget is preserved through
supported SDK fields; unsupported config-era kwargs are logged and dropped before construction.
Preflight validates positive token and thinking budgets and rejects non-1.0 temperatures when
thinking is enabled.
Deepcode-backed agents still use the Claude Agent SDK with the configured `cli_path`, `env`, and
`model`; they are not run through a separate raw subprocess adapter.

## Git Safety

`repos/orbits` is the only app repo intended for GitHub maintenance. The harness records app git
status, staged and unstaged diff names, patch evidence, and untracked file names under
the current iteration's `git/` directory inside `harness-state/runs/run-id/sprint-N/iter-M/`.
Generator changes are checked against `workspace.write_allowlist` immediately after each
generation pass. Files outside the allowlist fail the sprint before self-assessment, evidence
collection, evaluation, or commit.
When `workspace.git.enabled: true`, the sprint loop commits only inside `repos/orbits`. With
`strategy: path-scoped`, commits include only files matching `workspace.write_allowlist` and skip
protected paths:

- failed or continuing iterations: `wip: sprint N iteration M`
- final passing iteration: `feat: sprint N complete`

When git commit or push is enabled, preflight requires `repos/orbits` to be clean before
generation starts. If `git status` cannot be read, preflight fails instead of treating the
worktree as clean. This prevents pre-existing user changes or repo corruption from being mixed
into harness commits.
During each commit attempt, the helper clears the app repo index and stages only the current
committable paths again. This happens even when no files are committable, so Generator-created
staged state cannot persist or smuggle protected or outside-allowlist files into a later harness
commit.
The final passing iteration may create an empty `feat: sprint N complete` commit when earlier
quality iterations already committed the file content and no new diff remains. This gives GitHub
sync a clear verified completion marker instead of pushing a `wip` checkpoint as the sprint head.
Failed or continuing WIP iterations do not create empty commits.

New app repos are initialized on `workspace.git.branch`. When `remote_url` is set, init and
run-state preparation add `repos/orbits` origin only if it is missing. They do not rewrite an
existing origin; mismatches with `workspace.git.remote_url` fail before generation. Push runs only
when `workspace.git.push: true`, `workspace.git.remote_url` explicitly names the intended GitHub
destination, the app repo origin remote matches that configured URL, and the current app branch
matches `workspace.git.branch`. Push also requires the app repo worktree to be clean at push time,
so skipped or uncommitted Generator changes cannot be silently left out of GitHub while a passing
HEAD is pushed. The push helper also does not add or rewrite `origin`; missing `remote_url` or
mismatches with `workspace.git.remote_url` fail at push time, matching the preflight policy. If git
commit or push is enabled, preflight requires an app repo `user.name` and `user.email` before
generation starts.
Preflight also rejects internally inconsistent Git sync settings: `push: true` requires
`enabled: true` plus `strategy: path-scoped` or `strategy: all`, and `enabled: true` cannot use
`strategy: disabled`.
The push helper enforces the same rule at runtime before checking remotes or branches, so direct
helper calls cannot push when git commits are disabled or the strategy is not commit-capable.

Local app-repo commits are enabled by default, while GitHub push remains disabled:

```yaml
workspace:
  git:
    enabled: true
    strategy: path-scoped
    remote_url: ""
    branch: main
    push: false
```

Set `remote_url` and `push: true` only after choosing the GitHub destination for `repos/orbits`.
The harness must not push `harness/`, `harness-state/`, `harness-logs/`, or
`repos/tokyo-business-connect`. Generator changes to protected app paths such as tracked `.env`
files and ignored artifact directories such as `.next/`, `dist/`, and `build/` are blocked
before evidence collection or evaluation, including changes to ignored files that already existed
before the sprint. Ignored app artifacts outside `protected_paths`, such as `npm-debug.log*`, are
also snapshotted and blocked so ignored files cannot bypass Git status or write allowlist checks.
Git rename status is expanded to include both the old and new paths, so moving a protected path
such as `.env` into an otherwise allowed app path is still blocked.
Generator and evidence phases also cannot create app-external root build artifact directories such
as `build/`, `dist/`, or `.next/`.
Self-assessment, Evaluator, and Verifier boundaries also include protected and ignored app
snapshots, so reviewer roles cannot mutate ignored protected app directories such as
`node_modules/`. Evaluator and Verifier are evidence-only reviewers; any supplemental file write
outside normal logging, including under the current iteration's `artifacts/` folder, fails the
sprint.

## Evidence

The evidence collector records declared commands, route HTML summaries, API probes, source
excerpts, missing source files, browser evidence, built-in accessibility/performance smoke
checks, and git evidence.
Contract evidence must be a JSON object. The `routes`, `api`, `commands`, `source_files`, and
`public_routes` buckets must be lists when present; malformed shapes are rejected during contract
review instead of being interpreted or reaching evidence collection. Explicit `null` bucket values
are schema errors; omit a bucket to use the default behavior. Unknown evidence keys are rejected
before they can enter the Generator prompt.
Declared route and API evidence targets must be concrete app-relative runtime paths beginning
with `/`; external URLs, `..` traversal segments, route templates such as `/api/events/:id` or
`/app/events/[id]`, wildcards, and malformed entries are rejected and recorded instead of
requested. If a sprint needs detail-page evidence, the contract must name a concrete seeded or
demo identifier rather than a framework-style pattern.
If the `routes` key is omitted, the collector defaults to `/`; if `routes: []` is declared
explicitly, no navigation/browser route evidence is collected, which is useful for API-only
sprints.
API probes are validated before execution: method must be one of `GET`, `POST`, `PUT`, `PATCH`,
`DELETE`, `HEAD`, or `OPTIONS`; expected status must be an integer from 100 to 599, not a float
that can be truncated; request body must be JSON serializable. API probe objects may contain only
`name`, `method`, `path`, `expectStatus`, `expected_status`, and `body`.
Declared source-file evidence is constrained to concrete file paths relative to the
`repos/orbits` app root. Absolute paths, `..` traversal, repo-root prefixes such as
`repos/orbits/package.json`, and globs such as `features/account/tests/*.test.js` are rejected
and recorded as rejected evidence.
Declared public evidence routes are allowed only under `/__harness/sprint-N/`, where `N` is the
current sprint number. External URLs, `..` traversal segments, ordinary app routes such as
`/debug`, malformed entries, and duplicate public route declarations are rejected during contract
review.
Declared command evidence is limited to one-shot package-manager verification scripts:
`npm test`, `npm run build`, `npm run check`, `npm run format:check`, `npm run lint`,
`npm run test`, or `npm run typecheck`, plus the equivalent `pnpm`, `yarn`, or `bun` forms.
Long-running server/watch scripts such as `npm run dev`, `npm run start`, and
`npm run serve`, shell executables, path-based executables, `node -e`, `npx`, malformed command
entries, and other tools are rejected and recorded instead of executed. Command evidence objects
may contain only `name` and `cmd`.
Declared command timeouts and missing executables are recorded under the current iteration's
`commands/` directory as failed evidence instead of crashing the sprint.
Unexpected evidence-collector failures are also written to the current iteration's
`evidence.json` and converted into failed eval/verification results.
Evidence collection itself is bounded like a reviewer phase: it may write only under the current
`harness-state/runs/run-id/sprint-N/iter-M/` root and logs. If a declared command, route
collector, or future evidence plugin mutates app source, root build artifacts, other harness-state
paths, harness files, docs, or the reference repo, the sprint stops before evaluation or Git
commit.
Contract review rejects malformed or duplicate evidence keys before execution. Route paths and
source-file paths must be unique. Explicit command names and API probe names must be non-empty
strings, unique, and limited to letters, numbers, `_`, and `-` because each collector bucket and
artifact filename is keyed by those values and unsafe characters can collide after filename
normalization.

Generator agents must not write harness artifacts directly. They edit only `repos/orbits`; the
harness writes evidence, logs, evals, verifications, and preflight reports under the harness roots.
Evaluator and Verifier are evidence-only reviewers: Claude reviewers run with `allowed_tools=[]`,
and Codex reviewers must use a read-only sandbox. Runtime boundary checks fail the sprint if a
reviewer writes any supplemental workspace artifact outside normal logging, even inside the current
iteration's evidence folder.
Runtime or JSON-output failures from either reviewer are saved as failed eval/verification JSON
so the next iteration has auditable feedback.
Planner contract parsing, Evaluator, Verifier, and self-assessment JSON parsers extract the first
valid JSON object with the required top-level key, so extra diagnostic text or secondary JSON
blocks do not corrupt an otherwise valid response.
Evaluator pass statuses require an evidence citation that resolves to the current iteration's
evidence JSON key path or an `artifact_path` recorded inside it. Missing or bogus citations fail
the criterion. Evidence key paths use longest-match resolution, so source-file keys and route keys
that contain dots, such as `source_files.app/page.jsx`, resolve correctly. Citations to failed
evidence records also fail the criterion: rejected evidence, missing source files, unavailable
browser records, failed API probes, timed-out or missing commands, nonzero command return codes,
HTTP 4xx/5xx evidence records that are not explicitly marked `passed: true`, and evidence records
with errors cannot support a pass.
If a citation points at a parent evidence bucket, the cited bucket's children are checked
recursively, so `browser` or `api` cannot hide a failed child record.
Verifier issue evidence citations must resolve the same way; bogus issue evidence adds a
high-severity verifier evidence issue and zeroes the verifier scores. Evaluator/Verifier scores
are accepted only in the 1-5 rubric range; nonnumeric or out-of-range scores become zero-score
signals instead of being trusted. Evaluator averages are computed across the full C1-C5 rubric,
and Verifier averages are computed across clarity, trust, efficiency, and delight, so missing
dimensions cannot inflate a verdict.
Verifier issue severity is normalized to `low`, `medium`, `high`, or `critical`; unknown labels
such as `severe` or `major` are treated as `high`, so non-standard reviewer wording cannot bypass
the high-severity blocker.
Verifier scores are also accepted only when the current evidence JSON contains at least one
collected evidence bucket such as navigation, browser, API, command, source, axe, or lighthouse;
empty evidence forces a failed verifier result.

Browser evidence uses Playwright when available. It captures mobile, tablet, and desktop
viewports (`375x812`, `768x1024`, and `1440x900`) with per-viewport screenshots and overflow
records. Install the browser runtime once in this uv environment:

```bash
uv run python -m playwright install chromium
```

When Chromium is not installed, the harness records a browser evidence error under
the current iteration's `browser/` directory instead of crashing the sprint.

Accessibility and performance smoke records are written under
the current iteration's `axe/` and `lighthouse/` directories. They are deterministic guardrails
for obvious issues such as missing `lang`, horizontal overflow, console errors, and request
failures; they are explicitly marked as not full axe-core or Lighthouse audits.

## Operations

At command startup, the harness cleans `harness-state/tmp`, prunes old run logs, prunes old
`harness-state/runs/` folders according to `workspace.keep_last_runs`, and prunes legacy old
iteration evidence according to config. These retention deletes tolerate missing-path races so
parallel commands such as `doctor` and `hygiene` do not fail merely because another harness
process already removed the same temporary path.
