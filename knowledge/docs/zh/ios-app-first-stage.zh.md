# Orbit iOS App 第一阶段实施计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-first-stage.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-first-stage.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

在 repos/orbit-app 从零搭建 iOS-first 的独立 Expo 客户端：Expo Router 路由骨架、带类型的 API envelope 客户端（含非 JSON/网络失败的受控错误码）、RouteState 视图模型映射、移动端设计 token 与基础组件，以及 AI/Events/Contacts/Schedule/Profile 五个数据驱动 Tab。全程只走 repos/orbits 的 HTTP API，禁止直读数据库或引用 web 源码。

## 审计依据

这是一次性的分任务实施计划（含完整文件内容与逐条命令），属于已执行的历史材料——repos/orbit-app 中对应的 src/api、src/view-models、src/screens、tests 均已落地并继续被后续 Goal 2-8 演进。当前结构与行为应以 repos/orbit-app 实际代码及其 AGENTS.md/README.md 为准；计划中的绝对路径也已过时。

## 结构化阅读入口

- 第 1 节：Orbit iOS App First Stage 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：源标题：File Structure
- 第 4 节：任务 1: Scaffold The Expo iOS Project
- 第 5 节：任务 2: API Envelope Client
- 第 6 节：任务 3: 路由 状态 和 View Model Mappers
- 第 7 节：任务 4: Mobile 设计 Tokens 和 路由 状态 Components
- 第 8 节：任务 5: API Resource Hook 和 Screen 数据 Loading
- 第 9 节：任务 6: Wire Expo Router Tabs Screens
- 第 10 节：任务 7: 说明 和 First Stage 验证
- 第 11 节：源标题：Self Review Checklist

## 保留的代码与命令证据

### 代码证据 1

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

### 代码证据 2

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

### 代码证据 3

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

### 代码证据 4

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

### 代码证据 5

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

### 代码证据 6

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

### 代码证据 7

```ts
/// <reference types="expo/types" />
```

### 代码证据 8

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

### 代码证据 9

```tsx
import { Redirect } from "expo-router";

export default function IndexRoute() {
  return <Redirect href="/ai" />;
}
```

### 代码证据 10

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

### 代码证据 11

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

### 代码证据 12

```bash
cd repos/orbit-app
npm install
npm run typecheck
```

### 代码证据 13

```bash
git add repos/orbit-app
git commit -m "feat(mobile): scaffold Orbit iOS app"
```

### 代码证据 14

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

### 代码证据 15

```bash
cd repos/orbit-app
npm test
```

### 代码证据 16

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

### 代码证据 17

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

### 代码证据 18

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

### 代码证据 19

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

### 代码证据 20

```bash
git add repos/orbit-app/src/api repos/orbit-app/tests/api-client.test.ts
git commit -m "feat(mobile): add Orbit API envelope client"
```

### 代码证据 21

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

### 代码证据 22

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

### 代码证据 23

```bash
cd repos/orbit-app
npm test
```

### 代码证据 24

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

### 代码证据 25

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

### 代码证据 26

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

### 代码证据 27

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

### 代码证据 28

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

### 代码证据 29

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

### 代码证据 30

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

### 代码证据 31

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

### 代码证据 32

```bash
git add repos/orbit-app/src/view-models repos/orbit-app/tests/bootstrap-view-model.test.ts repos/orbit-app/tests/screen-state.test.ts
git commit -m "feat(mobile): add route state mappers"
```

### 代码证据 33

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

### 代码证据 34

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

### 代码证据 35

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

### 代码证据 36

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

### 代码证据 37

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

### 代码证据 38

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

### 代码证据 39

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

### 代码证据 40

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

### 代码证据 41

```bash
cd repos/orbit-app
npm run typecheck
```

### 代码证据 42

```bash
git add repos/orbit-app/src/components repos/orbit-app/src/design
git commit -m "feat(mobile): add Orbit mobile primitives"
```

### 代码证据 43

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

### 代码证据 44

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

### 代码证据 45

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

### 代码证据 46

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

### 代码证据 47

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

### 代码证据 48

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

### 代码证据 49

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

### 代码证据 50

```bash
cd repos/orbit-app
npm run typecheck
```

### 代码证据 51

```bash
git add repos/orbit-app/src/hooks repos/orbit-app/src/screens
git commit -m "feat(mobile): add data-backed mobile screens"
```

### 代码证据 52

```tsx
import { AiScreen } from "../../src/screens/ai/AiScreen";

export default AiScreen;
```

### 代码证据 53

```tsx
import { EventsScreen } from "../../src/screens/events/EventsScreen";

export default EventsScreen;
```

### 代码证据 54

```tsx
import { ContactsScreen } from "../../src/screens/contacts/ContactsScreen";

export default ContactsScreen;
```

### 代码证据 55

```tsx
import { ScheduleScreen } from "../../src/screens/schedule/ScheduleScreen";

export default ScheduleScreen;
```

### 代码证据 56

```tsx
import { ProfileScreen } from "../../src/screens/profile/ProfileScreen";

export default ProfileScreen;
```

### 代码证据 57

```tsx
import { EventDetailScreen } from "../../src/screens/events/EventDetailScreen";

export default EventDetailScreen;
```

### 代码证据 58

```tsx
import { ContactDetailScreen } from "../../src/screens/contacts/ContactDetailScreen";

export default ContactDetailScreen;
```

### 代码证据 59

```tsx
import { ApiSettingsScreen } from "../../src/screens/settings/ApiSettingsScreen";

export default ApiSettingsScreen;
```

### 代码证据 60

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

### 代码证据 61

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

### 代码证据 62

```bash
cd repos/orbit-app
npm run typecheck
```

### 代码证据 63

```bash
git add repos/orbit-app/app repos/orbit-app/src/screens/events/EventDetailScreen.tsx repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx
git commit -m "feat(mobile): wire Orbit app routes"
```

### 代码证据 64

```markdown
# Orbit App

Orbit App is the iOS-first mobile client for Orbit. It is an independent Expo
app that talks to the existing `repos/orbits` HTTP API.

## Run Locally

Start the web/API server:

```

### 代码证据 65

```

Start the iOS app:

```

### 代码证据 66

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

### 代码证据 67

```bash
cd repos/orbit-app
npm test
npm run typecheck
npx expo config --type public
```

### 代码证据 68

```text
detect_changes(repo: "orbit", scope: "staged")
```

### 代码证据 69

```bash
git add repos/orbit-app/README.md
git commit -m "docs(mobile): document Orbit iOS app setup"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
