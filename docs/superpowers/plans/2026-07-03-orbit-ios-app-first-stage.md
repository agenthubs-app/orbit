# Orbit iOS App First Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working iOS-first Orbit mobile app foundation in `repos/orbit-app`, with Expo Router, typed API envelope handling, mobile route states, and the first data-backed app screens.

**Architecture:** `repos/orbit-app` is an independent Expo client that consumes `repos/orbits` HTTP API routes. It does not import Next.js pages, web presenters, feature services, live storage, Supabase, or `orbit_records`; all business behavior stays behind the existing web/API service boundaries.

**Tech Stack:** Expo, Expo Router, React Native, TypeScript, Node test runner with `tsx`, npm scripts, iOS simulator as the first runtime target.

## Global Constraints

- Create `repos/orbit-app` as the iOS-first mobile client for Orbit.
- Keep `repos/orbits` as the web app, API host, feature-service runtime, and live storage boundary.
- Use an independent Expo app in `repos/orbit-app`.
- Do not wrap the existing web app in a WebView.
- Do not immediately convert the root repository into a JavaScript monorepo with shared packages.
- Do not let the mobile app read Postgres, Supabase, `orbit_records`, or local web storage directly.
- Base URL is configured through `EXPO_PUBLIC_ORBIT_API_BASE_URL`.
- Local default is `http://localhost:3000` for iOS simulator.
- Every request sets `Accept: application/json`.
- JSON parsing must tolerate non-JSON responses and return a controlled error.
- `success: false` envelopes become typed failure states instead of thrown UI crashes.
- Runtime headers such as `X-Orbit-Feature-Mode` are captured for debugging.
- Mobile screens must not branch on mock, hybrid, or live provider internals.
- Use stable JavaScript tabs rather than alpha native tabs.
- Do not expose implementation labels such as mock, hybrid, provider, or command-center in user-facing copy.
- Mobile implementation must avoid editing or reverting existing `repos/orbits` files unless a later task explicitly requires a web API change.

---

## File Structure

Create this project tree:

```text
repos/orbit-app/
  AGENTS.md
  README.md
  app.config.ts
  babel.config.js
  expo-env.d.ts
  package.json
  tsconfig.json
  app/
    _layout.tsx
    index.tsx
    (tabs)/
      _layout.tsx
      ai.tsx
      contacts.tsx
      events.tsx
      profile.tsx
      schedule.tsx
    contacts/
      [id].tsx
    events/
      [id].tsx
    settings/
      api.tsx
  src/
    api/
      client.ts
      endpoints.ts
      types.ts
    components/
      AppScreen.tsx
      DataCard.tsx
      EmptyState.tsx
      ErrorState.tsx
      LoadingState.tsx
      MetricPill.tsx
      SectionHeader.tsx
    design/
      tokens.ts
    hooks/
      useApiResource.ts
    screens/
      ai/
        AiScreen.tsx
      contacts/
        ContactDetailScreen.tsx
        ContactsScreen.tsx
      events/
        EventDetailScreen.tsx
        EventsScreen.tsx
      profile/
        ProfileScreen.tsx
      schedule/
        ScheduleScreen.tsx
      settings/
        ApiSettingsScreen.tsx
    view-models/
      bootstrap.ts
      contacts.ts
      conversations.ts
      events.ts
      profile.ts
      route-state.ts
      schedule.ts
  tests/
    api-client.test.ts
    bootstrap-view-model.test.ts
    screen-state.test.ts
```

Do not add generated screenshot files, simulator artifacts, `.expo/`, `node_modules/`, or build output to the repository.

### Task 1: Scaffold The Expo iOS Project

**Files:**
- Create: `repos/orbit-app/AGENTS.md`
- Create: `repos/orbit-app/package.json`
- Create: `repos/orbit-app/app.config.ts`
- Create: `repos/orbit-app/babel.config.js`
- Create: `repos/orbit-app/tsconfig.json`
- Create: `repos/orbit-app/expo-env.d.ts`
- Create: `repos/orbit-app/app/_layout.tsx`
- Create: `repos/orbit-app/app/index.tsx`
- Create: `repos/orbit-app/app/(tabs)/_layout.tsx`
- Create: `repos/orbit-app/app/(tabs)/ai.tsx`
- Create: `repos/orbit-app/README.md`

**Interfaces:**
- Consumes: the approved design in `docs/superpowers/specs/2026-07-03-orbit-ios-app-design.md`.
- Produces: an Expo Router TypeScript app with scripts `start`, `ios`, `typecheck`, and `test`.

- [ ] **Step 1: Create the project directory and write policy**

Create `repos/orbit-app/AGENTS.md` with:

```markdown
# Orbit App Agent Rules

This directory is the iOS-first Orbit mobile app.

- Edit only files inside `repos/orbit-app` when implementing mobile app tasks.
- Do not import source files from `../orbits`; use HTTP APIs exposed by `repos/orbits`.
- Do not read or write Postgres, Supabase, `orbit_records`, or browser localStorage from the mobile app.
- Keep user-facing copy free of implementation labels such as mock, hybrid, provider, or command-center.
- Do not commit `.expo/`, `node_modules/`, simulator output, screenshots, native build artifacts, or generated logs.
- If a mobile screen needs missing backend behavior, document the API gap instead of duplicating business logic locally.
```

- [ ] **Step 2: Write package metadata**

Create `repos/orbit-app/package.json` with:

```json
{
  "name": "orbit-app",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "test": "node --test --import tsx \"tests/**/*.test.ts\""
  },
  "dependencies": {
    "@expo/vector-icons": "latest",
    "expo": "latest",
    "expo-constants": "latest",
    "expo-linking": "latest",
    "expo-router": "latest",
    "expo-status-bar": "latest",
    "react": "latest",
    "react-native": "latest",
    "react-native-safe-area-context": "latest",
    "react-native-screens": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "tsx": "latest",
    "typescript": "latest"
  }
}
```

- [ ] **Step 3: Write Expo app config**

Create `repos/orbit-app/app.config.ts` with:

```ts
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Orbit",
  slug: "orbit-app",
  scheme: "orbit",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "app.agenthubs.orbit"
  },
  extra: {
    orbitApiBaseUrl:
      process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ?? "http://localhost:3000"
  }
};

export default config;
```

- [ ] **Step 4: Write TypeScript and Babel config**

Create `repos/orbit-app/tsconfig.json` with:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": [
    "app/**/*.ts",
    "app/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "app.config.ts",
    "expo-env.d.ts"
  ]
}
```

Create `repos/orbit-app/babel.config.js` with:

```js
module.exports = function orbitAppBabelConfig(api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src"
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
        }
      ]
    ]
  };
};
```

Create `repos/orbit-app/expo-env.d.ts` with:

```ts
/// <reference types="expo/types" />
```

- [ ] **Step 5: Write minimal routes**

Create `repos/orbit-app/app/_layout.tsx` with:

```tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}
```

Create `repos/orbit-app/app/index.tsx` with:

```tsx
import { Redirect } from "expo-router";

export default function IndexRoute() {
  return <Redirect href="/ai" />;
}
```

Create `repos/orbit-app/app/(tabs)/_layout.tsx` with:

```tsx
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="ai" options={{ title: "Orbit AI" }} />
      <Tabs.Screen name="events" options={{ title: "Events" }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts" }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
```

Create `repos/orbit-app/app/(tabs)/ai.tsx` with:

```tsx
import { Text, View } from "react-native";

export default function AiRoute() {
  return (
    <View>
      <Text>Orbit AI</Text>
    </View>
  );
}
```

- [ ] **Step 6: Install dependencies and verify typecheck**

Run:

```bash
cd repos/orbit-app
npm install
npm run typecheck
```

Expected: `npm install` creates `package-lock.json`; `npm run typecheck` exits 0.

- [ ] **Step 7: Commit scaffold**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app
git commit -m "feat(mobile): scaffold Orbit iOS app"
```

Only `repos/orbit-app/**` files should be staged for this commit.

### Task 2: API Envelope Client

**Files:**
- Create: `repos/orbit-app/src/api/types.ts`
- Create: `repos/orbit-app/src/api/client.ts`
- Create: `repos/orbit-app/src/api/endpoints.ts`
- Create: `repos/orbit-app/tests/api-client.test.ts`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_ORBIT_API_BASE_URL`; `ApiEnvelope<T>` shape from `repos/orbits/shared/api/envelope.ts`.
- Produces:
  - `ApiEnvelope<T>`
  - `ApiResult<T>`
  - `OrbitApiClient`
  - `createOrbitApiClient(options?: OrbitApiClientOptions): OrbitApiClient`

- [ ] **Step 1: Write failing API client tests**

Create `repos/orbit-app/tests/api-client.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrbitApiClient,
  type FetchLike
} from "../src/api/client";

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "X-Orbit-Feature-Mode": "live",
      ...(init.headers ?? {})
    },
    status: init.status ?? 200
  });
}

test("Orbit API client unwraps success envelopes and runtime headers", async () => {
  const calls: RequestInfo[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push(input);
    assert.equal((init?.headers as Record<string, string>).Accept, "application/json");
    return response(JSON.stringify({ success: true, data: { ok: true } }));
  };
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl
  });

  const result = await client.get<{ ok: boolean }>("/api/health");

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.meta.featureMode, "live");
  assert.equal(String(calls[0]), "http://localhost:3000/api/health");
});

test("Orbit API client returns failure envelopes without throwing", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      response(
        JSON.stringify({
          success: false,
          error: { code: "NOT_IMPLEMENTED", message: "Live service is missing" }
        }),
        { status: 503 }
      )
  });

  const result = await client.get("/api/app/bootstrap");

  assert.equal(result.success, false);
  assert.equal(result.error.code, "NOT_IMPLEMENTED");
  assert.equal(result.status, 503);
});

test("Orbit API client reports non JSON responses as controlled failures", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      new Response("<html>bad gateway</html>", {
        headers: { "Content-Type": "text/html" },
        status: 502
      })
  });

  const result = await client.get("/api/health");

  assert.equal(result.success, false);
  assert.equal(result.error.code, "ORBIT_APP_NON_JSON_RESPONSE");
  assert.equal(result.status, 502);
});

test("Orbit API client reports network failures as offline failures", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () => {
      throw new Error("connection refused");
    }
  });

  const result = await client.get("/api/health");

  assert.equal(result.success, false);
  assert.equal(result.error.code, "ORBIT_APP_NETWORK_ERROR");
  assert.equal(result.status, 0);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd repos/orbit-app
npm test
```

Expected: FAIL because `src/api/client.ts` does not exist.

- [ ] **Step 3: Implement API types**

Create `repos/orbit-app/src/api/types.ts` with:

```ts
export interface ApiErrorBody {
  code: string;
  message: string;
  context?: Readonly<Record<string, string>>;
}

export interface ApiSuccessEnvelope<TData> {
  success: true;
  data: TData;
}

export interface ApiFailureEnvelope {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<TData> =
  | ApiSuccessEnvelope<TData>
  | ApiFailureEnvelope;

export interface OrbitApiMeta {
  featureMode: string | null;
  privacy: string | null;
  runtimeBoundary: string | null;
}

export type ApiResult<TData> =
  | (ApiSuccessEnvelope<TData> & {
      meta: OrbitApiMeta;
      status: number;
    })
  | (ApiFailureEnvelope & {
      meta: OrbitApiMeta;
      status: number;
    });
```

- [ ] **Step 4: Implement the API client**

Create `repos/orbit-app/src/api/client.ts` with:

```ts
import Constants from "expo-constants";
import type { ApiEnvelope, ApiResult, OrbitApiMeta } from "./types";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface OrbitApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface OrbitApiRequestOptions {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

export interface OrbitApiClient {
  readonly baseUrl: string;
  get: <TData>(path: string, options?: OrbitApiRequestOptions) => Promise<ApiResult<TData>>;
  post: <TData>(path: string, options?: OrbitApiRequestOptions) => Promise<ApiResult<TData>>;
}

function configuredBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { orbitApiBaseUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ??
    extra?.orbitApiBaseUrl ??
    "http://localhost:3000"
  );
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function pathToUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
}

function metaFromResponse(response: Response): OrbitApiMeta {
  return {
    featureMode: response.headers.get("X-Orbit-Feature-Mode"),
    privacy: response.headers.get("X-Orbit-Privacy"),
    runtimeBoundary: response.headers.get("X-Orbit-Runtime-Boundary")
  };
}

function failureResult(
  status: number,
  meta: OrbitApiMeta,
  code: string,
  message: string
): ApiResult<never> {
  return {
    success: false,
    error: { code, message },
    meta,
    status
  };
}

function isEnvelope<TData>(value: unknown): value is ApiEnvelope<TData> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.success === true || record.success === false;
}

async function request<TData>(
  baseUrl: string,
  fetchImpl: FetchLike,
  method: "GET" | "POST",
  path: string,
  options: OrbitApiRequestOptions = {}
): Promise<ApiResult<TData>> {
  let response: Response;

  try {
    response = await fetchImpl(pathToUrl(baseUrl, path), {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {})
      },
      method
    });
  } catch (error) {
    return failureResult(
      0,
      { featureMode: null, privacy: null, runtimeBoundary: null },
      "ORBIT_APP_NETWORK_ERROR",
      error instanceof Error ? error.message : "Network request failed"
    );
  }

  const meta = metaFromResponse(response);
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_NON_JSON_RESPONSE",
      `Expected JSON from ${path}, received ${contentType || "unknown content type"}`
    );
  }

  const payload = (await response.json()) as unknown;

  if (!isEnvelope<TData>(payload)) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_INVALID_ENVELOPE",
      `Response from ${path} did not match the Orbit API envelope`
    );
  }

  return {
    ...payload,
    meta,
    status: response.status
  };
}

export function createOrbitApiClient({
  baseUrl = configuredBaseUrl(),
  fetchImpl = fetch
}: OrbitApiClientOptions = {}): OrbitApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    baseUrl: normalizedBaseUrl,
    get<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(normalizedBaseUrl, fetchImpl, "GET", path, options);
    },
    post<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(normalizedBaseUrl, fetchImpl, "POST", path, options);
    }
  };
}
```

- [ ] **Step 5: Add endpoint constants**

Create `repos/orbit-app/src/api/endpoints.ts` with:

```ts
export const ORBIT_API_ENDPOINTS = {
  bootstrap: "/api/app/bootstrap",
  contacts: "/api/contacts",
  conversations: "/api/ai/conversations",
  events: "/api/events",
  health: "/api/health",
  profile: "/api/profile",
  tasks: "/api/tasks"
} as const;
```

- [ ] **Step 6: Run verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit API client**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app/src/api repos/orbit-app/tests/api-client.test.ts
git commit -m "feat(mobile): add Orbit API envelope client"
```

### Task 3: Route State And View-Model Mappers

**Files:**
- Create: `repos/orbit-app/src/view-models/route-state.ts`
- Create: `repos/orbit-app/src/view-models/bootstrap.ts`
- Create: `repos/orbit-app/src/view-models/conversations.ts`
- Create: `repos/orbit-app/src/view-models/events.ts`
- Create: `repos/orbit-app/src/view-models/contacts.ts`
- Create: `repos/orbit-app/src/view-models/schedule.ts`
- Create: `repos/orbit-app/src/view-models/profile.ts`
- Create: `repos/orbit-app/tests/bootstrap-view-model.test.ts`
- Create: `repos/orbit-app/tests/screen-state.test.ts`

**Interfaces:**
- Consumes: `ApiResult<TData>` from Task 2.
- Produces:
  - `RouteState<TData>`
  - `resultToRouteState<TData>(result: ApiResult<TData>, empty: (data: TData) => boolean): RouteState<TData>`
  - `AppBootstrapSummary`
  - screen summary mappers for first-stage screens.

- [ ] **Step 1: Write route-state tests**

Create `repos/orbit-app/tests/screen-state.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resultToRouteState } from "../src/view-models/route-state";
import type { ApiResult } from "../src/api/types";

test("resultToRouteState maps successful non-empty data", () => {
  const result: ApiResult<{ items: string[] }> = {
    success: true,
    data: { items: ["a"] },
    meta: { featureMode: "live", privacy: "no-relationship-data", runtimeBoundary: "developer-admin" },
    status: 200
  };

  assert.deepEqual(resultToRouteState(result, (data) => data.items.length === 0), {
    kind: "success",
    data: { items: ["a"] },
    meta: result.meta
  });
});

test("resultToRouteState maps empty success", () => {
  const result: ApiResult<{ items: string[] }> = {
    success: true,
    data: { items: [] },
    meta: { featureMode: "live", privacy: null, runtimeBoundary: null },
    status: 200
  };

  assert.equal(resultToRouteState(result, (data) => data.items.length === 0).kind, "empty");
});

test("resultToRouteState maps network failure to offline", () => {
  const result: ApiResult<never> = {
    success: false,
    error: { code: "ORBIT_APP_NETWORK_ERROR", message: "connection refused" },
    meta: { featureMode: null, privacy: null, runtimeBoundary: null },
    status: 0
  };

  assert.equal(resultToRouteState(result, () => false).kind, "offline");
});
```

- [ ] **Step 2: Write bootstrap mapper test**

Create `repos/orbit-app/tests/bootstrap-view-model.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapToSummary } from "../src/view-models/bootstrap";

test("bootstrapToSummary keeps mobile-facing counts and prompt context", () => {
  const summary = bootstrapToSummary({
    primaryPromptContext: "Prepare for today's relationship work",
    supportingCounts: [
      { label: "Events", value: 3 },
      { label: "Contacts", value: 12 }
    ],
    workspace: {
      label: "Orbit workspace",
      timezone: "Asia/Tokyo"
    }
  });

  assert.deepEqual(summary, {
    counts: [
      { label: "Events", value: 3 },
      { label: "Contacts", value: 12 }
    ],
    prompt: "Prepare for today's relationship work",
    workspaceLabel: "Orbit workspace",
    timezone: "Asia/Tokyo"
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
cd repos/orbit-app
npm test
```

Expected: FAIL because `src/view-models/route-state.ts` and `src/view-models/bootstrap.ts` do not exist.

- [ ] **Step 4: Implement route state**

Create `repos/orbit-app/src/view-models/route-state.ts` with:

```ts
import type { ApiErrorBody, ApiResult, OrbitApiMeta } from "../api/types";

export type RouteState<TData> =
  | { kind: "loading" }
  | { kind: "success"; data: TData; meta: OrbitApiMeta }
  | { kind: "empty"; data: TData; meta: OrbitApiMeta }
  | { kind: "failure"; error: ApiErrorBody; meta: OrbitApiMeta; status: number }
  | { kind: "offline"; error: ApiErrorBody };

export function resultToRouteState<TData>(
  result: ApiResult<TData>,
  isEmpty: (data: TData) => boolean
): RouteState<TData> {
  if (result.success === false) {
    if (result.error.code === "ORBIT_APP_NETWORK_ERROR") {
      return { kind: "offline", error: result.error };
    }

    return {
      kind: "failure",
      error: result.error,
      meta: result.meta,
      status: result.status
    };
  }

  if (isEmpty(result.data)) {
    return { kind: "empty", data: result.data, meta: result.meta };
  }

  return { kind: "success", data: result.data, meta: result.meta };
}
```

- [ ] **Step 5: Implement first-stage summary types and mappers**

Create `repos/orbit-app/src/view-models/bootstrap.ts` with:

```ts
export interface BootstrapCount {
  label: string;
  value: number;
}

export interface BootstrapWorkspace {
  label?: string;
  timezone?: string;
}

export interface BootstrapPayloadLike {
  primaryPromptContext?: string;
  supportingCounts?: readonly BootstrapCount[];
  workspace?: BootstrapWorkspace;
}

export interface AppBootstrapSummary {
  counts: BootstrapCount[];
  prompt: string;
  timezone: string;
  workspaceLabel: string;
}

export function bootstrapToSummary(
  payload: BootstrapPayloadLike
): AppBootstrapSummary {
  return {
    counts: Array.from(payload.supportingCounts ?? []),
    prompt: payload.primaryPromptContext ?? "Open Orbit AI to prepare your next relationship move.",
    timezone: payload.workspace?.timezone ?? "Asia/Tokyo",
    workspaceLabel: payload.workspace?.label ?? "Orbit"
  };
}
```

Create `repos/orbit-app/src/view-models/conversations.ts` with:

```ts
export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
}

export function conversationsToSummaries(payload: unknown): ConversationSummary[] {
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as { conversations?: unknown };
  if (!Array.isArray(record.conversations)) return [];

  return record.conversations.map((item, index) => {
    const row = item as { conversationId?: string; title?: string; latestMessagePreview?: string };
    return {
      id: row.conversationId ?? `conversation:${index}`,
      preview: row.latestMessagePreview ?? "",
      title: row.title ?? "Orbit AI conversation"
    };
  });
}
```

Create `repos/orbit-app/src/view-models/events.ts` with:

```ts
export interface EventSummary {
  id: string;
  location: string;
  startsAt: string;
  status: string;
  title: string;
}

export function eventsToSummaries(payload: unknown): EventSummary[] {
  if (typeof payload !== "object" || payload === null) return [];
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  return events.map((item, index) => {
    const row = item as { id?: string; location?: string; startsAt?: string; status?: string; title?: string; name?: string };
    return {
      id: row.id ?? `event:${index}`,
      location: row.location ?? "",
      startsAt: row.startsAt ?? "",
      status: row.status ?? "review",
      title: row.title ?? row.name ?? "Relationship event"
    };
  });
}
```

Create `repos/orbit-app/src/view-models/contacts.ts` with:

```ts
export interface ContactSummary {
  id: string;
  name: string;
  organization: string;
  relationship: string;
}

export function contactsToSummaries(payload: unknown): ContactSummary[] {
  if (typeof payload !== "object" || payload === null) return [];
  const contacts = (payload as { contacts?: unknown }).contacts;
  if (!Array.isArray(contacts)) return [];

  return contacts.map((item, index) => {
    const row = item as { id?: string; displayName?: string; name?: string; organization?: string; relationshipValueSummary?: string };
    return {
      id: row.id ?? `contact:${index}`,
      name: row.displayName ?? row.name ?? "Relationship",
      organization: row.organization ?? "",
      relationship: row.relationshipValueSummary ?? "Relationship context"
    };
  });
}
```

Create `repos/orbit-app/src/view-models/schedule.ts` with:

```ts
export interface ScheduleItemSummary {
  dueAt: string;
  id: string;
  title: string;
}

export function tasksToScheduleItems(payload: unknown): ScheduleItemSummary[] {
  if (typeof payload !== "object" || payload === null) return [];
  const tasks = (payload as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];

  return tasks.map((item, index) => {
    const row = item as { id?: string; dueAt?: string; title?: string };
    return {
      dueAt: row.dueAt ?? "",
      id: row.id ?? `task:${index}`,
      title: row.title ?? "Follow up"
    };
  });
}
```

Create `repos/orbit-app/src/view-models/profile.ts` with:

```ts
export interface ProfileSummary {
  displayName: string;
  headline: string;
  timezone: string;
}

export function profileToSummary(payload: unknown): ProfileSummary {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as { profile?: unknown })
      : {};
  const profile =
    typeof record.profile === "object" && record.profile !== null
      ? (record.profile as { displayName?: string; headline?: string; timezone?: string })
      : {};

  return {
    displayName: profile.displayName ?? "Orbit user",
    headline: profile.headline ?? "Relationship manager",
    timezone: profile.timezone ?? "Asia/Tokyo"
  };
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit mappers**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app/src/view-models repos/orbit-app/tests/bootstrap-view-model.test.ts repos/orbit-app/tests/screen-state.test.ts
git commit -m "feat(mobile): add route state mappers"
```

### Task 4: Mobile Design Tokens And Route State Components

**Files:**
- Create: `repos/orbit-app/src/design/tokens.ts`
- Create: `repos/orbit-app/src/components/AppScreen.tsx`
- Create: `repos/orbit-app/src/components/DataCard.tsx`
- Create: `repos/orbit-app/src/components/EmptyState.tsx`
- Create: `repos/orbit-app/src/components/ErrorState.tsx`
- Create: `repos/orbit-app/src/components/LoadingState.tsx`
- Create: `repos/orbit-app/src/components/MetricPill.tsx`
- Create: `repos/orbit-app/src/components/SectionHeader.tsx`

**Interfaces:**
- Consumes: React Native primitives.
- Produces reusable mobile UI primitives for first-stage screens.

- [ ] **Step 1: Create mobile tokens**

Create `repos/orbit-app/src/design/tokens.ts` with:

```ts
export const colors = {
  accent: "#6D5DF7",
  accentSoft: "#EFEDFF",
  border: "#E7E8EF",
  canvas: "#F7F8FB",
  card: "#FFFFFF",
  danger: "#C2410C",
  ink: "#171821",
  muted: "#6D7280",
  success: "#10A46C",
  warning: "#D97706"
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const radius = {
  card: 8,
  control: 8,
  pill: 999
} as const;

export const typography = {
  body: 16,
  caption: 12,
  heading: 28,
  section: 18,
  small: 14
} as const;
```

- [ ] **Step 2: Create screen shell**

Create `repos/orbit-app/src/components/AppScreen.tsx` with:

```tsx
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../design/tokens";

interface AppScreenProps {
  children: ReactNode;
  eyebrow?: string;
  title: string;
}

export function AppScreen({ children, eyebrow, title }: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md
  },
  content: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  eyebrow: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1
  },
  title: {
    color: colors.ink,
    fontSize: typography.heading,
    fontWeight: "800"
  }
});
```

- [ ] **Step 3: Create card and feedback components**

Create `repos/orbit-app/src/components/DataCard.tsx` with:

```tsx
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../design/tokens";

interface DataCardProps {
  children?: ReactNode;
  detail?: string;
  title: string;
}

export function DataCard({ children, detail, title }: DataCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {children ? <View style={styles.children}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg
  },
  children: {
    marginTop: spacing.md
  },
  detail: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: spacing.xs
  },
  title: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700"
  }
});
```

Create `repos/orbit-app/src/components/EmptyState.tsx` with:

```tsx
import { Text } from "react-native";
import { DataCard } from "./DataCard";

interface EmptyStateProps {
  message: string;
  title: string;
}

export function EmptyState({ message, title }: EmptyStateProps) {
  return (
    <DataCard detail={message} title={title}>
      <Text>{message}</Text>
    </DataCard>
  );
}
```

Create `repos/orbit-app/src/components/ErrorState.tsx` with:

```tsx
import { Text } from "react-native";
import { DataCard } from "./DataCard";

interface ErrorStateProps {
  message: string;
  title?: string;
}

export function ErrorState({ message, title = "Could not load this view" }: ErrorStateProps) {
  return (
    <DataCard detail={message} title={title}>
      <Text>{message}</Text>
    </DataCard>
  );
}
```

Create `repos/orbit-app/src/components/LoadingState.tsx` with:

```tsx
import { ActivityIndicator, View } from "react-native";
import { colors, spacing } from "../design/tokens";

export function LoadingState() {
  return (
    <View style={{ padding: spacing.xl }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
```

Create `repos/orbit-app/src/components/MetricPill.tsx` with:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../design/tokens";

interface MetricPillProps {
  label: string;
  value: number | string;
}

export function MetricPill({ label, value }: MetricPillProps) {
  return (
    <View style={styles.pill}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.muted,
    fontSize: typography.caption
  },
  pill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  value: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: "800"
  }
});
```

Create `repos/orbit-app/src/components/SectionHeader.tsx` with:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../design/tokens";

interface SectionHeaderProps {
  detail?: string;
  title: string;
}

export function SectionHeader({ detail, title }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginTop: spacing.md
  },
  detail: {
    color: colors.muted,
    fontSize: typography.small
  },
  title: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800"
  }
});
```

- [ ] **Step 4: Run verification**

Run:

```bash
cd repos/orbit-app
npm run typecheck
```

Expected: command exits 0.

- [ ] **Step 5: Commit components**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app/src/components repos/orbit-app/src/design
git commit -m "feat(mobile): add Orbit mobile primitives"
```

### Task 5: API Resource Hook And Screen Data Loading

**Files:**
- Create: `repos/orbit-app/src/hooks/useApiResource.ts`
- Create: `repos/orbit-app/src/screens/ai/AiScreen.tsx`
- Create: `repos/orbit-app/src/screens/events/EventsScreen.tsx`
- Create: `repos/orbit-app/src/screens/contacts/ContactsScreen.tsx`
- Create: `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx`
- Create: `repos/orbit-app/src/screens/profile/ProfileScreen.tsx`
- Create: `repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx`

**Interfaces:**
- Consumes: `createOrbitApiClient`, `resultToRouteState`, endpoint constants, and first-stage mappers.
- Produces data-backed mobile screens with controlled loading, success, empty, failure, and offline states.

- [ ] **Step 1: Implement resource hook**

Create `repos/orbit-app/src/hooks/useApiResource.ts` with:

```ts
import { useEffect, useMemo, useState } from "react";
import { createOrbitApiClient } from "../api/client";
import type { RouteState } from "../view-models/route-state";
import { resultToRouteState } from "../view-models/route-state";

export function useApiResource<TData>(
  path: string,
  isEmpty: (data: TData) => boolean
): RouteState<TData> {
  const client = useMemo(() => createOrbitApiClient(), []);
  const [state, setState] = useState<RouteState<TData>>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    setState({ kind: "loading" });
    void client.get<TData>(path).then((result) => {
      if (active) {
        setState(resultToRouteState(result, isEmpty));
      }
    });

    return () => {
      active = false;
    };
  }, [client, isEmpty, path]);

  return state;
}
```

- [ ] **Step 2: Implement Orbit AI screen**

Create `repos/orbit-app/src/screens/ai/AiScreen.tsx` with:

```tsx
import { Text } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { conversationsToSummaries } from "../../view-models/conversations";

export function AiScreen() {
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.conversations, (data) =>
    conversationsToSummaries(data).length === 0
  );

  return (
    <AppScreen eyebrow="Relationship steward" title="Orbit AI">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="Orbit API is offline" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "empty" ? <EmptyState message="Start a conversation to prepare your next relationship move." title="No conversations yet" /> : null}
      {state.kind === "success"
        ? conversationsToSummaries(state.data).map((item) => (
            <DataCard detail={item.preview || "Ready for your next prompt"} key={item.id} title={item.title}>
              <Text>{item.preview || "Ask Orbit AI who to meet, what to prepare, or who needs follow-up."}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
```

- [ ] **Step 3: Implement Events screen**

Create `repos/orbit-app/src/screens/events/EventsScreen.tsx` with:

```tsx
import { Text } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { eventsToSummaries } from "../../view-models/events";

export function EventsScreen() {
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, (data) =>
    eventsToSummaries(data).length === 0
  );

  return (
    <AppScreen eyebrow="Relationship events" title="Events">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="Orbit API is offline" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "empty" ? <EmptyState message="Events from Orbit will appear here." title="No events" /> : null}
      {state.kind === "success"
        ? eventsToSummaries(state.data).map((event) => (
            <DataCard detail={`${event.startsAt} ${event.location}`.trim()} key={event.id} title={event.title}>
              <Text>{event.status}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
```

- [ ] **Step 4: Implement Contacts, Schedule, Profile, and API settings screens**

Create `repos/orbit-app/src/screens/contacts/ContactsScreen.tsx` with:

```tsx
import { Text } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { contactsToSummaries } from "../../view-models/contacts";

export function ContactsScreen() {
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.contacts, (data) =>
    contactsToSummaries(data).length === 0
  );

  return (
    <AppScreen eyebrow="Address book" title="Contacts">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="Orbit API is offline" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "empty" ? <EmptyState message="Evidence-backed relationships will appear here." title="No contacts" /> : null}
      {state.kind === "success"
        ? contactsToSummaries(state.data).map((contact) => (
            <DataCard detail={contact.organization} key={contact.id} title={contact.name}>
              <Text>{contact.relationship}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
```

Create `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx` with:

```tsx
import { Text } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { tasksToScheduleItems } from "../../view-models/schedule";

export function ScheduleScreen() {
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.tasks, (data) =>
    tasksToScheduleItems(data).length === 0
  );

  return (
    <AppScreen eyebrow="Follow-up queue" title="Schedule">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="Orbit API is offline" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "empty" ? <EmptyState message="Follow-up tasks will appear here." title="No follow-ups" /> : null}
      {state.kind === "success"
        ? tasksToScheduleItems(state.data).map((task) => (
            <DataCard detail={task.dueAt} key={task.id} title={task.title}>
              <Text>Review before taking action.</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
```

Create `repos/orbit-app/src/screens/profile/ProfileScreen.tsx` with:

```tsx
import { Text } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { profileToSummary } from "../../view-models/profile";

export function ProfileScreen() {
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false);

  return (
    <AppScreen eyebrow="Relationship identity" title="Profile">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="Orbit API is offline" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "empty" || state.kind === "success" ? (
        <DataCard detail={profileToSummary(state.data).headline} title={profileToSummary(state.data).displayName}>
          <Text>{profileToSummary(state.data).timezone}</Text>
        </DataCard>
      ) : null}
    </AppScreen>
  );
}
```

Create `repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx` with:

```tsx
import { Text } from "react-native";
import { createOrbitApiClient } from "../../api/client";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";

export function ApiSettingsScreen() {
  const client = createOrbitApiClient();

  return (
    <AppScreen eyebrow="Development" title="API Settings">
      <DataCard detail="Used by the iOS simulator and development builds." title="Orbit API base URL">
        <Text>{client.baseUrl}</Text>
      </DataCard>
    </AppScreen>
  );
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
cd repos/orbit-app
npm run typecheck
```

Expected: command exits 0.

- [ ] **Step 6: Commit screens**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app/src/hooks repos/orbit-app/src/screens
git commit -m "feat(mobile): add data-backed mobile screens"
```

### Task 6: Wire Expo Router Tabs To Screens

**Files:**
- Modify: `repos/orbit-app/app/(tabs)/ai.tsx`
- Create: `repos/orbit-app/app/(tabs)/events.tsx`
- Create: `repos/orbit-app/app/(tabs)/contacts.tsx`
- Create: `repos/orbit-app/app/(tabs)/schedule.tsx`
- Create: `repos/orbit-app/app/(tabs)/profile.tsx`
- Create: `repos/orbit-app/app/events/[id].tsx`
- Create: `repos/orbit-app/app/contacts/[id].tsx`
- Create: `repos/orbit-app/app/settings/api.tsx`

**Interfaces:**
- Consumes: screen components from Task 5.
- Produces: file-based Expo Router routes matching the approved navigation model.

- [ ] **Step 1: Replace tab route stubs with screen components**

Set `repos/orbit-app/app/(tabs)/ai.tsx` to:

```tsx
import { AiScreen } from "../../src/screens/ai/AiScreen";

export default AiScreen;
```

Create `repos/orbit-app/app/(tabs)/events.tsx` with:

```tsx
import { EventsScreen } from "../../src/screens/events/EventsScreen";

export default EventsScreen;
```

Create `repos/orbit-app/app/(tabs)/contacts.tsx` with:

```tsx
import { ContactsScreen } from "../../src/screens/contacts/ContactsScreen";

export default ContactsScreen;
```

Create `repos/orbit-app/app/(tabs)/schedule.tsx` with:

```tsx
import { ScheduleScreen } from "../../src/screens/schedule/ScheduleScreen";

export default ScheduleScreen;
```

Create `repos/orbit-app/app/(tabs)/profile.tsx` with:

```tsx
import { ProfileScreen } from "../../src/screens/profile/ProfileScreen";

export default ProfileScreen;
```

- [ ] **Step 2: Add detail shell routes**

Create `repos/orbit-app/app/events/[id].tsx` with:

```tsx
import { EventDetailScreen } from "../../src/screens/events/EventDetailScreen";

export default EventDetailScreen;
```

Create `repos/orbit-app/app/contacts/[id].tsx` with:

```tsx
import { ContactDetailScreen } from "../../src/screens/contacts/ContactDetailScreen";

export default ContactDetailScreen;
```

Create `repos/orbit-app/app/settings/api.tsx` with:

```tsx
import { ApiSettingsScreen } from "../../src/screens/settings/ApiSettingsScreen";

export default ApiSettingsScreen;
```

- [ ] **Step 3: Add detail screen shells**

Create `repos/orbit-app/src/screens/events/EventDetailScreen.tsx` with:

```tsx
import { useLocalSearchParams } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";

export function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <AppScreen eyebrow="Event detail" title="Event">
      <DataCard detail="Detailed event preparation will connect in the Events goal." title={id ?? "event"} />
    </AppScreen>
  );
}
```

Create `repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx` with:

```tsx
import { useLocalSearchParams } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";

export function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <AppScreen eyebrow="Contact detail" title="Contact">
      <DataCard detail="Detailed relationship context will connect in the Contacts goal." title={id ?? "contact"} />
    </AppScreen>
  );
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
cd repos/orbit-app
npm run typecheck
```

Expected: command exits 0.

- [ ] **Step 5: Commit router wiring**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app/app repos/orbit-app/src/screens/events/EventDetailScreen.tsx repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx
git commit -m "feat(mobile): wire Orbit app routes"
```

### Task 7: README And First-Stage Verification

**Files:**
- Modify: `repos/orbit-app/README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: runbook and final first-stage verification evidence.

- [ ] **Step 1: Write README**

Create or replace `repos/orbit-app/README.md` with:

```markdown
# Orbit App

Orbit App is the iOS-first mobile client for Orbit. It is an independent Expo
app that talks to the existing `repos/orbits` HTTP API.

## Run Locally

Start the web/API server:

```bash
cd ../orbits
ORBIT_MODULE_MODE=live npm run dev
```

Start the iOS app:

```bash
cd ../orbit-app
EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npm run ios
```

For a physical iPhone, use the Mac LAN address instead of `localhost`.

## Scripts

- `npm run ios`: start Expo and open iOS simulator.
- `npm run start`: start Expo without choosing a target.
- `npm run typecheck`: run TypeScript.
- `npm test`: run Node tests through `tsx`.

## Boundaries

- The app consumes `/api/**` routes from `repos/orbits`.
- The app does not import Next.js pages or feature services.
- The app does not read Postgres, Supabase, `orbit_records`, or web localStorage.
- Orbit AI remains the single assistant inbox, including proactive turns.
```

- [ ] **Step 2: Run final first-stage verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
npx expo config --type public
```

Expected:

- `npm test` exits 0.
- `npm run typecheck` exits 0.
- `npx expo config --type public` prints an Expo config containing `name: Orbit`, `slug: orbit-app`, and iOS bundle identifier `app.agenthubs.orbit`.

- [ ] **Step 3: Run GitNexus change detection before commit**

Run from `/Users/xzhao/Projects/orbit` through the GitNexus tool:

```text
detect_changes(repo: "orbit", scope: "staged")
```

Expected: any affected flows are limited to new mobile project files and root documentation.

- [ ] **Step 4: Commit README and final checks**

Run from `/Users/xzhao/Projects/orbit`:

```bash
git add repos/orbit-app/README.md
git commit -m "docs(mobile): document Orbit iOS app setup"
```

## Self-Review Checklist

- Spec coverage: Tasks 1-7 cover the approved first-stage scope: Expo project, iOS settings, API client, route states, tabs, first screens, tests, and run documentation.
- Deferred work: camera scanning, push notifications, offline sync, auth hardening, TestFlight, and full web parity are intentionally excluded because the spec assigns them to later goals.
- Type consistency: `ApiResult<TData>`, `RouteState<TData>`, `createOrbitApiClient`, `useApiResource`, and mapper names are defined before use.
- Boundary check: no task edits `repos/orbits`; all mobile business data comes from `/api/**`.
- Incomplete-section scan: the plan contains no unresolved marker words and no incomplete task descriptions.
