import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitPostEventCenter } from "../../app/(app)/app/events/[id]/orbit-post-event-center";

const EVENT = "event:tokyo-ai-night";
const candidate = {
  contactId: "contact:ren",
  createdAt: null,
  dueAt: null,
  encounterId: "encounter:aiko-ren",
  evidenceIds: ["evidence:human-encounter:encounter:aiko-ren"],
  noteExcerpt: "讨论了日本门店押金回收与清洗损耗。",
  reminderId: "reminder:event-followup:one",
  reminderStatus: "missing",
  sourceIndex: 0,
  sourceKind: "next_step",
  sourceText: "周五复核试点单位经济",
  state: "available",
  taskHref: "/app/followups",
  taskId: "task:event-followup:one",
  taskStatus: "missing",
} as const;

test("post-event center requires a second confirmation and then renders persisted task/reminder state", async () => {
  const originalFetch = globalThis.fetch;
  let posted: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url, init) => {
    const href = String(url);
    if (href === `/api/encounters?eventId=${encodeURIComponent(EVENT)}`) return Response.json({ data: [{ encounterId: candidate.encounterId }], success: true });
    if (href === "/api/appointments") return Response.json({ data: [], success: true });
    if (href.endsWith("/post-event/artifact")) return Response.json({ data: { artifact: null, status: "unconfigured" }, success: true });
    if (href.endsWith("/post-event/followups") && init?.method === "POST") {
      posted = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ data: { ...candidate, createdAt: "2026-08-05T08:00:00.000Z", dueAt: "2026-08-08T08:00:00.000Z", reminderStatus: "pending", state: "created", taskStatus: "open" }, success: true }, { status: 201 });
    }
    if (href.endsWith("/post-event/followups")) return Response.json({ data: [candidate], success: true });
    throw new Error(`Unexpected URL ${href}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(<OrbitPostEventCenter acceptedContacts={1} eventId={EVENT} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-followup-confirmation"] !== undefined).length, 0);
    const review = renderer.root.find((node) => node.props["data-followup-review"] !== undefined);
    await act(async () => { review.props.onClick(); });
    const confirmation = renderer.root.findAll((node) => node.props["data-followup-confirmation"] !== undefined);
    assert.equal(confirmation.length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /不会给对方发消息/u);
    const dueField = renderer.root.find((node) => node.props["data-followup-due-at"] !== undefined);
    assert.equal(dueField.props.className, "field");
    assert.equal(dueField.props.name, "followupDueAt");
    const evidenceCard = renderer.root.find((node) => typeof node.props["data-followup-evidence"] === "string");
    assert.equal(String(evidenceCard.props["data-followup-evidence"]).includes("\u0000"), false);
    const confirm = renderer.root.find((node) => node.props["data-followup-confirm"] !== undefined);
    await act(async () => { await (confirm.props.onClick() as Promise<void>); });
    assert.deepEqual(posted, {
      dueAt: null,
      encounterId: candidate.encounterId,
      sourceIndex: 0,
      sourceKind: "next_step",
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-followup-created"] !== undefined).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /任务进行中 · 站内提醒待触发/u);
    assert.equal(renderer.root.findAll((node) => node.type === "a" && node.props.href === "/app/followups").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});
