import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";

/**
 * Sprint 0088: one unfinished read must not blank the dashboard.
 *
 * The six reads fire together and normally land within 20ms of each other, so
 * this is not about speed — it is about what the page shows when one of them
 * does not come back. The first paint used to wait on `aggregate` alone, so a
 * single stuck read left five healthy sections invisible.
 */
const kinds: Record<string, string> = {};
let overdue = false;

const payload = (path: string) => {
  if (path.includes("/network-gaps")) return { gaps: [{ id: "g1", label: "制造业", detail: "缺少覆盖", severity: "high" }], summary: "覆盖缺口" };
  if (path.includes("/opportunities")) return { highPriorityOpportunities: [{ id: "o1", title: "跟进佐藤", detail: "两周未联系", score: 90 }], dormantHighValueContacts: [] };
  if (path.includes("/distributions")) return { industryDistribution: [{ label: "制造业", count: 12 }] };
  if (path.includes("/summary")) return { summary: "关系概览", totalContacts: 78 };
  if (path.includes("/audit/provenance")) return { issues: [], checkedRecords: 336 };
  return { metrics: { totalContacts: 78, openTasks: 80 }, summary: "关系概览" };
};

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = (name, ...args) => {
  if (name === "expo-router") return { useLocalSearchParams: () => ({}), usePathname: () => "/dashboard", useRouter: () => ({ back() {}, canGoBack: () => false, push() {}, replace() {} }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useLoadingDeadline")) return { LOADING_DEADLINE_MS: 8_000, useLoadingDeadline: () => overdue };
  if (name.endsWith("/hooks/useApiResource")) return {
    useApiResource: (path: string) => {
      const key = path.includes("/summary") ? "summary"
        : path.includes("/opportunities") ? "opportunities"
        : path.includes("/network-gaps") ? "gaps"
        : path.includes("/distributions") ? "distributions"
        : path.includes("/audit/provenance") ? "audit"
        : "aggregate";
      return { kind: kinds[key] ?? "success", data: payload(path), error: { message: "连接暂不可用" }, refreshing: false, refresh() {} };
    },
  };
  return originalLoad(name, ...args);
};
const { DashboardScreen } = require("../src/screens/dashboard/DashboardScreen");
loader._load = originalLoad;

test.beforeEach(() => { for (const key of Object.keys(kinds)) delete kinds[key]; overdue = false; });

test("a stuck coverage read no longer hides the sections that did arrive", () => {
  kinds.aggregate = "loading";
  const html = renderToHtml(<DashboardScreen />);
  assert.match(html, /制造业/u, "the gap and distribution sections landed and must render");
  assert.match(html, /正在读取关系覆盖/u, "the coverage card says what it is waiting for");
});

test("an unread coverage is never drawn as 0%", () => {
  kinds.aggregate = "loading";
  const html = renderToHtml(<DashboardScreen />);
  assert.doesNotMatch(html, />0<\/div>[\s\S]{0,80}%/u, "not having read the coverage is not the same as having none");
});

test("a coverage read past its ceiling says so and can be retried", () => {
  kinds.aggregate = "loading";
  overdue = true;
  const html = renderToHtml(<DashboardScreen />);
  assert.match(html, /读取关系覆盖超时/u);
  assert.match(html, /重试/u);
  assert.doesNotMatch(html, /正在读取关系覆盖/u);
});

test("the whole-screen spinner is only for having nothing at all yet", () => {
  for (const key of ["aggregate", "summary", "opportunities", "gaps", "distributions", "audit"]) kinds[key] = "loading";
  const html = renderToHtml(<DashboardScreen />);
  assert.doesNotMatch(html, /制造业/u);
  assert.doesNotMatch(html, /正在读取关系覆盖/u, "with nothing landed the page shows one loading state, not a per-card one");
});

test("everything landing still renders the coverage dial", () => {
  const html = renderToHtml(<DashboardScreen />);
  assert.match(html, /%/u);
  assert.doesNotMatch(html, /正在读取关系覆盖|读取关系覆盖超时|关系覆盖暂时不可用/u);
});
