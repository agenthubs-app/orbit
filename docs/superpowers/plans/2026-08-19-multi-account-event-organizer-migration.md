# Multi-Account Event Organizer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register 13 additional organizer users, link 6 of them to Xiaoyu's existing contacts, and migrate all 16 local events to reviewed account-backed owners.

**Architecture:** Reuse the existing AuthUserService and live-record account provisioner instead of changing the high-risk authentication provider. Bind the existing `agenthubs` Google AuthUser to Xiaoyu's legacy canonical Account through an explicit membership Profile, then add a deterministic organizer manifest, an actor-scoped contact-link provider, and a review-gated bootstrap command that updates legacy event ownership before the existing Event Core backfill consumes it. Database mutation remains dry-run/apply, hash-gated, transactional, and preceded by a full backup.

**Tech Stack:** TypeScript 5.7, Node test runner, `tsx`, PostgreSQL 18, `pg`, existing Orbit live-record store, Auth.js/NextAuth v5, bcryptjs.

**Spec:** `docs/superpowers/specs/2026-08-19-multi-account-event-organizer-design.md`

## Global Constraints

- Exactly 14 unique registered organizer users own exactly 16 events.
- Xiaoyu is the existing `agenthubs` Google AuthUser; her canonical owner remains `account_orbit_generated`. Existing `demo` and `Zhao Xin` users remain separate non-organizers.
- Xiaoyu owns `event_02`, `event_08`, and `event_signup_02`.
- Six reviewed existing contacts become registered users and receive active ContactActorLinks.
- Seven additional registered organizers remain outside Xiaoyu's contact graph.
- `organizerActorId` and legacy event `user_id` always contain canonical Account IDs, never Contact IDs, Profile IDs, emails, or client-supplied values.
- Passwords come only from `ORBIT_DEMO_ORGANIZER_PASSWORD`, are never printed, and are never committed.
- Every mutation command supports dry-run and review-gated apply with an expected count and SHA-256 plan hash.
- Production runtime rejects fixture organizer bootstrap.
- Existing public organizer label and authentication provider interfaces remain unchanged in this phase because GitNexus reports HIGH upstream risk.

---

### Task 1: Reviewed Organizer Manifest

**Files:**
- Create: `repos/orbits/features/events/organizer-accounts/manifest.ts`
- Test: `repos/orbits/tests/services/event-organizer-account-manifest.test.ts`

**Interfaces:**
- Produces: `EVENT_ORGANIZER_ACCOUNT_MANIFEST`, `EVENT_ORGANIZER_ASSIGNMENTS`, `validateEventOrganizerManifest()`, and `eventOrganizerManifestHash()`.
- Consumers: Tasks 3 and 4 use the manifest but do not mutate it.

- [ ] **Step 1: Write the failing manifest contract test**

Assert that the manifest contains 13 non-Xiaoyu accounts, 16 unique event assignments, exactly 3 `xiaoyu` assignments, 6 `existing_contact` assignments with the reviewed contact IDs, and 7 `outside_network` assignments without contact IDs. Assert unique normalized emails and the exact event ID set.

```ts
assert.equal(EVENT_ORGANIZER_ACCOUNT_MANIFEST.length, 13);
assert.equal(EVENT_ORGANIZER_ASSIGNMENTS.length, 16);
assert.deepEqual(
  EVENT_ORGANIZER_ASSIGNMENTS.filter((item) => item.organizerKey === "xiaoyu")
    .map((item) => item.eventId).sort(),
  ["event_02", "event_08", "event_signup_02"],
);
assert.equal(validateEventOrganizerManifest().state, "valid");
assert.match(eventOrganizerManifestHash(), /^[a-f0-9]{64}$/u);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/event-organizer-account-manifest.test.ts`

Expected: FAIL because `features/events/organizer-accounts/manifest.ts` does not exist.

- [ ] **Step 3: Implement the immutable manifest and validator**

Define these exact shapes:

```ts
export type OrganizerRelationship = "existing_contact" | "outside_network";

export interface OrganizerAccountDefinition {
  readonly contactId: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly key: string;
  readonly organization: string;
  readonly relationship: OrganizerRelationship;
  readonly role: string;
}

export interface EventOrganizerAssignmentDefinition {
  readonly eventId: string;
  readonly organizerKey: "xiaoyu" | OrganizerAccountDefinition["key"];
}
```

Populate the exact names, contacts, and event mapping approved in the spec. Use reserved `*.orbit.example.test` emails. Hash canonical JSON sorted by key/event ID so hash output is stable across runs.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd repos/orbits && node --test --import tsx tests/services/event-organizer-account-manifest.test.ts`

Expected: PASS with 13 account definitions and 16 reviewed assignments.

- [ ] **Step 5: Commit the manifest**

```bash
git add repos/orbits/features/events/organizer-accounts/manifest.ts repos/orbits/tests/services/event-organizer-account-manifest.test.ts
git commit -m "feat(events): define organizer account manifest"
```

### Task 2: Contact-to-Actor Link Storage

**Files:**
- Create: `repos/orbits/features/contacts/contact-actor-links/contract.ts`
- Create: `repos/orbits/features/contacts/contact-actor-links/storage-provider.ts`
- Test: `repos/orbits/tests/capabilities/contact-actor-link-storage.test.ts`

**Interfaces:**
- Produces: `ContactActorLink`, `ContactActorLinkProvider`, `createStorageContactActorLinkProvider()`, and collection name `contact_actor_links`.
- Consumes: existing `LiveRecordStoreLike<Record<string, unknown>>`.
- Consumer: Task 3 writes six links through this provider.

- [ ] **Step 1: Write failing provider tests**

Cover active-link creation, idempotent replay, conflict when one Contact links to a different Actor, conflict when one Actor links to a different Contact for the same owner, owner isolation, and revoked-link history.

```ts
const created = await provider.ensureActive({
  contactId: "contact_090",
  evidenceIds: ["evidence:organizer-account-manifest:v1"],
  linkedActorId: "user:wei-yuhang",
  linkedAt: "2026-08-19T00:00:00.000Z",
  ownerActorId: "account:xiaoyu",
});
assert.equal(created.state, "created");
assert.equal((await provider.listActiveForOwner("account:xiaoyu")).length, 1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/contact-actor-link-storage.test.ts`

Expected: FAIL because the contract/provider modules do not exist.

- [ ] **Step 3: Implement strict parsing and deterministic record IDs**

Use record ID `contact-actor-link:<sha256(ownerActorId + NUL + contactId)>`, set `userId` to `ownerActorId`, and store `linkedActorId` only in the payload. Validate non-empty IDs, exact payload shape, active/revoked state, timestamps, and evidence IDs. Do not modify Contact records.

- [ ] **Step 4: Run provider and storage regression tests**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/contact-actor-link-storage.test.ts tests/storage/live-record-store.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the provider**

```bash
git add repos/orbits/features/contacts/contact-actor-links repos/orbits/tests/capabilities/contact-actor-link-storage.test.ts
git commit -m "feat(contacts): persist registered actor links"
```

### Task 3: Review-Gated Organizer Account Bootstrap

**Files:**
- Create: `repos/orbits/features/events/organizer-accounts/bootstrap.ts`
- Create: `repos/orbits/scripts/bootstrap-event-organizer-accounts.ts`
- Modify: `repos/orbits/features/auth/storage/auth-account-provisioning-provider.ts`
- Modify: `repos/orbits/package.json`
- Test: `repos/orbits/tests/services/event-organizer-account-bootstrap.test.ts`
- Test: `repos/orbits/tests/services/event-organizer-account-bootstrap-command.test.ts`
- Test: `repos/orbits/tests/capabilities/auth-user-service.test.ts`

**Interfaces:**
- Consumes: Task 1 manifest, Task 2 ContactActorLinkProvider, existing `AuthUserService.registerUser()`, AuthUserStorageProvider, account provisioner, and the selected Xiaoyu AuthUser/legacy Account/Profile chain.
- Produces: `buildOrganizerAccountBootstrapPlan()`, `applyOrganizerAccountBootstrapPlan()`, and package command `db:bootstrap:event-organizers`.

- [ ] **Step 1: Write failing in-memory plan/apply tests**

Assert that dry-run creates a stable 13-account/6-link/1-Xiaoyu-membership/2-canonical-owner-repair plan without writing; apply requires the reviewed count/hash; missing or non-Google `agenthubs` identity fails; a Xiaoyu binding that does not resolve to `account_orbit_generated` and `profile_orbit_generated_operator` fails; existing matching organizer emails are reused and re-provisioned; conflicting display name/account chains fail; a second apply reports no new writes and preserves the same final state. The reviewed action count is exactly 22: 13 organizer identities, 6 ContactActorLinks, 1 Xiaoyu auth membership, and 2 Xiaoyu canonical LiveRecord owner repairs.

- [ ] **Step 2: Run service tests and verify RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/event-organizer-account-bootstrap.test.ts`

Expected: FAIL because `bootstrap.ts` does not exist.

- [ ] **Step 3: Implement bootstrap planning and apply**

Use exact result shapes:

```ts
export interface OrganizerAccountBootstrapPlan {
  readonly accountCount: 13;
  readonly contactLinkCount: 6;
  readonly hash: string;
  readonly items: readonly OrganizerAccountBootstrapItem[];
  readonly manifestVersion: "event-organizers-v1";
  readonly xiaoyuCanonicalOwnershipRepairCount: 2;
  readonly xiaoyuIdentityBindingCount: 1;
}

export async function applyOrganizerAccountBootstrapPlan(input: {
  expectedCount: number;
  expectedPlanHash: string;
  password: string;
  plan: OrganizerAccountBootstrapPlan;
}): Promise<OrganizerAccountBootstrapVerification>;
```

Call `registerUser()` only for missing users. For existing users, call the existing account provisioner and verify account/profile completeness. Never log or return `password` or `passwordHash`.

For Xiaoyu, create one deterministic membership Profile whose payload `id` is the selected `agenthubs` AuthUser ID and whose `accountId` is `account_orbit_generated`. Atomically repair only the outer LiveRecord `user_id` on `account_orbit_generated` and `profile_orbit_generated_operator` when it is null, preserving both payloads and all public profile content. Extend `ensureAccountForUser()` so a complete existing membership prevents creation of a shadow Account/Profile. Reject ambiguous, incomplete, or non-null conflicting ownership instead of silently provisioning another owner boundary.

- [ ] **Step 4: Write and implement CLI parsing tests**

Support only:

```text
--dry-run --xiaoyu-auth-user-id <id>
--apply --xiaoyu-auth-user-id <id> --expected-count 22 --expected-plan-hash <64hex>
```

Apply requires `ORBIT_DEMO_ORGANIZER_PASSWORD` with at least eight characters and rejects `NODE_ENV=production`. Unknown/mixed flags fail before database writes.

- [ ] **Step 5: Run focused account/auth tests**

Run: `cd repos/orbits && node --test --import tsx tests/services/event-organizer-account-bootstrap.test.ts tests/services/event-organizer-account-bootstrap-command.test.ts tests/capabilities/auth-user-service.test.ts tests/capabilities/auth-api-route.test.ts`

Expected: PASS; logs contain no password material.

- [ ] **Step 6: Commit bootstrap capability**

```bash
git add repos/orbits/features/events/organizer-accounts/bootstrap.ts repos/orbits/scripts/bootstrap-event-organizer-accounts.ts repos/orbits/features/auth/storage/auth-account-provisioning-provider.ts repos/orbits/package.json repos/orbits/tests/services/event-organizer-account-bootstrap.test.ts repos/orbits/tests/services/event-organizer-account-bootstrap-command.test.ts repos/orbits/tests/capabilities/auth-user-service.test.ts
git commit -m "feat(auth): bootstrap event organizer accounts"
```

### Task 4: Review-Gated Legacy Event Owner Assignment

**Files:**
- Create: `repos/orbits/features/events/organizer-accounts/owner-migration.ts`
- Create: `repos/orbits/scripts/migrate-event-organizer-owners.ts`
- Modify: `repos/orbits/package.json`
- Test: `repos/orbits/tests/services/event-organizer-owner-migration-postgres.test.ts`
- Test: `repos/orbits/tests/services/event-organizer-owner-command.test.ts`

**Interfaces:**
- Consumes: Task 1 assignments and AuthUserStorageProvider email lookup.
- Produces: `buildEventOrganizerOwnerPlan()`, `applyEventOrganizerOwnerPlan()`, and package command `db:migrate:event-organizer-owners`.
- Side effect: updates only `orbit_records.user_id` for the 16 reviewed `events` records; the standard Event Core backfill then reads these known owners.

- [ ] **Step 1: Write failing PostgreSQL migration tests**

In an isolated schema, seed 16 event records plus 14 complete account identities. Verify dry-run does not write, missing/duplicate events fail, missing organizer account fails, reviewed count/hash are mandatory, apply changes exactly 16 event `user_id` values, and replay is idempotent. Verify no non-event record changes.

- [ ] **Step 2: Run PostgreSQL test and verify RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/event-organizer-owner-migration-postgres.test.ts`

Expected: FAIL because the owner migration does not exist.

- [ ] **Step 3: Implement transactional owner migration**

Resolve each organizer email to an AuthUser and verify matching Account/Profile before plan creation. Resolve `xiaoyu` from the explicit CLI actor ID. Lock the 16 event rows, compare the full event ID set, update `user_id`, and write one audit LiveRecord containing only manifest version, event IDs, actor IDs, count, and plan hash. Never include emails or password material in the audit payload.

- [ ] **Step 4: Implement and test the command protocol**

Support:

```text
--dry-run --xiaoyu-actor-id <id>
--apply --xiaoyu-actor-id <id> --expected-count 16 --expected-plan-hash <64hex>
```

Unknown flags, count/hash mismatch, or changed source rows fail before commit.

- [ ] **Step 5: Run owner migration and Event Core backfill regressions**

Run: `cd repos/orbits && node --test --import tsx tests/services/event-organizer-owner-migration-postgres.test.ts tests/services/event-organizer-owner-command.test.ts tests/services/event-core.test.ts tests/services/event-core-backfill-command.test.ts tests/services/event-core-backfill-idempotency-postgres.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit owner migration**

```bash
git add repos/orbits/features/events/organizer-accounts/owner-migration.ts repos/orbits/scripts/migrate-event-organizer-owners.ts repos/orbits/package.json repos/orbits/tests/services/event-organizer-owner-migration-postgres.test.ts repos/orbits/tests/services/event-organizer-owner-command.test.ts
git commit -m "feat(events): migrate account-backed organizers"
```

### Task 5: Execute the Local Database Migration

**Files:**
- Create locally, ignored: `.artifacts/db-backups/orbit-before-multi-account-<timestamp>.dump`
- Update through commands: local PostgreSQL database only

**Interfaces:**
- Consumes: Tasks 1-4 commands and existing `db:migrate:live`, `db:backfill:auth-accounts`, and `db:backfill:event-core`.
- Produces: migrated local database plus reviewed command outputs.

- [ ] **Step 1: Verify environment and identify Xiaoyu's canonical actor**

Run read-only queries that identify AuthUser `user_mry5y200_58jpi8` with display name `agenthubs` and provider `google`, plus Xiaoyu's Account `account_orbit_generated` and public Profile `profile_orbit_generated_operator`. Confirm `demo` and `Zhao Xin` are different AuthUsers. Stop visibly on any mismatch or duplicate membership.

- [ ] **Step 2: Create a full compressed database backup**

Run from `repos/orbits` after loading local env:

```bash
mkdir -p ../../.artifacts/db-backups
pg_dump "$ORBIT_EVENT_DATABASE_URL" --format=custom --file="../../.artifacts/db-backups/orbit-before-multi-account-$(date +%Y%m%d-%H%M%S).dump"
```

Verify `pg_restore --list <dump>` exits 0 before any mutation.

- [ ] **Step 3: Apply schema migration**

Run:

```bash
npm run db:migrate:live
```

Verify Event Operations schema version 15 exists. Do not run generic auth-account repair before the reviewed Xiaoyu membership exists.

- [ ] **Step 4: Dry-run and apply organizer account bootstrap**

Run dry-run with `--xiaoyu-auth-user-id user_mry5y200_58jpi8`, capture its count/hash, review that it contains 13 account, 6 contact-link, 1 Xiaoyu membership, and 2 canonical owner-repair operations (22 total), then apply with the same count/hash and `ORBIT_DEMO_ORGANIZER_PASSWORD` present only in the process environment.

- [ ] **Step 5: Repair remaining auth account chains**

Run `npm run db:backfill:auth-accounts` only after the Xiaoyu membership is active. Verify all existing AuthUsers have a resolvable Account/Profile and that no Account owned by `user_mry5y200_58jpi8` was created; `agenthubs` must still resolve to `account_orbit_generated`.

- [ ] **Step 6: Dry-run and apply 16 legacy owner assignments**

Run dry-run, verify exactly 16 event IDs and the reviewed owner grouping, then apply with expected count/hash.

- [ ] **Step 7: Dry-run and apply standard Event Core backfill**

Set `EVENT_CORE_BACKFILL_TIMEZONE=Asia/Tokyo` and `EVENT_CORE_PUBLIC_OWNER_ACTOR_ID` to Xiaoyu only as the fallback required by the existing command. Review count/hash, then apply. The 16 reviewed events must use their now-persisted per-event `user_id`, not the fallback.

- [ ] **Step 8: Verify database invariants**

Run read-only SQL assertions for 14 complete organizer identity chains, the exact `agenthubs` to `account_orbit_generated` membership with no shadow Account, 16 exact owner assignments, 3 Xiaoyu-owned events, 6 active Xiaoyu ContactActorLinks, 7 non-network owners with no Xiaoyu link, and no Contact/Profile/email-shaped `organizer_actor_id` values.

### Task 6: End-to-End Verification and Final Commit Check

**Files:**
- Modify only if a verified regression requires it: tests/source from Tasks 1-4

**Interfaces:**
- Consumes: migrated local database and all focused tests.
- Produces: evidence that authentication and event authorization use the new data correctly.

- [ ] **Step 1: Verify all 14 registered identities**

Use AuthUserService/HTTP login tests to verify the shared local demo password succeeds for each of the 13 newly registered organizer emails and a wrong password fails. Preserve Xiaoyu's existing credential unchanged; verify her existing AuthUser resolves to the reviewed Account/Profile/Actor chain and can establish a Session through the already configured login path. Do not print any password or hash.

- [ ] **Step 2: Verify actor-scoped event visibility**

For each owner, resolve Session user to Actor and assert Event Center returns only owned or explicitly delegated events. Xiaoyu returns exactly the 3 reviewed owned events before any role assignments are considered.

- [ ] **Step 3: Run focused automated tests**

Run:

```bash
cd repos/orbits
node --test --import tsx \
  tests/services/event-organizer-account-manifest.test.ts \
  tests/capabilities/contact-actor-link-storage.test.ts \
  tests/services/event-organizer-account-bootstrap.test.ts \
  tests/services/event-organizer-account-bootstrap-command.test.ts \
  tests/services/event-organizer-owner-migration-postgres.test.ts \
  tests/services/event-organizer-owner-command.test.ts \
  tests/capabilities/auth-user-service.test.ts \
  tests/services/event-core-backfill-command.test.ts
npm run lint
```

Expected: all focused tests PASS and lint exits 0.

- [ ] **Step 4: Run GitNexus change detection**

Run `gitnexus_detect_changes({repo: "orbit", scope: "staged"})` before each commit and final review. Any HIGH/CRITICAL unexpected process impact blocks completion.

- [ ] **Step 5: Report residual baseline failures separately**

Run `npm test`; compare with the known baseline rather than claiming a clean suite if unrelated repository failures remain. Report exact pass/fail/skip counts and identify any new failure introduced by this migration.
