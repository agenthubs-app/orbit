# Native Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the native client request a password reset and consume the existing reset token through the same HTTP service as Web.

**Architecture:** Keep the existing native AccountAuthScreen for the email request. Add a focused reset screen and view-model, with the existing API client and themed components. Preserve server-owned token validation, expiry, single consumption, and session revocation. Promote only the response DTO through the existing contract-copy channel.

**Tech Stack:** TypeScript, Expo Router, React Native, existing HTTP client, node:test, runtime component harnesses.

**Spec:** The completion design approved in conversation on 2026-09-09 includes native password recovery, genuine workflows rather than route placeholders, existing HTTP contracts, actor isolation, explicit failure states, and runtime verification. This plan covers password recovery only; batch review and event experience have separate implementation scopes.

## Global Constraints

- Work only in `/Users/xzhao/Projects/orbit/.worktrees/remote-sync-20260907`; preserve main worktree changes.
- Run GitNexus upstream impact before editing existing symbols. Warn on HIGH/CRITICAL before edits; controller serializes staging and commits and runs change detection.
- Use apply_patch and TDD. Retain existing password/token rules, generic email acceptance, origin guard, no-store and no-referrer headers, and server session revocation. Do not change authentication provider behavior or loosen the API envelope parser.
- Mobile source cannot import Web source. Sync pure response types through `npm run sync:contract`; never edit generated copies by hand.
- No production credentials, actual email, remote database writes, model calls, deployment, or domain-association changes. Only the existing named local scratch database may be used for tests.
- Tokens and passwords stay in memory and request bodies. Never put them in query parameters, local storage, snapshots, analytics, logs, or external open-URL actions. Reset success must clear the token, password fields, and navigation fragment.
- HTTPS email universal-link opening is not configured in the current App. Retain Web email URLs; allow explicit paste of the same-server HTTPS reset link in native as a usable fallback. Do not claim automatic email-to-App opening without runtime evidence and association configuration.
- Scope asynchronous form results to the current client/account generation and mounted screen. A server/account switch or superseding submit must not update the new form. Disable duplicate submission synchronously as well as visually.
- Bind a captured token to the server origin at capture time. Clear token, pasted link, and passwords on a server/account change; never forward the old server's bearer token to a newly selected server.
- A reset token may belong to an account other than the currently signed-in native account. Do not forcibly expire the current session on an opaque-token success; server revocation and subsequent authenticated validation remain authoritative.

### Task 1: Make Password Reset HTTP Responses Native-Compatible

**Files:** Modify `repos/orbits/features/auth/password-reset-http.ts`, `repos/orbits/tests/capabilities/password-reset.test.ts`; create `repos/orbits/shared/contract/password-reset.ts`; append a dated scoped note to `repos/orbits/docs/superpowers/plans/2026-09-06-remote-sync.md`.

**Interfaces:** Existing `handlePasswordResetRequest(request, operation, resolve, wakeDelivery?)` handles request/reset. Success payload remains `{ success: true, data: { message: string } }`. Add pure `PasswordResetResponse` for the data only. Every failure must contain string `error.code` and `error.message`; native already requires both.

- [x] Add table-driven HTTP regressions for unsupported content type, declared/actual oversize body, non-object/array/malformed JSON, unavailable runtime, disallowed origin, thrown service error, and existing invalid input/token service results. Assert exact status and stable code, unchanged no-store/no-referrer headers, and no secret/error-stack echo. Include successful request/reset response shape and request delivery wake behavior using local injected functions.

```ts
const result = await handlePasswordResetRequest(request, "request", () => null);
assert.equal(result.status, 503);
assert.deepEqual(await result.json(), {
  success: false,
  error: { code: "SERVICE_UNAVAILABLE", message: "密码恢复暂不可用，请稍后重试或联系管理员。" },
});
assert.equal(result.headers.get("cache-control"), "no-store");
assert.equal(result.headers.get("referrer-policy"), "no-referrer");
```

- [x] Run the HTTP cases to red. Analyze impact for the handler and changed test helpers/file.
- [x] Add `UNSUPPORTED_MEDIA_TYPE` for 415, `PAYLOAD_TOO_LARGE` for 413, `VALIDATION_ERROR` for invalid JSON/body, `SERVICE_UNAVAILABLE` for missing runtime/unexpected exceptions, and `FORBIDDEN` for origin mismatch. Preserve the service's `INVALID_INPUT` and `INVALID_TOKEN` codes and all statuses/copy. Do not restructure request processing.

```ts
// shared/contract/password-reset.ts (pure response type, no imports)
export interface PasswordResetResponse {
  message: string;
}
// In the success branch, type-check the existing data against the DTO:
const data = {
  message: operation === "request"
    ? "申请已受理。如果该邮箱支持密码恢复，你将收到重置链接；未收到时请稍后重试。"
    : "密码已更新，请使用新密码登录。",
} satisfies PasswordResetResponse;
```

- [x] Keep the existing request/reset messages. Add a type-only import for the DTO and use `satisfies` on the success data expression.
- [x] Run all `password-reset.test.ts` and `password-reset-queue.test.ts` with sanitized env and the owned scratch DB. Require zero skipped security/DB cases. Run both Web typechecks. Append exact verification scope to the dated integration document, without claiming real email delivery.
- [x] Independent task review, then controller change detection and scoped commit.

### Task 2: Implement Native Request and Reset Forms

**Files:** Modify `repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx`, `repos/orbit-app/src/view-models/account-auth.ts`, `repos/orbit-app/src/view-models/initial-route.ts`, `repos/orbit-app/tests/account-auth-view-model.test.ts`, `repos/orbit-app/tests/account-auth-screen-source.test.ts`, and `repos/orbit-app/tests/initial-route.test.ts`. Create `repos/orbit-app/app/account/reset-password.tsx`, `repos/orbit-app/src/screens/profile/PasswordResetScreen.tsx`, `repos/orbit-app/src/view-models/password-reset.ts`, `repos/orbit-app/tests/password-reset-view-model.test.ts`, and `repos/orbit-app/tests/password-reset-interactions.test.ts`. Update `repos/orbit-app/README.md` with the actual supported flow. Contract copies are generated only by the sync command.

**Interfaces:** `useOrbitApiClient()` returns an account/base-URL-scoped client. Use `client.post<PasswordResetResponse>(path, { body })`. Request path is `/api/auth/password-reset/request` with `{ email }`; reset path is `/api/auth/password-reset/confirm` with `{ token, password }`. `useLocalSearchParams` can expose fragment under `"#"`; use the installed router implementation and existing mobile-route-access tests to confirm fragment behavior rather than guessing.

- [ ] Sync the Task 1 DTO with `npm run sync:contract`. Add red view-model tests: forgot has exactly the email field, no OAuth or unavailable restriction; reset is an auth-entry excluded from normalized post-login `next`; initial-route supports `/account/reset-password` and its fragment. Retain existing login/signup and open-redirect checks.

```ts
assert.deepEqual(accountAuthToView("forgot").fields.map((field) => field.name), ["email"]);
assert.equal(accountAuthToView("forgot").restrictionMessage, undefined);
assert.equal(normalizedNext("/account/reset-password#token=secret"), "/dashboard");
```

- [ ] Add pure reset view-model helpers for parsing a token from the fragment or an explicitly pasted link, and validating password/confirmation. Tokens must match `/^[A-Za-z0-9_-]{43}$/u`. Pasted links must have no credentials or query, exactly the configured server origin, HTTPS, and `/app/account/reset-password` path. Reject foreign origins and query-carried tokens. For isolated runtime QA only, allow HTTP when both configured server and pasted link are loopback origins; never allow arbitrary HTTP hostnames. Use `URL` and `URLSearchParams` rather than ad hoc URL splitting.

```ts
export function passwordResetTokenFromFragment(fragment: string | undefined): string | null;
export function passwordResetTokenFromLink(link: string, baseUrl: string): string | null;
export function passwordResetValidation(password: string, confirmation: string): string | null;
```

- [ ] Test missing/duplicate/malformed tokens; wrong origin/path/protocol; credentials/query rejection; valid same-server token; password below eight characters, more than 72 UTF-8 bytes, multibyte boundaries, mismatch, and valid password. Use the platform's UTF-8 encoding API supported in this repo, not Web-only Buffer in native production.
- [ ] Add actual runtime interaction tests before screen edits. Reuse the repository's VM/native-boundary harness pattern while executing real components and hooks; static HTML/source alone cannot prove submits. Cases: email request accepted without account enumeration; service unavailable and retry; reset success payload; invalid/expired token recovery; mismatch makes no request; duplicate press sends one request; deferred response after client/account change or unmount cannot mutate the current form; token/password clear on success. All API responses are local fixtures.
- [ ] Analyze impact for every changed existing function/helper. Enable forgot copy and `[emailField]` in the existing view-model, preserving login/signup behavior. In the existing forgot submit branch call the request endpoint and show the generic returned acceptance or visible failure; stay on the form rather than claiming delivery. Render a link to the reset screen so a user can paste the received link.

```ts
const result = await client.post<PasswordResetResponse>("/api/auth/password-reset/request", {
  body: { email: values.email.trim() },
});
// After the current-generation/mounted check:
if (result.success) setNotice(result.data.message);
else setError(result.error.message);
```

- [ ] Implement PasswordResetScreen with existing AppScreen, themed controls, and Ionicons. With a valid fragment token show password and confirmation; without one show a reset-link input and forgot/back-login navigation. Keep accepted token only in memory, clear pasted link after capture, and never include token in rendered text or success navigation. Invalid token shows a new-request action; network/server failure keeps a retryable form. Add secureTextEntry and appropriate input accessibility labels; keep controls stable across submitting/error states.
- [ ] Add the public route file rendering PasswordResetScreen; add the initial-route key/type and reset auth-entry exclusion only. Do not broaden unrelated route whitelists or alter AuthSessionProvider. Do not add a Web button that embeds the bearer token into a custom scheme.

```tsx
import { PasswordResetScreen } from "../../src/screens/profile/PasswordResetScreen";
export default function ResetPasswordRoute() {
  return <PasswordResetScreen />;
}
```

- [ ] Run focused changed/new tests, contract-sync tests, API client tests, mobile-route-access tests, and App typecheck. Then run the full App suite. Route parity should now have only the other four planned missing routes; that failure remains explicit. Update README to state that native supports email request and same-server reset-link paste; universal links and real email remain unverified.
- [ ] Independent task and whole-feature review. Controller runs change detection and commits reviewed work. Actual local HTTP/DB and simulator QA are still required in the completion runtime phase; do not label them passed based on mocked interactions.

## Verification Boundaries

### Task 1 Checkpoint

Backend HTTP compatibility passed independent spec and quality review with no
Critical/Important findings. The four Web files add only stable error codes,
an import-free response DTO, substantive handler regressions and the dated note.
RED45tests18pass27fail became GREEN45/45 against the owned local database, zero
skips. Both Web typechecks pass; controller independently reproduced45/45 on
Node22.23.2 in1.64seconds. Log:
/tmp/orbit-completion-password-task1-independent-node22-20260910.log.

The existing queue test emits11 routine delivery-tick records. Review records
this as a deferred Minor output-noise item, not a new error or secret leak; no
production logging was suppressed. Whole-feature review will see the item.
Unchanged lifecycle/queue requirements not visible in the patch are covered by
the independently rerun existing DB tests. App sync/forms and actual runtime
HTTP/native/mail checks remain pending. Full Web's seven audit failures and
App's five planned missing routes are not cleared by this scoped checkpoint.

Backend tests cover existing token lifecycle and revocation in the disposable local database. Native runtime tests cover rendered form behavior with local API fixtures. Neither demonstrates production mail transport, domain association, deployment, or same-account cross-client readback. Those remain separate acceptance checks in the approved completion effort.
