import assert from "node:assert/strict";
import test from "node:test";

test("same-session writes finish in intent order while other sessions remain independent", async () => {
  const { createAgentChatSessionMutationQueue } = await import("../../app/(app)/app/agent/agent-chat-session-mutations");
  const queue = createAgentChatSessionMutationQueue();
  const started: string[] = [];
  const persisted: string[] = [];
  let finish!: () => void;
  const first = queue.save("session:one", async () => {
    started.push("user");
    await new Promise<void>((resolve) => { finish = resolve; });
    persisted.push("user"); return true;
  });
  const second = queue.save("session:one", async () => { started.push("suggested"); persisted.push("suggested"); return true; });
  const third = queue.save("session:one", async () => { started.push("created"); persisted.push("created"); return true; });
  await queue.save("session:other", async () => { started.push("other"); return true; });
  assert.deepEqual(started, ["user", "other"]);
  finish();
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(persisted, ["user", "suggested", "created"]);
});

test("a failed save is reported without blocking the next full snapshot", async () => {
  const { createAgentChatSessionMutationQueue } = await import("../../app/(app)/app/agent/agent-chat-session-mutations");
  const queue = createAgentChatSessionMutationQueue();
  const failed = queue.save("session:one", async () => { throw new Error("Network failure"); });
  const saved = queue.save("session:one", async () => true);
  assert.equal(await failed, false);
  assert.equal(await saved, true);
});

test("deletion follows existing saves and prevents late results from resurrecting the session", async () => {
  const { createAgentChatSessionMutationQueue } = await import("../../app/(app)/app/agent/agent-chat-session-mutations");
  const queue = createAgentChatSessionMutationQueue();
  const operations: string[] = [];
  let finish!: () => void;
  const save = queue.save("session:one", async () => { await new Promise<void>((resolve) => { finish = resolve; }); operations.push("save"); return true; });
  const removal = queue.remove("session:one", async () => { operations.push("delete"); return true; });
  assert.equal(await queue.save("session:one", async () => { operations.push("late-save"); return true; }), false);
  assert.deepEqual(operations, []);
  finish();
  assert.deepEqual(await Promise.all([save, removal]), [true, true]);
  assert.deepEqual(operations, ["save", "delete"]);
  assert.equal(await queue.save("session:one", async () => { operations.push("resurrect"); return true; }), false);
});

test("failed deletion keeps the session writable for an explicit retry", async () => {
  const { createAgentChatSessionMutationQueue } = await import("../../app/(app)/app/agent/agent-chat-session-mutations");
  const queue = createAgentChatSessionMutationQueue();
  assert.equal(await queue.remove("session:one", async () => false), false);
  assert.equal(await queue.save("session:one", async () => true), true);
  assert.equal(await queue.remove("session:one", async () => true), true);
});
