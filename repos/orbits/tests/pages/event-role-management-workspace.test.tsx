import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventCenterWorkspace } from "../../app/(app)/app/events/center/event-center-workspace";
import { EventRoleManagementWorkspace } from "../../app/(app)/app/events/[id]/operations/roles/event-role-management-workspace";

const EVENT_ID = "event:role-management";
const OWNER_ID = "actor:event-owner";
const OPERATOR_ID = "actor:operator";
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function assignment(input: {
  revision: number;
  role: "check_in" | "operations" | "reviewer" | "read_only_analyst" | null;
  state: "active" | "revoked" | null;
  subjectActorId: string;
}) {
  return {
    eventId: EVENT_ID,
    owner: false,
    revision: input.revision,
    role: input.role,
    state: input.state,
    subjectActorId: input.subjectActorId,
  };
}

function rolePayload(
  members: readonly {
    revision: number;
    role: "check_in" | "operations" | "reviewer" | "read_only_analyst";
    subjectActorId: string;
  }[] = [],
) {
  return {
    event: {
      endsAt: "2026-09-12T11:00:00.000Z",
      eventId: EVENT_ID,
      lifecycleState: "published",
      migrationPending: false,
      owner: true,
      revision: 0,
      role: "owner",
      startsAt: "2026-09-12T09:00:00.000Z",
      title: "运营权限演练",
      venue: "Tokyo",
    },
    members: [
      {
        assignedAt: null,
        assignedByActorId: null,
        eventId: EVENT_ID,
        reason: "Derived from the Event Core organizer.",
        revision: 0,
        role: "owner",
        state: "active",
        subjectActorId: OWNER_ID,
      },
      ...members.map((member) => ({
        assignedAt: "2026-09-01T08:00:00.000Z",
        assignedByActorId: OWNER_ID,
        eventId: EVENT_ID,
        reason: "现场运营职责",
        revision: member.revision,
        role: member.role,
        state: "active" as const,
        subjectActorId: member.subjectActorId,
      })),
    ],
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("regrant reads a revoked subject's durable head revision before it writes", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/access`;
  const observed: { body?: unknown; method?: string; url: string }[] = [];
  let regranted = false;
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url, init) => {
    const request = { body: init?.body, method: init?.method, url: String(url) };
    observed.push(request);
    if (request.url === `${baseUrl}/roles`) {
      return Response.json({
        data: regranted
          ? rolePayload([{ revision: 8, role: "operations", subjectActorId: "actor:revoked" }])
          : rolePayload(),
        success: true,
      });
    }
    if (request.url === `${baseUrl}/assignments/${encodeURIComponent("actor:revoked")}` && !request.method) {
      return Response.json({
        data: assignment({
          revision: 7,
          role: "check_in",
          state: "revoked",
          subjectActorId: "actor:revoked",
        }),
        success: true,
      });
    }
    if (request.url === `${baseUrl}/assignments/${encodeURIComponent("actor:revoked")}` && request.method === "PUT") {
      regranted = true;
      return Response.json({
        data: assignment({
          revision: 8,
          role: "operations",
          state: "active",
          subjectActorId: "actor:revoked",
        }),
        success: true,
      });
    }
    throw new Error(`Unexpected request ${request.method ?? "GET"} ${request.url}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventRoleManagementWorkspace eventId={EVENT_ID} />);
      await flush();
    });
    const subject = renderer.root.find(
      (node) => node.props["data-event-role-subject"] === "new",
    );
    const reason = renderer.root.find(
      (node) => node.props["data-event-role-reason"] === "new",
    );
    await act(async () => {
      subject.props.onChange({ target: { value: "actor:revoked" } });
      reason.props.onChange({ target: { value: "签到班次恢复" } });
      await flush();
    });
    const grant = renderer.root.find(
      (node) => node.props["data-event-role-action"] === "grant",
    );
    await act(async () => {
      grant.props.onClick();
      await flush();
    });

    assert.deepEqual(
      observed.map(({ method, url }) => ({ method: method ?? "GET", url })),
      [
        { method: "GET", url: `${baseUrl}/roles` },
        { method: "GET", url: `${baseUrl}/assignments/${encodeURIComponent("actor:revoked")}` },
        { method: "PUT", url: `${baseUrl}/assignments/${encodeURIComponent("actor:revoked")}` },
        { method: "GET", url: `${baseUrl}/roles` },
      ],
    );
    const write = observed.find((request) => request.method === "PUT");
    assert.equal(
      write?.body,
      JSON.stringify({
        expectedRevision: 7,
        reason: "签到班次恢复",
        role: "operations",
      }),
    );
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-event-role-member"] === "actor:revoked",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("role change and revoke each read the current revision and refresh the active role roster", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/access`;
  let active = true;
  let currentRole: "operations" | "reviewer" = "operations";
  let revision = 4;
  const writes: { body?: unknown; method?: string }[] = [];
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url, init) => {
    const target = String(url);
    if (target === `${baseUrl}/roles`) {
      return Response.json({
        data: rolePayload(active ? [{ revision, role: currentRole, subjectActorId: OPERATOR_ID }] : []),
        success: true,
      });
    }
    if (target === `${baseUrl}/assignments/${encodeURIComponent(OPERATOR_ID)}` && !init?.method) {
      return Response.json({
        data: assignment({
          revision,
          role: active ? currentRole : null,
          state: active ? "active" : null,
          subjectActorId: OPERATOR_ID,
        }),
        success: true,
      });
    }
    if (target === `${baseUrl}/assignments/${encodeURIComponent(OPERATOR_ID)}` && init?.method === "PUT") {
      writes.push({ body: init.body, method: init.method });
      currentRole = "reviewer";
      revision = 5;
      return Response.json({
        data: assignment({ revision, role: currentRole, state: "active", subjectActorId: OPERATOR_ID }),
        success: true,
      });
    }
    if (target === `${baseUrl}/assignments/${encodeURIComponent(OPERATOR_ID)}` && init?.method === "DELETE") {
      writes.push({ body: init.body, method: init.method });
      active = false;
      revision = 6;
      return Response.json({
        data: assignment({ revision, role: currentRole, state: "revoked", subjectActorId: OPERATOR_ID }),
        success: true,
      });
    }
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${target}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventRoleManagementWorkspace eventId={EVENT_ID} />);
      await flush();
    });
    const select = renderer.root.find(
      (node) => node.props["data-event-role-select"] === OPERATOR_ID,
    );
    const reason = renderer.root.find(
      (node) => node.props["data-event-role-reason"] === OPERATOR_ID,
    );
    await act(async () => {
      select.props.onChange({ target: { value: "reviewer" } });
      reason.props.onChange({ target: { value: "改为报名审核" } });
      await flush();
    });
    const change = renderer.root.find(
      (node) => node.props["data-event-role-action"] === `change:${OPERATOR_ID}`,
    );
    await act(async () => {
      change.props.onClick();
      await flush();
    });
    assert.deepEqual(writes[0], {
      body: JSON.stringify({ expectedRevision: 4, reason: "改为报名审核", role: "reviewer" }),
      method: "PUT",
    });

    const revokeReason = renderer.root.find(
      (node) => node.props["data-event-role-reason"] === OPERATOR_ID,
    );
    await act(async () => {
      revokeReason.props.onChange({ target: { value: "审核班次结束" } });
      await flush();
    });
    const revoke = renderer.root.find(
      (node) => node.props["data-event-role-action"] === `revoke:${OPERATOR_ID}`,
    );
    await act(async () => {
      revoke.props.onClick();
      await flush();
    });
    assert.deepEqual(writes[1], {
      body: JSON.stringify({ expectedRevision: 5, reason: "审核班次结束" }),
      method: "DELETE",
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-event-role-member"] === OPERATOR_ID,
      ).length,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("migration-pending cards do not render legacy metadata or operation links", async () => {
  const originalFetch = globalThis.fetch;
  let renderer!: ReactTestRenderer;
  globalThis.fetch = (async (url) => {
    assert.equal(url, "/api/events/center");
    return Response.json({
      data: [{
        endsAt: null,
        eventId: "event:legacy-only",
        lifecycleState: "legacy_active",
        migrationPending: true,
        owner: true,
        revision: 0,
        role: "owner",
        startsAt: null,
        title: null,
        venue: null,
      }],
      success: true,
    });
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventCenterWorkspace />);
      await flush();
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-event-center-migration-pending"] === "event:legacy-only",
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "a" &&
          typeof node.props.href === "string" &&
          node.props.href.includes(encodeURIComponent("event:legacy-only")),
      ).length,
      0,
    );
    const headings = renderer.root.findAllByType("h2").map((node) => node.children.join(""));
    assert.ok(headings.includes("活动资料待迁移"));
    assert.ok(!headings.includes("event:legacy-only"));
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("role manager uses auto-fit grids and the center reserves only policy-valid role entry points", () => {
  const manager = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/operations/roles/event-role-management-workspace.tsx"),
    "utf8",
  );
  const center = readFileSync(
    join(projectRoot, "app/(app)/app/events/center/event-center-workspace.tsx"),
    "utf8",
  );
  assert.match(manager, /repeat\(auto-fit,minmax\(220px,1fr\)\)/u);
  assert.match(manager, /repeat\(auto-fit,minmax\(180px,1fr\)\)/u);
  assert.doesNotMatch(manager, /gridTemplateColumns: "minmax\(220px,1\.15fr\)/u);
  assert.match(center, /data-event-center-analytics/u);
  assert.match(center, /function canOpenAnalytics/u);
  assert.match(center, /item\.role === "operations"/u);
  assert.match(center, /item\.role === "read_only_analyst"/u);
  assert.match(center, /data-event-center-admission/u);
  assert.doesNotMatch(center, /审核入口待实现/u);
  assert.doesNotMatch(center, /event\.role === "reviewer"[^\n]+analyticsHref/u);
});
