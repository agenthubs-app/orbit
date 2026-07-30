import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const boundarySource = readFileSync(
  join(repoRoot, "src", "components", "AppErrorBoundary.tsx"),
  "utf8"
);
const rootLayoutSource = readFileSync(
  join(repoRoot, "app", "_layout.tsx"),
  "utf8"
);
const appLayoutSource = readFileSync(
  join(repoRoot, "app", "(app)", "_layout.tsx"),
  "utf8"
);

test("渲染异常被边界收住，而不是白屏", () => {
  assert.match(boundarySource, /static getDerivedStateFromError/u);
  assert.match(boundarySource, /componentDidCatch/u);
  assert.match(boundarySource, /if \(!error\) \{\s*return this\.props\.children;/u);
});

test("错误屏给用户一条走得出去的路", () => {
  assert.match(boundarySource, />这个页面出了点问题</u);
  assert.match(boundarySource, />重试</u);
  assert.match(boundarySource, /accessibilityRole="button"/u);
  assert.match(boundarySource, /onPress=\{onRetry\}/u);
});

test("错误屏用中文说明，技术信息放次要位置", () => {
  assert.match(boundarySource, /你的数据没有受影响/u);
  assert.match(boundarySource, />错误信息</u);
  assert.doesNotMatch(boundarySource, />Something went wrong</u);
});

test("路由内的异常走 expo-router 的分段边界，保住导航器", () => {
  [rootLayoutSource, appLayoutSource].forEach((source) => {
    assert.match(source, /export function ErrorBoundary\(\{\s*error,\s*retry/u);
    assert.match(source, /<AppErrorScreen error=\{error\} onRetry=\{\(\) => void retry\(\)\} \/>/u);
  });
});

test("类组件边界只留给 router 之外的层，并且包住整棵树", () => {
  assert.match(rootLayoutSource, /<AppErrorBoundary>/u);

  const boundaryIndex = rootLayoutSource.indexOf("<AppErrorBoundary>");
  const providerIndex = rootLayoutSource.indexOf("<OrbitApiBaseUrlProvider>");
  const navigatorIndex = rootLayoutSource.indexOf("<OrbitRouteAccessBoundary");

  assert.notEqual(boundaryIndex, -1);
  assert.ok(boundaryIndex < providerIndex);
  assert.ok(providerIndex < navigatorIndex);

  // 重置整棵树没法在卸载状态下导航，所以这条路不再承担「切走」的职责。
  assert.doesNotMatch(rootLayoutSource, /router\.replace/u);
});
