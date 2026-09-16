import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assessRequiredChecks,
  buildInventoryPlan,
  isKnownPlatformConsoleError,
  mainScreenStatus,
  parseJourneyArgs,
  parseRouteInventory,
  readCredentialsFile,
  redactEvidence,
  resolveInventoryRoute,
  routeRenderStatus,
} from "../scripts/phoneweb-journey-support.mjs";

test("a failed required journey makes the run fail without discarding partial results", () => {
  const summary = assessRequiredChecks([
    { id: "login", required: true, status: "passed" },
    { id: "notes-write", required: true, status: "failed", detail: "HTTP 409" },
    { id: "ai-provider", required: false, status: "blocked", detail: "provider disabled" },
  ]);

  assert.equal(summary.exitCode, 1);
  assert.deepEqual(summary.counts, { blocked: 1, failed: 1, passed: 1 });
  assert.deepEqual(summary.failedRequiredIds, ["notes-write"]);
  assert.equal(summary.results.length, 3);
});

test("optional provider blocks do not turn a passing core run into a failure", () => {
  const summary = assessRequiredChecks([
    { id: "login", required: true, status: "passed" },
    { id: "ai-provider", required: false, status: "blocked" },
  ]);

  assert.equal(summary.exitCode, 0);
  assert.deepEqual(summary.failedRequiredIds, []);
});

test("evidence redaction removes nested credentials, cookies, tokens, and private bodies", () => {
  const sanitized = redactEvidence({
    email: "pw-c@example.test",
    password: "secret-password",
    request: {
      authorization: "Bearer secret-token",
      cookie: "session=secret",
      body: "private note text",
      id: "note_123",
      status: 200,
    },
  });

  assert.deepEqual(sanitized, {
    email: "[REDACTED]",
    password: "[REDACTED]",
    request: {
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      body: "[REDACTED]",
      id: "note_123",
      status: 200,
    },
  });
});

test("route inventory parser keeps static and dynamic paths without treating prose as routes", () => {
  const routes = parseRouteInventory(`
| 路由 | 页面源文件 | 浏览器验收 |
| --- | --- | --- |
| \`/home\` | \`app/home.tsx\` | 未执行 |
| \`/contacts/[id]\` | \`app/contacts/[id].tsx\` | 未执行 |

说明里的 \`/not-a-row\` 不是清单项。
`);

  assert.deepEqual(routes, ["/home", "/contacts/[id]"]);
});

test("dynamic routes use real discovered samples and never invent placeholder ids", () => {
  assert.deepEqual(
    resolveInventoryRoute("/contacts/[id]", { contactId: "contact/with space" }),
    { path: "/contacts/contact%2Fwith%20space", status: "ready" },
  );
  assert.deepEqual(
    resolveInventoryRoute("/contacts/[id]", {}),
    {
      missing: "contactId",
      path: null,
      status: "missing-sample",
    },
  );
});

test("the checked-in inventory produces exactly 81 concrete routes when real samples exist", async () => {
  const markdown = await readFile(new URL("../../../docs/phoneweb/route-inventory.md", import.meta.url), "utf8");
  const samples = {
    aiConversationId: "ai-1",
    appointmentId: "meeting-1",
    chatConversationId: "chat-1",
    contactBucketId: "bucket-1",
    contactDimension: "industry",
    contactDraftBatchId: "batch-1",
    contactId: "contact-1",
    eventId: "event-1",
    inboxConversationId: "inbox-1",
    inboxSourceId: "source-1",
    invitationToken: "invite-1",
    legacyPath: "/app/home",
    noteId: "note-1",
    notificationId: "notification-1",
    organizerSlug: "organizer-1",
    personalScheduleId: "schedule-1",
    registrationCode: "registration-1",
    taskId: "task-1",
  };
  const plan = buildInventoryPlan(markdown, samples);

  assert.equal(plan.length, 81);
  assert.equal(plan.every((item) => item.status === "ready"), true);
  assert.equal(plan.some((item) => item.path?.includes("[")), false);
});

test("credentials are accepted only from a private 0600 JSON file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phoneweb-credentials-test-"));
  const path = join(directory, "credentials.json");
  await writeFile(path, JSON.stringify({ email: "pw-c@example.test", password: "secret-password" }), { mode: 0o600 });
  try {
    assert.deepEqual(await readCredentialsFile(path), {
      email: "pw-c@example.test",
      password: "secret-password",
    });
    await chmod(path, 0o644);
    await assert.rejects(() => readCredentialsFile(path), /0600/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("journey arguments default to the isolated local port and requested mobile matrix", () => {
  assert.deepEqual(parseJourneyArgs(["--credentials-file", "/tmp/phoneweb-c.json"]), {
    baseUrl: "http://127.0.0.1:32113",
    browsers: ["chromium", "webkit"],
    credentialsFile: "/tmp/phoneweb-c.json",
    evidenceDir: "build/phoneweb/pw-0003/run-01",
    inventoryFile: "../../docs/phoneweb/route-inventory.md",
    scope: "all",
    widths: [360, 390, 430],
  });
});

test("journey arguments reject non-local targets and missing credential paths", () => {
  assert.throws(
    () => parseJourneyArgs(["--credentials-file", "/tmp/phoneweb-c.json", "--base-url", "https://demo.example"]),
    /local loopback/u,
  );
  assert.throws(() => parseJourneyArgs([]), /credentials-file/u);
  assert.equal(parseJourneyArgs(["--credentials-file", "/tmp/phoneweb-c.json", "--scope", "login"]).scope, "login");
  assert.throws(() => parseJourneyArgs(["--credentials-file", "/tmp/phoneweb-c.json", "--scope", "unknown"]), /scope/u);
});

test("a rendered tab with a visible business error is not accepted as a usable main screen", () => {
  assert.equal(mainScreenStatus({ alertCount: 1, businessError: false, loading: false, pageErrorCount: 0, selected: true, overflow: false }), "failed");
  assert.equal(mainScreenStatus({ alertCount: 0, businessError: false, loading: false, pageErrorCount: 0, selected: true, overflow: false }), "passed");
  assert.equal(mainScreenStatus({ alertCount: 0, businessError: false, loading: false, pageErrorCount: 1, selected: true, overflow: false }), "failed");
  assert.equal(mainScreenStatus({ alertCount: 0, businessError: false, loading: false, pageErrorCount: 0, selected: true, overflow: true }), "failed");
  assert.equal(mainScreenStatus({ alertCount: 0, businessError: true, loading: false, pageErrorCount: 0, selected: true, overflow: false }), "failed");
  assert.equal(mainScreenStatus({ alertCount: 0, businessError: false, loading: true, pageErrorCount: 0, selected: true, overflow: false }), "failed");
});

test("route results distinguish useful content from loading and rendered error states", () => {
  assert.equal(routeRenderStatus({ bodyLength: 10, bodyVisible: true, businessError: false, httpStatus: 200, loading: false, redirectedToLogin: false, runtimeErrorCount: 0 }), "rendered");
  assert.equal(routeRenderStatus({ bodyLength: 10, bodyVisible: true, businessError: true, loading: false }), "business-error");
  assert.equal(routeRenderStatus({ bodyLength: 10, bodyVisible: true, businessError: false, loading: true }), "loading");
  assert.equal(routeRenderStatus({ bodyLength: 10, bodyVisible: true, businessError: false, httpStatus: 404, loading: false }), "http-error");
  assert.equal(routeRenderStatus({ bodyLength: 10, bodyVisible: true, businessError: false, httpStatus: 200, loading: false, redirectedToLogin: true }), "auth-redirect");
  assert.equal(routeRenderStatus({ bodyLength: 10, bodyVisible: true, businessError: false, httpStatus: 200, loading: false, runtimeErrorCount: 1 }), "runtime-error");
  assert.equal(routeRenderStatus({ bodyLength: 0, bodyVisible: true, businessError: false, loading: false }), "failed");
});

test("only the exact WebKit interactive-widget diagnostic is a known platform difference", () => {
  assert.equal(isKnownPlatformConsoleError("webkit", 'Viewport argument key "interactive-widget" not recognized and ignored.'), true);
  assert.equal(isKnownPlatformConsoleError("chromium", 'Viewport argument key "interactive-widget" not recognized and ignored.'), false);
  assert.equal(isKnownPlatformConsoleError("webkit", "ReferenceError: application failure"), false);
});
