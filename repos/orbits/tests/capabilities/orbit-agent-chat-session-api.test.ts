import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

function withoutLiveDatabaseEnv<TValue>(run: () => Promise<TValue>): Promise<TValue> {
  const previous = {
    ORBIT_DATABASE_URL: process.env.ORBIT_DATABASE_URL,
    ORBIT_EVENT_DATABASE_URL: process.env.ORBIT_EVENT_DATABASE_URL,
    ORBIT_LIVE_DATABASE_URL: process.env.ORBIT_LIVE_DATABASE_URL,
  };

  delete process.env.ORBIT_DATABASE_URL;
  delete process.env.ORBIT_EVENT_DATABASE_URL;
  delete process.env.ORBIT_LIVE_DATABASE_URL;

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("Orbit Agent chat session API is safe when live storage is unconfigured", async () => {
  await withoutLiveDatabaseEnv(async () => {
    const route = await importProjectModule<{
      GET: () => Promise<Response>;
      POST: (request: Request) => Promise<Response>;
    }>("app/api/ai/conversations/sessions/route.ts");

    const listResponse = await route.GET();
    const listEnvelope = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listEnvelope.success, true);
    assert.deepEqual(listEnvelope.data.sessions, []);
    assert.equal(listEnvelope.data.storage.configured, false);
    assert.equal(listEnvelope.data.storage.persisted, false);

    const saveResponse = await route.POST(
      new Request("https://orbit.local/api/ai/conversations/sessions", {
        body: JSON.stringify({
          session: {
            id: "agent-session-demo",
            messages: [{ role: "user", text: "你好" }],
            title: "演示",
            updatedAt: "2026-07-09T02:30:00.000Z",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const saveEnvelope = await saveResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(saveEnvelope.success, true);
    assert.equal(saveEnvelope.data.session.id, "agent-session-demo");
    assert.equal(saveEnvelope.data.storage.configured, false);
    assert.equal(saveEnvelope.data.storage.persisted, false);

    const byIdRoute = await importProjectModule<{
      DELETE: (
        request: Request,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>;
    }>("app/api/ai/conversations/sessions/[id]/route.ts");
    const deleteResponse = await byIdRoute.DELETE(
      new Request(
        "https://orbit.local/api/ai/conversations/sessions/agent-session-demo",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ id: "agent-session-demo" }) },
    );
    const deleteEnvelope = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteEnvelope.success, true);
    assert.equal(deleteEnvelope.data.deleted, false);
    assert.equal(deleteEnvelope.data.storage.configured, false);
  });
});
