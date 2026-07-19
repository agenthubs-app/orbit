# iOS App 目标 6：服务器健康检查计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-6-server-health-check.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-goal-6-server-health-check.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

让 Server 设置页可以验证配置的 Orbit API 地址是否可达：新增 health 视图模型把 /api/health 载荷转成用户可读文案（隐藏 mode/mock/hybrid 等运行时实现字段），用户点按检查按钮时经现有 OrbitApiClient 发起请求。

## 审计依据

一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/health.ts、health-view-model.test.ts 与 ApiSettingsScreen.tsx 均已落地。当前行为以 orbit-app 代码为准，文档价值在于记录"用户文案不得暴露运行时实现标签"这一约束。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 目标 6: Server Health Check 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Health View Model
- 第 4 节：任务 2: Settings Check Button
- 第 5 节：任务 3: 验证 和 Commit
- 第 6 节：源标题：Self Review
- 第 7 节：执行 Choice

## 保留的代码与命令证据

### 代码证据 1

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

### 代码证据 2

```bash
cd repos/orbit-app
npm test -- tests/health-view-model.test.ts
```

### 代码证据 3

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

### 代码证据 4

```bash
cd repos/orbit-app
npm test -- tests/health-view-model.test.ts
```

### 代码证据 5

```text
gitnexus_impact target=ApiSettingsScreen direction=upstream file_path=repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx
```

### 代码证据 6

```ts
const [checkingHealth, setCheckingHealth] = useState(false);
const [healthMessage, setHealthMessage] = useState<string | null>(null);
```

### 代码证据 7

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

### 代码证据 8

```tsx
<Pressable accessibilityRole="button" disabled={checkingHealth} onPress={checkServerHealth}>
  <Text>{checkingHealth ? "Checking" : "Check"}</Text>
</Pressable>
```

### 代码证据 9

```tsx
{healthMessage ? <Text style={styles.message}>{healthMessage}</Text> : null}
```

### 代码证据 10

```markdown
The Server screen can check `/api/health` before saving a local, LAN, or remote API address.
```

### 代码证据 11

```bash
cd repos/orbit-app
npm test
npm run typecheck
npx expo config --type public
```

### 代码证据 12

```text
/tmp/orbit-app-server-health-check.png
```

### 代码证据 13

```bash
git add docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-6-server-health-check.md repos/orbit-app/README.md repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx repos/orbit-app/src/view-models/health.ts repos/orbit-app/tests/health-view-model.test.ts
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): add server health check"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
