import assert from "node:assert/strict";
import test from "node:test";
import { act, create } from "react-test-renderer";

import {
  AgentChatHistoryOrganization,
  createAgentChatGroup,
  deleteAgentChatGroup,
  parseAgentChatGroups,
  patchAgentChatSessionOrganization,
  renameAgentChatGroup,
} from "../../app/(app)/app/agent/agent-chat-history-organization";

const group = {
  createdAt: "2026-09-15T00:00:00.000Z",
  id: "group:work",
  name: "Work",
  revision: 1,
  updatedAt: "2026-09-15T00:00:00.000Z",
};

test("Web organization client uses narrow revisioned routes", async (t) => {
  const calls: Array<{ body: unknown; method: string; path: string }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ body, method: init?.method ?? "GET", path });
    if (init?.method === "DELETE") return Response.json({ success: true, data: { deleted: true, id: group.id, ungroupedCount: 61 } });
    if (path.includes("/sessions/")) return Response.json({ success: true, data: { session: { organization: { customTitle: "Launch", groupId: group.id, pinned: true, revision: 2 } } } });
    return Response.json({ success: true, data: { group } });
  });

  assert.equal((await createAgentChatGroup({ id: group.id, mutationId: "mutation:create", name: group.name }))?.id, group.id);
  assert.equal((await patchAgentChatSessionOrganization("session:one", { expectedRevision: 1, mutationId: "mutation:session", patch: { groupId: group.id, pinned: true } }))?.revision, 2);
  assert.equal((await renameAgentChatGroup(group.id, { expectedRevision: 1, mutationId: "mutation:rename", name: "Work renamed" }))?.id, group.id);
  assert.equal(await deleteAgentChatGroup(group.id, { expectedRevision: 1, mutationId: "mutation:delete" }), true);
  assert.deepEqual(calls, [
    { body: { id: group.id, mutationId: "mutation:create", name: group.name }, method: "POST", path: "/api/ai/conversations/groups" },
    { body: { expectedRevision: 1, mutationId: "mutation:session", patch: { groupId: group.id, pinned: true } }, method: "PATCH", path: "/api/ai/conversations/sessions/session%3Aone" },
    { body: { expectedRevision: 1, mutationId: "mutation:rename", name: "Work renamed" }, method: "PATCH", path: "/api/ai/conversations/groups/group%3Awork" },
    { body: { expectedRevision: 1, mutationId: "mutation:delete" }, method: "DELETE", path: "/api/ai/conversations/groups/group%3Awork" },
  ]);
});

test("Web group parser rejects malformed groups and group controls expose real actions", () => {
  assert.deepEqual(parseAgentChatGroups({ success: true, data: { groups: [group, { ...group, id: "" }] } }), [group]);
  const actions: string[] = [];
  let root: ReturnType<typeof create>;
  act(() => {
    root = create(<AgentChatHistoryOrganization
      busy={false}
      currentGroupId={null}
      groups={[group]}
      language="en"
      onCreate={(name) => actions.push(`create:${name}`)}
      onDelete={(item) => actions.push(`delete:${item.id}`)}
      onFilter={(id) => actions.push(`filter:${id}`)}
      onNew={(id) => actions.push(`new:${id}`)}
      onRename={(item, name) => actions.push(`rename:${item.id}:${name}`)}
    />);
  });
  const button = (label: string) => root!.root.findAllByType("button").find((node) => node.children.includes(label))!;
  act(() => button("Groups").props.onClick());
  act(() => button("Open").props.onClick());
  act(() => button("New").props.onClick());
  act(() => button("Rename").props.onClick());
  act(() => button("Delete").props.onClick());
  assert.deepEqual(actions, ["filter:group:work", "new:group:work", "rename:group:work:Work"]);
  act(() => button("Confirm delete").props.onClick());
  assert.deepEqual(actions, ["filter:group:work", "new:group:work", "rename:group:work:Work", "delete:group:work"]);
});
