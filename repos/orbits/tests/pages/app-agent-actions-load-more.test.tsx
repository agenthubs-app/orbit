/**
 * Sprint 0122 (Codex 103-A): the web 建议与行动 ledger follows the server's
 * cursor with 「加载更多」 until there is no next page. The page's route view
 * model and the client component are real; the ledger service and
 * GET /api/agent/ledger are stubbed to page 501 entries 200 at a time, the way
 * the real endpoint does (covered against Postgres in
 * agent-ledger-paging-postgres.test.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitActions } from "../../app/(app)/app/agent/iorbit-0918/iorbit-actions";
import { loadAgentActionsRouteViewModel } from "../../app/(app)/app/agent/actions/actions-route-view-model";
import type { AgentLedgerService } from "../../features/agent/ledger/service";

const statuses = ["awaiting_confirmation", "approved", "deferred"] as const;
function entry(i: number) {
  const at = new Date(Date.UTC(2026, 8, 1) + (600 - i) * 60_000).toISOString();
  return {
    autonomousExecutionStarted: false, createdAt: at, evidenceChips: [], evidenceIds: [], externalSideEffectExecuted: false,
    messageAutoSendExecuted: false, operations: [], preview: "", provenance: { collectedAt: at, evidenceIds: [], source: "test", sourceLabel: "test" },
    sourceRefs: [], status: statuses[i % 3], title: `操作 ${i}`, undoable: false, updatedAt: at, whyNow: "测试",
    entryId: `action:${String(i).padStart(4, "0")}`,
  };
}
const all = Array.from({ length: 501 }, (_, i) => entry(i));
function page(cursor: string | null) {
  const start = cursor ? Number(cursor.slice(1)) : 0;
  const entries = all.slice(start, start + 200);
  const nextCursor = start + 200 < all.length ? `c${start + 200}` : null;
  return { entries, nextCursor, nextAction: "", provenance: { collectedAt: "", evidenceIds: [], source: "test", sourceLabel: "test" }, state: "success", summary: "" };
}
const ledgerService = { async listEntries() { return { success: true, data: page(null) }; } } as unknown as AgentLedgerService;

function withWindow(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true, writable: true,
    value: {
      addEventListener: () => undefined, dispatchEvent: () => true, removeEventListener: () => undefined,
      location: { href: "https://orbit.test/app/agent/actions", pathname: "/app/agent/actions", search: "" },
      setTimeout: (handler: () => void, ms?: number) => setTimeout(handler, ms), clearTimeout: (id: unknown) => clearTimeout(id as never),
    },
  });
  return () => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); };
}
const notFound = () => Response.json({ success: false, error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });

function rendered(renderer: ReactTestRenderer) {
  const ids = renderer.root.findAll(node => typeof node.props["data-orbit-agent-action-entry"] === "string" && typeof node.type === "string")
    .map(node => node.props["data-orbit-agent-action-entry"] as string);
  const text = renderer.root.findAll(node => typeof node.type === "string" && node.type !== "style")
    .flatMap(node => node.children.filter((child): child is string => typeof child === "string")).join(" ");
  return { ids, text };
}
function loadMoreButton(renderer: ReactTestRenderer) {
  return renderer.root.findAll(node => node.type === "button" && node.children.some(child => child === "加载更多"));
}

test("web actions load every page of a 501-entry ledger without duplicates or gaps and never call a page the whole ledger", async (t) => {
  const requests: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://orbit.test");
    if (url.pathname !== "/api/agent/ledger") return notFound();
    requests.push(url.pathname + url.search);
    return Response.json({ success: true, data: page(url.searchParams.get("cursor")) });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const restoreWindow = withWindow();

  const viewModel = await loadAgentActionsRouteViewModel(undefined, { ledgerService });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<IOrbitActions viewModel={viewModel} />); });
  t.after(() => { act(() => renderer.unmount()); restoreWindow(); });
  assert.equal(rendered(renderer).ids.length, 200);
  assert.match(rendered(renderer).text, /已显示 200 条记录，还有更早的记录/);

  for (const expected of [400, 501]) {
    const [button] = loadMoreButton(renderer);
    assert.ok(button, `load more is offered before ${expected}`);
    await act(async () => { button!.props.onClick(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(rendered(renderer).ids.length, expected);
  }
  const { ids, text } = rendered(renderer);
  assert.equal(new Set(ids).size, 501, "no duplicates");
  for (const item of all) assert.ok(ids.includes(item.entryId), `missing ${item.entryId}`);
  assert.equal(loadMoreButton(renderer).length, 0, "no load-more after the last page");
  assert.match(text, /已加载全部 501 条记录/);
  assert.doesNotMatch(text, /最后一页|本页 101 条/);
  assert.deepEqual(requests, ["/api/agent/ledger?cursor=c200", "/api/agent/ledger?cursor=c400"]);
});

test("a failed next page keeps the loaded entries and says so", async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => new URL(String(input), "https://orbit.test").pathname === "/api/agent/ledger"
    ? Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "x" } }, { status: 503 })
    : notFound()) as typeof fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const restoreWindow = withWindow();
  const viewModel = await loadAgentActionsRouteViewModel(undefined, { ledgerService });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<IOrbitActions viewModel={viewModel} />); });
  t.after(() => { act(() => renderer.unmount()); restoreWindow(); });
  await act(async () => { loadMoreButton(renderer)[0]!.props.onClick(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.equal(rendered(renderer).ids.length, 200);
  assert.match(rendered(renderer).text, /更早的记录暂时读不出来/);
  assert.equal(loadMoreButton(renderer).length, 1, "retry stays available");
});
