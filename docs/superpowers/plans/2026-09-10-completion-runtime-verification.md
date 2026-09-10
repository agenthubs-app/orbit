# Completion Runtime Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for bounded implementation tasks and superpowers:verification-before-completion for each acceptance claim.

**Goal:** Verify the approved completion work through actual local HTTP/database behavior and rendered Web/native workflows, then update evidence without exaggerating coverage. Continue until the remaining work genuinely requires an operator-controlled external environment or another explicit approval gate.

**Architecture:** Preserve the existing production HTTP/service boundaries. Use local test dependencies at provider boundaries only, and distinguish injected-handler tests, running-application tests, simulator checks, and production transport. No fixture endpoint or auth bypass enters production routes.

**Prerequisites:** Static audit repair, native password recovery, native event experience, and native batch import plans are implemented and independently reviewed. Derive the current route denominator after those changes.

**Spec:** Approved completion design in the 2026-09-09 conversation, including genuine native workflows, actor isolation, visible failure states, cross-client readback and actual runtime evidence. Existing deployment target and external-operation gates remain unchanged.

## Frozen Work-In-Progress Checkpoint

On 2026-09-10 the user redirected execution to committing the outstanding work,
integrating it into `chat-agent`, and pushing Git changes. Runtime implementation
was stopped, not completed. The five new Web test/script files preserve that
unfinished state; the App consumer has not been implemented.

Intermediate Web-only HTTP/database diagnostics exercised authentication,
password recovery, experience, contacts, tasks, conversation history,
registration/operations and both batch versions. Focused protocol tests reached
16/16. These runs predate subsequent fixture edits and do not verify the frozen
source. Final paired Web typechecks, final-launcher reruns, source/module-copy
equivalence review and cross-client acceptance remain pending.

Known unfinished fixture work includes an overall copy/runtime watchdog,
cancellation of deadline-expired work, preserving cleanup failures on repeated
close, child drain and configured-pool timeout review. No browser/native cases
or audit coverage are credited. The default integrated runner cannot complete
without the missing App consumer.

At freeze, all 34 recorded owned process IDs and listener ports were absent,
all 20 known owned schemas and 19 temporary paths were absent, and the closure
audit pool was closed. No user-owned resources were stopped or removed. This
checkpoint is source preservation, not product or deployment acceptance.

During commit preparation, the controller reran the frozen protocol tests:
16 passed, zero failed/skipped/cancelled (743.522417 ms). Both Web root and
build-configuration typechecks exited 0 under sanitized Node 22. These checks
do not close the remaining actual-runtime or lifecycle-hardening items above.

## Global Constraints

- Use the isolated integration worktree. Preserve the dirty main worktree, its other developer's simulator, ports, files, and bridge records. No reset/stash/checkout of their work.
- Only `postgresql://xzhao@127.0.0.1:5432/orbit_merge_verify_20260907_c45a` and workspace `test:remote-sync-20260907` are authorized for database verification. Isolated schemas inside this database may be created and cleaned by owned tests. Never load production environment files or enumerate credentials.
- Use an explicit environment whitelist. Local-only test secrets may be created in memory; never commit, log, screenshot, or include reset tokens, passwords, session cookies or actual credentials in reports.
- No actual external mail/OCR/model calls, remote writes, deployment, queue publication or domain-association changes. Deterministic local provider fixtures must be identified in each case. Do not present fixture processing as production provider availability.
- No empty assertions, skipped required checks, lower thresholds, fabricated case IDs or route-wide propagation of one occurrence's evidence. Derive current route/static counts, retain separately measured runtime leaf counts, and credit only executed route/state/interaction cases.
- Tests that use native components through React Native Web prove those components' interaction logic, not native file I/O, secure storage, keyboard behavior or simulator rendering. Source assertions are not runtime evidence.
- Start owned servers on free ports and bind to loopback. Record process IDs/URLs and terminate short-lived test servers in finally blocks. Do not terminate another developer's server. Keep a user-facing preview running only when explicitly delivered with its URL.
- Create a dedicated simulator for this task if native QA requires one. Do not erase or reconfigure the user's already-booted simulator. Run all Python-based tools, including idb if applicable, through an established uv environment.
- Any implementation repair requires a failing regression, upstream impact for changed existing symbols, a scoped patch, covering verification and independent review. Controller owns staging/commits and GitNexus change detection.

### Task 1: Establish Local Runtime Fixtures and Cross-Client HTTP Evidence

**Scope:** Test-only scripts/helpers under the appropriate client's tests or scripts directory; owned temporary artifacts. No production endpoint, authentication provider, queue or storage-adapter change. Choose exact test paths after reading existing handler factories and local PostgreSQL test helpers; record the bounded write set before dispatch.

- [x] Verify both clients' current full suites/typechecks and sanctioned contract/schema copies before runtime setup. Preserve known missing-runtime audit failure until actual evidence exists. Do not rerun unrelated failing baselines without documenting the reason.
- [ ] Prepare two synthetic actors/accounts and controlled contacts/tasks/events in the owned database using existing service/repository APIs. Include an organizer with the required event capabilities and a second actor without access to that organizer workspace. Use names/emails under test domains, not real user data.
- [ ] Reuse real HTTP handler factories and existing account resolution. Where dependencies must be injected for local provider isolation, label the exact injected boundary. A custom handler test server does not prove production Auth.js routing; verify the running application's local login/session separately.
- [ ] Run password request/reset with a captured local delivery callback, generic request acceptance, wrong/expired/reused tokens, old-session revocation and new-password login. Reset tokens stay in memory; log case outcomes only. Request/reset native form payloads must traverse HTTP rather than a mocked client method in this phase.
- [ ] Run event experience read/create-draft/edit/preview/publish against the owned database. Verify preview does not change persisted head/revision, explicit publish advances accepted state, stale revision fails, unprivileged actor cannot configure/publish, and display-only editing after question freeze behaves as specified.
- [ ] Run legacy and current batch paths with synthetic image bytes, real byte transport/digest/derivative storage in an owned temporary directory, and deterministic injected OCR. Verify create/upload/restart-reselect/resume/finalize/process/review/confirm, duplicate consent, manual entry, replacement version conflict, skip/cancel/expiry and rejected foreign actor access. No real worker/provider job is submitted.
- [ ] For each writable module exercised, perform Web-originating write -> App HTTP read and App-originating write -> Web read with the same actor/environment. Record entity IDs in a local artifact, expected field/status changes, refresh action, accepted revision and database readback. Test one different actor against populated records. Empty collections or a success envelope alone do not satisfy this criterion.
- [ ] Include existing contacts, tasks, registration/operations and conversation history in cross-client checks where the approved integration changed their contracts or workflows. Use deterministic conversation/provider fixtures, not actual model calls. Record any module outside verified scope explicitly; do not close all bridge items from sampled cases.
- [ ] Shut down owned test resources and preserve redacted case results. Independent review checks that each claim matches the actual boundary exercised.

### Task 2: Exercise Web Surfaces and Responsive Interactions

**Scope:** Existing Playwright/browser testing convention, case scripts under Web tests/pages where new coverage is necessary, and owned screenshot/result artifacts. Production UI repairs require separate scoped regression and review.

- [ ] Start the current Web application in a sanitized local configuration on a free port. Confirm the served source version, runtime mode and actual session actor. Block unintended external network requests; never let a test silently fall back to production services.
- [ ] Derive missing runtime surfaces from the current inventory. The pre-static baseline had 14 Web surfaces without evidence, plus the obsolete `/app/home` claim that must be replaced only after executing its actual redirect. Native additions do not alter the Web route count unless source changed independently.
- [ ] Exercise each missing Web route at 1440x900 and 390x844 using populated/empty/auth-denied states appropriate to that route. Dynamic IDs come from controlled fixtures, not assumed demo availability. Check meaningful content, visible failures, navigation/back, keyboard focus, no horizontal overflow, no text/control overlap and no unexpected page errors. Capture inspectable screenshots.
- [ ] Exercise the repaired status-only controls and real companion actions; prompt suggestions/submit; React language/menu controls; the exact Settings sign-out occurrence; and the actual `/app/home` redirect. Never credit unexercised sibling routes from one shared shell action.
- [ ] Exercise password recovery, batch collection/review and event experience through real forms with local HTTP evidence from Task 1. Preserve input across forced failures; demonstrate explicit confirmation and one request on rapid duplicate presses. Keep token/password values out of screenshots and traces.
- [ ] For each browser case record route, viewport, actor role, version, fixture boundary, steps, assertions, screenshot/result path and any remaining limitation. Browser-only route interception for UI error cases is valid when labeled; it is not database write/readback proof.

### Task 3: Exercise Native Routes, Files and Keyboard Behavior

**Scope:** Owned simulator, existing Expo build/run tooling, native QA scripts and artifacts. No domain associations or public build/deployment configuration changes.

- [ ] Verify installed Expo/native dependencies and compile the current App for an owned simulator. Use a separate free Metro port and record exact App/source version and API URL. Confirm native launch is nonblank and initial routing/auth guards actually execute.
- [ ] Exercise all currently missing native runtime surfaces with valid fixture IDs, authenticated/anonymous transitions and the correct role. The baseline had ten mobile gaps; the five new native routes also require actual simulator evidence. Do not count a deep-link launch that only shows a generic loading screen as successful surface verification.
- [ ] Verify forgot request, reset-link paste/fragment, secure password fields, keyboard-visible submission, mismatch/network/token failure recovery and successful token/password clearing. Confirm a server/account switch cannot send the old server's token.
- [ ] Verify actual image selection/file bytes/digest/upload and protected selected-card rendering for batch import. Demonstrate process restart/reselect by digest, failed upload retry, review edits, duplicate consent, manual entry and replacement conflict using real native file APIs and local HTTP. Check selected-image clearing on scope change.
- [ ] Verify experience editing, question/option controls, preview, explicit publish cancellation/confirmation, dirty conflicts and deadline display-only behavior. Verify the operations entry and return route, not just direct deep links.
- [ ] Capture screenshots and accessibility geometry in a standard phone viewport and a smaller supported phone viewport. Check input/button visibility with keyboard open, scrolling, text wrapping and no incoherent overlap. Native-only controls and media must render; React Native Web screenshots do not substitute.
- [ ] Record case-specific proof and failures. Stop/clean only owned simulator/server resources after evidence is captured; preserve artifacts needed for review.

### Task 4: Reconcile Audit Evidence and Verify the Full Checkpoint

**Scope:** Existing audit generator evidence records/tests and generated reports, plus completion verification documentation. Native/Web business source changes are outside this reconciliation task.

- [ ] Obtain independent review of the runtime reports. Separate actual application cases, injected HTTP/DB cases, component fixtures and static checks. Missing required cases remain incomplete.
- [ ] Run impact before changing generator evidence symbols/records. Add only traceable executed cases with exact surface/source/handler/name identity and current behavior. Keep valid historical case IDs/history unchanged; do not manufacture fresh execution dates for old evidence.
- [ ] Recompute route denominator from both trees after all native additions. The expected addition is five mobile routes, but source-derived count is authoritative. Do not carry forward historical 115/118 as a fixed completion denominator.
- [ ] Regenerate aggregate reports only through the existing generator after evidence changes. Verify screenshots/result links exist and reports retain partial-versus-full verification distinctions. Measured runtime leaf counts change only with new observed leaf evidence, not static source additions.
- [ ] Run both audit suites, the complete sanitized Web suite with local lifecycle DB and `ORBIT_RUN_POSTGRES_SMOKE=1`, the complete App suite, both Web typechecks, App typecheck, contract/schema-sync checks and production-compatible local builds. Record command exit codes, pass/fail/skip counts and build runtime versions. No skipped required database/security case is a pass.
- [ ] Independently review the completed local feature/audit changes, run GitNexus change detection and diff checking, and commit only the reviewed scope. Reuse authorized local integration decisions without pushing or publishing.

### Task 5: Record Handoff and Isolate Operator Gates

**Scope:** Root completion handoff document and the existing client-owned verification notes. The dirty main worktree's bridge ledger remains coordinator-owned.

- [ ] Record local commit versions, client impacts, exact verification boundaries and uncompleted cases using the bridge handoff fields. Provide coordinator-ready updates without overwriting another developer's bridge files.
- [ ] Recheck local changes do not absorb uncommitted main-worktree edits. Preserve ongoing work and report any genuinely conflicting committed integration changes rather than resetting them.
- [ ] Identify the remaining external requirements precisely: approved hosting target, remote database configuration/migrations, private shared derivative storage, queue consumer/delivery configuration, real mail/provider credentials, domain associations and public iOS connectivity as applicable. Inspect configuration/docs without reading or exposing credentials.
- [ ] Do not silently switch the approved Netlify target to Vercel or assume Vercel Queue push consumers work on Netlify. Shared storage/consumer architecture changes are distinct approval gates, not covered by this local verification plan.
- [ ] Stop only at an actual operator/approval boundary after independent local work is complete or genuinely blocked. Report exact needed action and the tests that remain unexecuted. Local success is not deployment success, and partial surface coverage is not full-product verification.

## Supplemental Observation

### Runtime Entry Checkpoint

Implementation prerequisites are complete at
`a4b4167786443408b08b2b6d067103cd6f908927`. Static repairs, password recovery,
event experience and batch import have completed their task and final reviews.
The batch feature's final three findings are closed, with no new findings.
All nine recorded controller rulings remain available for the final handoff.

Current App verification: 1228/1228 passed, zero failures/skips/cancellations,
99.150807584 seconds; actual App typecheck exited 0 without diagnostics. The
full run explicitly passed API-schema byte equality and contract name/count,
byte equality and self-containment checks. Both unchanged Web typechecks passed.
The current full Web suite ran 2945 tests: 2938 passed, seven required runtime
evidence checks failed, zero skipped/cancelled, 94.221307458 seconds. The final
App-only repair's affected audits ran 170 tests: 163 passed and the same seven
failed, 64.632984666 seconds. Coverage remains 87/123, with 36 missing surfaces.
These failures are not waived by the baseline checkbox above.

Logs: `/tmp/orbit-completion-batch-final-fix-full-app-node22-20260910.log`,
`/tmp/orbit-completion-batch-final-fix-typecheck-node22-20260910.log`,
`/tmp/orbit-completion-batch-final-fix-audits-node22-20260910.log`, and
`/tmp/orbit-completion-batch-pre-final-full-web-node22-20260910.log`.
All verification processes exited. Runtime Task1 will use separate reviewed
Web and App test-only slices and a final integrated run. No runtime fixture,
server, native build or new evidence record has been created at this checkpoint.

Accepted batchTask5 at199791ca77858e0e0b86cb2963ccc8b07df7701f supersedes the
frozen candidate below. One reviewed two-file fix prevents post410 stale review/
image revival; parentpostfixfullApp1191/1191zeroFail/skip/cancel73.820036458s,
actualAppTCexit0diagnosticfree. Logs use
/tmp/orbit-completion-batch-task5-fix1-independent-{full-app,typecheck}-node22-20260910.log.
Allfivebatchimplementationtasksarecomplete. Wholefeaturefinalreviewisrunning;
runtimeTask1-5remainunexecuted. CurrentWebsuite/typecheck/evidencecountsbelow
remainunchanged; no native/HTTP/DBruntimecreditaddedbythisfix.

At frozen batchTask5 candidate againstf68b15bb61 (not yet independently
reviewed/committed), parentfullApp1179/1179zeroFail/skip/cancel69.85241925s and
actualAppTCexit0diagnosticfree. BothunchangedWebtypechecks exit0. Currentfull
sanitizedNode22WebownedDBsuite2945tests2938pass7fail0skip/cancel94.221307458s;
the seven are exactly sixfreshpublic/Party runtimeevidence checks plus global
87/123missing36(15mobile21Web). No new non-audit failure. Logs:
/tmp/orbit-completion-batch-task5-independent-{full-app,typecheck}-node22-20260910.log
and /tmp/orbit-completion-batch-pre-final-full-web-node22-20260910.log.
This is a current-source suite checkpoint, not Task5 review approval or actual
cross-client/native runtime evidence. Whole-batch review remains prerequisite.

Accepted batchTask4 atf68b15bb61e8e742898b6fd934f066edd3ace492 supersedes the
frozen-candidate state below. One reviewed TDD fix round repaired native picker
lifecycle ownership and upload410 pending cleanup. ParentpostfixfullApp1146/1146
zeroFail/skip/cancel51.910414292s, actualAppTCexit0diagnosticfree. Logs
/tmp/orbit-completion-batch-task4-fix1-independent-{full-app,typecheck}-node22-20260910.log.
Both Important findings are closed with zero new findings; no runtime credit.
Task5 is implementing; whole-batch review and RuntimeTasks1-5 remain required.

Current frozen batchTask4 candidate against985812ddb (not yet independently
reviewed/committed): parent fullApp1106/1106pass0fail/skip/cancel52.195664959s,
AppTCexit0diagnosticfree. The unchanged route-parity check passes. Affected Web
audits170tests163pass7fail0skip/cancel56.203857583s: exact six required fresh
public/Party cases plus globalruntime87/123,36missing. This adds no runtime
credit. The current missing list has15mobile and21Web surfaces, including all
five added native routes. Task5 review/recovery and whole-batch review remain
implementation prerequisites. Logs use prefix
/tmp/orbit-completion-batch-task4-independent- and suffix -node22-20260910.log
for full-app, typecheck and audits. RuntimeTasks1-5 remain unexecuted.

Current localfeaturecheckpoint4212c03fa: native password recovery and experience
implementation/reviews are complete; batchTask1 has started. Postexperience
fullApp952tests951passoneexactthree-batch-routeparityfail0skip/cancel44.87seconds;
independentAppTCexit0. Logs:
/tmp/orbit-completion-experience-final-fix-full-app-node22-20260910.log and
/tmp/orbit-completion-experience-final-fix-typecheck-node22-20260910.log.
The latest affectedWebaudits establish87/120runtimecoverage,33missing surfaces,
not87/119; the new native experience route has no runtime evidence yet. The six
fresh public/Party checks and globalruntimeassertion remain required failures.
No actualHTTP/database/native case or evidence reconciliation has started.

Current implementation checkpoint11ada7d97: native password recovery and the
experience shared-contract task are reviewed; the native experience editor and
batch work remain in progress/pending. Full sanitizedNode22Web suite with the
owned database ran2910tests2903pass7fail0skip/cancel82.57seconds. The seven failures
are the six required fresh public/Party cases and globalruntimecoverage87/119;
32surfaces lack evidence, including the newly implemented native reset route.
No non-audit failure. Log:
/tmp/orbit-completion-experience-task1-full-web-node22-20260910.log.
This supersedes the earlier test-count/denominator checkpoint only; it adds no
runtime credit. Recompute after the remaining native routes are actually added.

At fixture checkpoint `f0b56aad5`, a read-only local trace probe completed ten
actual PostgreSQL SELECT queries through createPostgresLiveRecordStore using one
injected planner response and zero writes. All ten collections were empty in the
owned workspace. This establishes SQL execution only; populated actor-scoped
readback and rendered client behavior still require the cases above.

## Tooling Preflight

The Homebrew Node 22 binary fails at loader startup because its referenced
libsimdjson.30.dylib is absent. No global installation was repaired. A sanitized
`npx --yes --package=node@22.23.2 -c 'node --version'` succeeds with `v22.23.2`;
use that isolated toolchain for production-compatible build verification.

The existing fb-idb installation is uv-managed and has a verified pyvenv.cfg.
Running idb through `uv run --active --no-project` with VIRTUAL_ENV set to that
tool environment successfully lists simulator targets. This is tooling evidence
only. The already-booted iPhone 17 Pro belongs to other ongoing work and remains
untouched; no completion App build, new simulator, browser case or native case
has been executed at this preflight checkpoint.

The isolated App has its own node_modules directory but no generated ios project
yet. Xcode is selected at /Applications/Xcode.app/Contents/Developer. The internal
data volume had about 13 GiB free at preflight, while /Volumes/ORICO had about
885 GiB free. Put DerivedData and large owned QA artifacts in a fresh task-specific
temporary directory on the external developer volume. Recheck free space before
native generation/build, keep generated ios files within the isolated worktree,
and never remove another developer's caches or simulator data to make space.

Supplemental controller checks under isolated Node 22.23.2: the six committed
fixture files pass 57/57 with all database variables absent and 57/57 with the
owned local database configured; the three named guards pass 16/16 with that
database. All three runs have zero failures/skips. Logs are
`/tmp/orbit-completion-web-fixture-node22-offline-20260910.log`,
`/tmp/orbit-completion-web-fixture-node22-configured-20260910.log`, and
`/tmp/orbit-completion-web-guards-node22-20260910.log`. These are scoped tests,
not a completed Node 22 production build or full-suite result. The trace guard
remains memory-backed; the separate SQL probe above has its own limited scope.

At static checkpoint base `86f43edef`, the complete sanitized Node 22 App suite
ran 831 tests: 830 passed, one route-parity assertion failed, zero skipped or
cancelled. The failure lists exactly the five already approved native feature
routes; no new failure was found. App typecheck also exited 0. Logs are
`/tmp/orbit-completion-app-static-baseline-node22-20260910.log` and
`/tmp/orbit-completion-app-static-typecheck-node22-20260910.log`. These are
pre-feature baselines, not successful acceptance of the missing workflows.

Existing local HTTP precedent is
`tests/services/appointment-unicode-http-postgres.test.ts`: owned schema,
loopback ephemeral port and finally cleanup. It invokes an appointment service
behind a custom server, not production authentication, so reuse its lifecycle
pattern only. Password recovery's existing database test already exercises
provider/service setup, sealed tokens, injected mail delivery and session
revocation in an owned schema; HTTP transport and actual application login
remain additional runtime cases. Do not copy a custom server's raw exception
serialization into secret-bearing recovery cases.

Read-only authentication preflight: `auth.ts` uses the existing Credentials
provider against resolveAuthUserService and performs password-session revocation
checks. `/api/auth/mobile/credentials` uses resolveMobileAuthService and returns
the existing Auth.js-compatible session cookie. Exercise these actual route
boundaries separately; a hand-issued test cookie is not login proof. Live auth
storage resolves ORBIT_EVENT_DATABASE_URL before ORBIT_LIVE_DATABASE_URL and
ORBIT_DATABASE_URL, and ORBIT_WORKSPACE_ID selects its workspace. Set the owned
database/workspace explicitly with live module mode and an in-memory local auth
secret. At preflight the six standard .env/.env.local/development/production
files are all absent in the isolated Web directory (existence-only check, no
credential contents read). Recheck absence before starting Next, since sanitized
process variables alone do not prevent Next or loadLocalEnv from reading files.

Static evidence diagnosis additionally identified six changed Web routes whose
old cases must not qualify as current proof: /app/events, /app/events/[id],
/app/o/[slug], /app/party, /app/party/checkin and /app/party/graph. Public catalogue
and organizer data moved to canonical published event sources; detail controls
and Party contracts/loaders changed. Add explicit fresh runtime cases for all
six after static retirement, including their actual populated/denied states and
navigation at both viewports. Old generic browser smoke must not satisfy these
cases. Historical20 lifecycle and3 organizer-navigation records remain history,
not today's expected interaction count. This expands the observed missing-case
list without reducing the route denominator or claiming product regressions.

Password mail preflight: passwordResetConfig already permits loopback HTTP only
outside production, using ORBIT_PUBLIC_ORIGIN. A mail configuration is still
required; do not set a real provider key merely to enable local recovery.
The configured SMTP adapter always uses implicit TLS or requireTLS for STARTTLS,
and Next's request route schedules dispatch through after() when not on Vercel.
For full configured-route verification, an owned local SMTP sink is possible
only with a proven server library and process-scoped trust for its test CA; do
not disable TLS validation or alter machine-wide trust. smtp-server/mailparser
are not installed in this Web client at preflight. This path has not been set
up or executed. The approved injected HTTP-handler/mail boundary remains the
fallback, separately labeled from actual configured route delivery. Neither
path demonstrates external inbox delivery or deployed queue availability.

Controller production-compatible build at static commit800064692: sanitized
Node22.23.2 `npm run build` exited0, using Next16.2.9 webpack and tsconfig.build.json.
Local LQIP/reference-CSS generation, optimized compilation, TypeScript and page
generation finished; no tracked asset/metadata changes remained. Log:
/tmp/orbit-completion-static-build-node22-20260910.log. No auth/provider/DB secrets
were configured and telemetry was disabled. This is an early current-source
build checkpoint, not a deployed/runtime-authentication result; rerun after the
native feature contract/backend changes for the final completion version.

The successful build was not warning-free: QueueClient emitted three warnings
that no region was detected and it defaulted to iad1. Preserve this diagnostic
as an unconfigured local queue/hosting boundary; do not silence it by inventing
production region/consumer settings. No queue availability, dispatch execution
or cross-host consumer compatibility is established by the build.

### Local Mail Transport Preparation

Read the official [SMTP Server](https://nodemailer.com/extras/smtp-server) and
[MailParser](https://nodemailer.com/extras/mailparser) documentation: the local
listener supports explicit TLS key/cert, required authentication, connection and
recipient checks, bounded message input and an in-memory onData callback. Use a
proven MIME parser, not an ad hoc SMTP/MIME implementation. Keep protocol logging
disabled so reset-link bodies and synthetic authentication remain private.

[Node22 certificate documentation](https://nodejs.org/download/release/v22.21.0/docs/api/cli.html#node_extra_ca_certsfile)
confirms NODE_EXTRA_CA_CERTS is read when the process starts. Give only the owned
Next/test child that public certificate file; never use NODE_TLS_REJECT_UNAUTHORIZED=0,
rejectUnauthorized:false or system-wide trust changes. Keep TLS private keys in
memory, not in the certificate artifact or report.

Controller preparation with Node22.23.2/OpenSSL3.6.3 successfully generated a
one-day self-signed localhost/127.0.0.1 certificate from an in-memory RSA key fed
to OpenSSL stdin. X509Certificate verified its signature, DNS/IP identities and
CA flag. The check output only booleans; neither key nor certificate was written,
logged or retained. No server was started, package installed or mail sent. This
proves the certificate preparation mechanism only, not SMTP/HTTP delivery.

Actual source recheck: password-reset-factory.ts permits loopback HTTP only when
NODE_ENV is not production. Use an explicitly documented local Next development
runtime for the loopback HTTP mail-flow case; do not mislabel it as a production
server run. A separate Node22 production build remains required. The current
request route invokes dispatch through Next after() only for accepted202 and
VERCEL absent; do not invent Vercel queue credentials. SMTP config accepts the
owned listener through SMTP_HOST/PORT/SECURE/USER/PASS and ACCESS_EMAIL_FROM;
provide only generated local values in child-process environment, not .env files.
The sink must listen on loopback, accept only expected synthetic recipients, and
record case outcomes without storing email bodies/reset links. Installed Web
Nodemailer remains the actual adapter; smtp-server/mailparser still need a bounded
test-only installation during the runtime phase before this path can be executed.

Authentication fixture source preparation at4212c03fa: createAuthUserService
accepts the existing storage provider/account provisioner and exposes registerUser;
its live factory selects configured owned storage, so use that service boundary
for fresh synthetic accounts. Do not invoke the general event seed CLI blindly:
it calls loadLocalEnv and can reset existing fixture passwords when an option is
set. Instead compose only needed existing APIs against owned test data and keep
generated credentials in memory. Existing realPostgres recovery coverage lives
inside tests/capabilities/password-reset.test.ts:168, not a separate guessed
password-reset-postgres.test.ts file. Its isolatedschema/finallycleanup and injected
delivery service are reusable precedents, not actualHTTP or configuredNextlogin
proof. No seeding, credentials, server or provider action occurred during this read.
