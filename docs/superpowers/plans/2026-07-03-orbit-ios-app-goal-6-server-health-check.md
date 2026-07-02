# Orbit iOS App Goal 6: Server Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the mobile Server settings screen verify whether the configured Orbit API server is reachable.

**Architecture:** Keep server address persistence in `ApiBaseUrlProvider`. Add a small health view-model that maps `/api/health` payloads into user-safe copy, then call the existing `OrbitApiClient` from `ApiSettingsScreen` when the user taps a check button.

**Tech Stack:** Expo Router, React Native, TypeScript, existing Orbit API envelope client, Node test runner with `tsx`.

## Global Constraints

- Do not import source from `repos/orbits`.
- Use `GET /api/health` through the existing API client.
- Do not display raw `mode`, `mock`, `hybrid`, `provider`, `fixture`, or boundary payload text in user-facing copy.
- Keep Settings controls compact and one-handed.
- Add automated tests before production code.
- Verify with `npm test`, `npm run typecheck`, Expo config, and a mobile-width screenshot.

---

### Task 1: Health View Model

**Files:**
- Create: `repos/orbit-app/src/view-models/health.ts`
- Create: `repos/orbit-app/tests/health-view-model.test.ts`

**Interfaces:**
- Consumes: unknown `/api/health` data payload.
- Produces: `healthPayloadToSummary(data: unknown): HealthCheckSummary`.

- [ ] **Step 1: Write the failing test**

Create `repos/orbit-app/tests/health-view-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { healthPayloadToSummary } from "../src/view-models/health";

test("healthPayloadToSummary maps ok health payloads without runtime labels", () => {
  const summary = healthPayloadToSummary({
    boundary: {
      mockToLive: "Switch providers through ORBIT_MODULE_MODE."
    },
    mode: "mock",
    service: "orbit-runtime",
    status: "ok"
  });

  assert.deepEqual(summary, {
    detail: "orbit-runtime responded successfully.",
    title: "Server reachable"
  });
});

test("healthPayloadToSummary maps unknown payloads safely", () => {
  assert.deepEqual(healthPayloadToSummary({}), {
    detail: "Health details are unavailable.",
    title: "Server responded"
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd repos/orbit-app
npm test -- tests/health-view-model.test.ts
```

Expected: fail because `src/view-models/health.ts` does not exist.

- [ ] **Step 3: Implement the view model**

Create `repos/orbit-app/src/view-models/health.ts` with:

```ts
export interface HealthCheckSummary {
  detail: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : "";
}

export function healthPayloadToSummary(data: unknown): HealthCheckSummary {
  const payload = isRecord(data) ? data : {};
  const service = stringField(payload, "service") || "Orbit API";
  const status = stringField(payload, "status").toLowerCase();

  if (status === "ok") {
    return {
      detail: `${service} responded successfully.`,
      title: "Server reachable"
    };
  }

  return {
    detail: "Health details are unavailable.",
    title: "Server responded"
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd repos/orbit-app
npm test -- tests/health-view-model.test.ts
```

Expected: pass.

---

### Task 2: Settings Check Button

**Files:**
- Modify: `repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx`

**Interfaces:**
- Consumes: `useOrbitApiBaseUrl`, `createOrbitApiClient`, `ORBIT_API_ENDPOINTS.health`, and `healthPayloadToSummary`.
- Produces: a Check button and status message on the Server settings screen.

- [ ] **Step 1: Run impact analysis before editing**

Run GitNexus impact analysis for `ApiSettingsScreen`:

```text
gitnexus_impact target=ApiSettingsScreen direction=upstream file_path=repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx
```

If not indexed, record local mobile risk and proceed.

- [ ] **Step 2: Add health check state**

In `ApiSettingsScreen`, add:

```ts
const [checkingHealth, setCheckingHealth] = useState(false);
const [healthMessage, setHealthMessage] = useState<string | null>(null);
```

- [ ] **Step 3: Add health check action**

Use the current draft URL so a user can test before saving:

```ts
async function checkServerHealth() {
  setCheckingHealth(true);
  setHealthMessage(null);

  try {
    const client = createOrbitApiClient({ baseUrl: draftBaseUrl });
    const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.health);

    if (result.success) {
      const summary = healthPayloadToSummary(result.data);
      setHealthMessage(`${summary.title}. ${summary.detail}`);
    } else {
      setHealthMessage(result.error.message);
    }
  } catch (checkError) {
    setHealthMessage(
      checkError instanceof Error
        ? checkError.message
        : "Could not check this server."
    );
  } finally {
    setCheckingHealth(false);
  }
}
```

- [ ] **Step 4: Add the Check button**

Add a third button next to Save and Reset:

```tsx
<Pressable accessibilityRole="button" disabled={checkingHealth} onPress={checkServerHealth}>
  <Text>{checkingHealth ? "Checking" : "Check"}</Text>
</Pressable>
```

Use existing button styles; do not add new visual patterns unless needed.

- [ ] **Step 5: Render health message**

Render `healthMessage` below the form message:

```tsx
{healthMessage ? <Text style={styles.message}>{healthMessage}</Text> : null}
```

---

### Task 3: Verification And Commit

**Files:**
- Modify: `repos/orbit-app/README.md`

**Interfaces:**
- Consumes: local API server and Expo web server.
- Produces: screenshot evidence and a focused commit.

- [ ] **Step 1: Update README**

Add this sentence near the Server screen description:

```markdown
The Server screen can check `/api/health` before saving a local, LAN, or remote API address.
```

- [ ] **Step 2: Run verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
npx expo config --type public
```

Expected: all pass.

- [ ] **Step 3: Screenshot Settings**

Open `/settings/api` at iPhone width, click `Check`, and save:

```text
/tmp/orbit-app-server-health-check.png
```

Expected visible text includes:

- `Server`
- `Current server`
- `Check`
- `Server reachable. orbit-runtime responded successfully.`

Expected forbidden text is absent:

- `mock`
- `hybrid`
- `provider`
- `fixture`

- [ ] **Step 4: Clean generated noise**

If Expo rewrites `.gitignore` or `expo-env.d.ts`, remove generated changes.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-6-server-health-check.md repos/orbit-app/README.md repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx repos/orbit-app/src/view-models/health.ts repos/orbit-app/tests/health-view-model.test.ts
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): add server health check"
```

Expected: focused commit with mobile Settings health check and tests.

## Self-Review

- Spec coverage: uses `/api/health`, keeps server validation in Settings, hides provider/runtime labels from normal copy.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: `HealthCheckSummary` and `healthPayloadToSummary` are defined before use.

## Execution Choice

The user asked for autonomous execution without external intervention. Execute inline in this session using the plan above.
