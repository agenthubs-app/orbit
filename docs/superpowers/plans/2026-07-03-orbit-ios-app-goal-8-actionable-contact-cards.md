# Orbit iOS App Goal 8: Actionable Contact Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile Contacts tab show next action, status, and value context from `/api/contacts`.

**Architecture:** Keep Contacts as a list with existing detail navigation. Expand the mobile contact summary mapper to include user-facing status, next action, and value score, then render those fields in the existing card list without exposing source/provider internals.

**Tech Stack:** Expo Router, React Native, TypeScript, existing `useApiResource`, Node test runner with `tsx`.

## Global Constraints

- Do not import source from `repos/orbits`.
- Do not display raw source, provider, fixture, audit, generatedBy, or implementation flags.
- Keep contact cards tappable and preserve existing contact detail navigation.
- Add automated tests before production code.
- Verify with `npm test`, `npm run typecheck`, and a mobile-width screenshot.

---

### Task 1: Expand Contact Summary Mapper

**Files:**
- Modify: `repos/orbit-app/src/view-models/contacts.ts`
- Modify: `repos/orbit-app/tests/screen-state.test.ts`

**Interfaces:**
- Consumes: `/api/contacts` list payload items.
- Produces: `ContactSummary` with `nextAction`, `status`, and `valueScore`.

- [ ] **Step 1: Write the failing test**

Update `contactsToSummaries maps contact list payloads` in `repos/orbit-app/tests/screen-state.test.ts` so the input contact includes:

```ts
nextAction: "Send the storage intro.",
status: "needs_follow_up",
value: {
  score: 91
}
```

and the expected summary includes:

```ts
nextAction: "Send the storage intro.",
status: "Needs follow up",
valueScore: 91
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

Expected: fail because the mapper does not return the new fields.

- [ ] **Step 3: Implement the expanded mapper**

Update `ContactSummary`:

```ts
export interface ContactSummary {
  id: string;
  name: string;
  nextAction: string;
  organization: string;
  relationship: string;
  status: string;
  valueScore: number | null;
}
```

Add helpers:

```ts
function numberField(record: Record<string, unknown>, fieldName: string): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelFromToken(value: string, fallback: string): string {
  const normalized = value.replace(/[_-]+/gu, " ").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function valueScore(contact: Record<string, unknown>): number | null {
  const value = contact.value;
  return isRecord(value) ? numberField(value, "score") : null;
}
```

Map:

```ts
nextAction: stringField(
  contact,
  "nextAction",
  "Ask Orbit AI for the next relationship move."
),
status: labelFromToken(stringField(contact, "status"), "Active"),
valueScore: valueScore(contact)
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

Expected: pass.

---

### Task 2: Render Actionable Contact Cards

**Files:**
- Modify: `repos/orbit-app/src/screens/contacts/ContactsScreen.tsx`

**Interfaces:**
- Consumes: expanded `ContactSummary`.
- Produces: contact list cards with organization/status detail, relationship context, next action, and optional value score.

- [ ] **Step 1: Run impact analysis before editing**

Run GitNexus impact analysis for `ContactsScreen`:

```text
gitnexus_impact target=ContactsScreen direction=upstream file_path=repos/orbit-app/src/screens/contacts/ContactsScreen.tsx
```

If not indexed, record local mobile risk and proceed.

- [ ] **Step 2: Render richer contact text**

Replace the existing body text with:

```tsx
<Text style={styles.relationshipText}>{contact.relationship}</Text>
<Text style={styles.nextActionText}>{contact.nextAction}</Text>
{contact.valueScore === null ? null : (
  <Text style={styles.valueText}>{contact.valueScore} value score</Text>
)}
```

Set card detail to:

```tsx
detail={[contact.organization, contact.status].filter(Boolean).join(" | ")}
```

- [ ] **Step 3: Add compact text styles**

Use existing colors and typography:

```ts
relationshipText: {
  color: colors.ink,
  fontSize: typography.small,
  lineHeight: 20
},
nextActionText: {
  color: colors.muted,
  fontSize: typography.small,
  lineHeight: 20
},
valueText: {
  color: colors.accent,
  fontSize: typography.caption,
  fontWeight: "800",
  textTransform: "uppercase"
}
```

---

### Task 3: Verification And Commit

**Files:**
- Modify: `repos/orbit-app/README.md`

**Interfaces:**
- Consumes: local `/api/contacts`.
- Produces: screenshot evidence and focused commit.

- [ ] **Step 1: Update README**

Change the Contacts bullet to:

```markdown
- Contacts: reads `/api/contacts` and shows next action, status, and value context.
```

- [ ] **Step 2: Run verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

Expected: both pass.

- [ ] **Step 3: Screenshot Contacts**

Open the Contacts tab at iPhone width and save:

```text
/tmp/orbit-app-contacts-actionable-cards.png
```

Expected visible text includes:

- `Contacts`
- `Kenji Watanabe`
- `Aster Grid`
- `Needs follow up`
- `Send Kenji the storage pilot operator intro`
- `91 value score`

Expected forbidden text is absent:

- `provider`
- `fixture`
- `generatedBy`
- `mock`

- [ ] **Step 4: Clean generated noise**

If Expo rewrites `.gitignore` or `expo-env.d.ts`, remove generated changes.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-8-actionable-contact-cards.md repos/orbit-app/README.md repos/orbit-app/src/view-models/contacts.ts repos/orbit-app/src/screens/contacts/ContactsScreen.tsx repos/orbit-app/tests/screen-state.test.ts
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): show actionable contact cards"
```

Expected: focused commit with Contacts mapper, UI, tests, docs.

## Self-Review

- Spec coverage: improves Contacts with API-backed data, preserves detail navigation, avoids provider/source internals.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: `ContactSummary` fields match mapper output and Contacts screen usage.

## Execution Choice

The user asked for autonomous execution without external intervention. Execute inline in this session using the plan above.
