/**
 * Capability registry 与 module mode 测试。
 *
 * 验证 mock/hybrid/live mode 解析、service factory 和 capability registration。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODULE_MODE,
  MODULE_MODES,
  createModuleServiceFactory,
  resolveModuleMode,
} from "../../shared/services/module-mode";
import {
  createCapabilityService,
  getCapabilityRegistration,
  listCapabilitySummaries,
} from "../../shared/services/capability-registry";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("module mode service factories default to mock and expose controlled live failures", () => {
  const serviceFactory = createModuleServiceFactory({
    capabilityId: "contacts",
    defaultMode: "mock",
    implementations: {
      mock: ({ capabilityId, requestedMode }) => ({
        capabilityId,
        requestedMode,
        serviceName: "mock-contacts",
      }),
      hybrid: ({ capabilityId, requestedMode }) => ({
        capabilityId,
        requestedMode,
        serviceName: "hybrid-contacts",
      }),
    },
  });

  assert.deepEqual(MODULE_MODES, ["mock", "hybrid", "live"]);
  assert.equal(DEFAULT_MODULE_MODE, "mock");
  assert.equal(resolveModuleMode(), "mock");
  assert.equal(resolveModuleMode(" LIVE "), "live");
  assert.equal(resolveModuleMode("unsupported-provider"), "mock");

  assert.deepEqual(serviceFactory.create(), {
    success: true,
    mode: "mock",
    service: {
      capabilityId: "contacts",
      requestedMode: "mock",
      serviceName: "mock-contacts",
    },
  });
  assert.deepEqual(serviceFactory.create("hybrid"), {
    success: true,
    mode: "hybrid",
    service: {
      capabilityId: "contacts",
      requestedMode: "hybrid",
      serviceName: "hybrid-contacts",
    },
  });
  assert.deepEqual(serviceFactory.create("live"), {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message:
        'Live service for capability "contacts" is not implemented. Configure a live provider before using this capability in production.',
      capabilityId: "contacts",
      requestedMode: "live",
      availableModes: ["mock", "hybrid"],
    },
  });
});

test("module mode service factories honor ORBIT_MODULE_MODE when mode is omitted", () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const serviceFactory = createModuleServiceFactory({
    capabilityId: "orbit-agent-conversation",
    defaultMode: "mock",
    implementations: {
      live: ({ requestedMode }) => ({
        requestedMode,
        serviceName: "live-orbit-agent-conversation",
      }),
      mock: ({ requestedMode }) => ({
        requestedMode,
        serviceName: "mock-orbit-agent-conversation",
      }),
    },
  });
  try {
    process.env.ORBIT_MODULE_MODE = "live";

    assert.deepEqual(serviceFactory.create(), {
      mode: "live",
      service: {
        requestedMode: "live",
        serviceName: "live-orbit-agent-conversation",
      },
      success: true,
    });
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});

test("production module mode is live-only even for missing or explicit mock input", () => {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = runtimeEnv.NODE_ENV;
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const serviceFactory = createModuleServiceFactory({
    capabilityId: "production-provider-boundary",
    defaultMode: "mock",
    implementations: {
      live: ({ requestedMode }) => ({ requestedMode }),
      mock: ({ requestedMode }) => ({ requestedMode }),
    },
  });
  const mockOnlyServiceFactory = createModuleServiceFactory({
    capabilityId: "production-mock-only-boundary",
    defaultMode: "mock",
    implementations: {
      mock: ({ requestedMode }) => ({ requestedMode }),
    },
  });

  try {
    runtimeEnv.NODE_ENV = "production";
    delete process.env.ORBIT_MODULE_MODE;
    delete process.env.ORBIT_FEATURE_MODE;

    assert.equal(resolveModuleMode(), "live");
    assert.equal(resolveModuleMode("mock"), "live");
    assert.equal(resolveModuleMode("hybrid"), "live");
    assert.equal(resolveModuleMode("invalid"), "live");
    assert.deepEqual(serviceFactory.create("mock"), {
      success: true,
      mode: "live",
      service: { requestedMode: "live" },
    });
    for (const input of [undefined, "mock", "hybrid", "invalid"]) {
      const resolution = mockOnlyServiceFactory.create(input);
      assert.equal(resolution.success, false, String(input));
      if (!resolution.success) {
        assert.equal(resolution.error.requestedMode, "live");
        assert.deepEqual(resolution.error.availableModes, ["mock"]);
        assert.match(resolution.error.message, /Configure a live provider/u);
        assert.doesNotMatch(resolution.error.message, /Use mock mode/u);
      }
    }
  } finally {
    if (previousNodeEnv === undefined) {
      delete runtimeEnv.NODE_ENV;
    } else {
      runtimeEnv.NODE_ENV = previousNodeEnv;
    }
    if (previousModuleMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousModuleMode;
    }
    if (previousFeatureMode === undefined) {
      delete process.env.ORBIT_FEATURE_MODE;
    } else {
      process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    }
  }
});

test("module mode service factories fall back to mock for hybrid while keeping live closed", () => {
  const serviceFactory = createModuleServiceFactory({
    capabilityId: "mock-only-capability",
    defaultMode: "mock",
    implementations: {
      mock: ({ capabilityId, requestedMode }) => ({
        capabilityId,
        requestedMode,
        serviceName: "mock-only",
      }),
    },
  });

  assert.deepEqual(serviceFactory.create("hybrid"), {
    success: true,
    mode: "hybrid",
    service: {
      capabilityId: "mock-only-capability",
      requestedMode: "hybrid",
      serviceName: "mock-only",
    },
  });

  const live = serviceFactory.create("live");

  assert.equal(live.success, false);
  if (!live.success) {
    assert.equal(live.error.code, "NOT_IMPLEMENTED");
    assert.equal(live.error.requestedMode, "live");
    assert.deepEqual(live.error.availableModes, ["mock"]);
  }
});

test("capability registry defaults every registered capability to mock mode with API and debug metadata", () => {
  const summaries = listCapabilitySummaries();

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    [
      "account-profile",
      "permissions",
      "contact-acquisition",
      "contacts",
      "connections",
      "events",
      "followups",
      "chat",
      "dashboard",
      "agent-actions",
      "notifications",
    ],
  );

  for (const summary of summaries) {
    assert.equal(summary.currentMode, "mock");
    assert.equal(summary.serviceStatus, "mock-ready");
    assert.ok(summary.api.routes.length > 0, `${summary.id} needs API routes`);
    assert.ok(
      summary.api.routes.every((route) => route.path.startsWith("/api/")),
      `${summary.id} API routes must use API metadata paths`,
    );
    assert.ok(
      summary.debug.route.startsWith("/dev/capabilities"),
      `${summary.id} needs a debug route under /dev/capabilities`,
    );
  }
});

test("capability service lookup returns mock services by default and live inventory metadata in live mode", () => {
  const contacts = createCapabilityService("contacts");
  assert.deepEqual(contacts, {
    success: true,
    mode: "mock",
    service: {
      capabilityId: "contacts",
      mode: "mock",
      status: "mock-ready",
      source: "mock-service-factory",
      readiness: {
        evidence: [],
        limitations: [],
      },
      provenance: {
        requiresEvidence: true,
        requiresSource: true,
        sensitiveActionsRequireConfirmation: false,
      },
    },
  });

  const liveAgentActions = createCapabilityService("agent-actions", {
    mode: "live",
  });

  assert.deepEqual(liveAgentActions, {
    success: true,
    mode: "live",
    service: {
      capabilityId: "agent-actions",
      mode: "live",
      status: "live-limited",
      source: "live-service-factory",
      readiness: {
        evidence: [
          "tests/capabilities/orbit-agent-gemini-live.test.ts",
          "tests/pages/agent-functional-test-report.test.tsx",
        ],
        limitations: [
          "The functional report still contains limited capabilities and must not be treated as a full pass.",
        ],
      },
      provenance: {
        requiresEvidence: true,
        requiresSource: true,
        sensitiveActionsRequireConfirmation: true,
      },
    },
  });
});

test("capability summaries never treat a registered constructor as complete live readiness", () => {
  const liveSummaries = listCapabilitySummaries({ mode: "live" });

  assert.equal(liveSummaries.length, 11);
  assert.deepEqual(
    liveSummaries.map((summary) => [summary.id, summary.serviceStatus]),
    [
      ["account-profile", "live-limited"],
      ["permissions", "live-limited"],
      ["contact-acquisition", "live-limited"],
      ["contacts", "live-limited"],
      ["connections", "live-limited"],
      ["events", "live-limited"],
      ["followups", "live-limited"],
      ["chat", "live-limited"],
      ["dashboard", "live-limited"],
      ["agent-actions", "live-limited"],
      ["notifications", "live-limited"],
    ],
  );

  for (const summary of liveSummaries) {
    assert.ok(
      summary.readiness.evidence.length > 0,
      `${summary.id} must cite executable evidence`,
    );
    assert.ok(
      summary.readiness.limitations.length > 0,
      `${summary.id} must expose known limitations until fully verified`,
    );
    for (const evidencePath of summary.readiness.evidence) {
      assert.equal(
        existsSync(join(projectRoot, evidencePath)),
        true,
        `${summary.id} cites missing executable evidence: ${evidencePath}`,
      );
    }
  }
});

test("capability registration exposes metadata needed by pages and route handlers", () => {
  const agentActions = getCapabilityRegistration("agent-actions");

  assert.equal(agentActions.id, "agent-actions");
  assert.equal(agentActions.label, "Agent action queue");
  assert.deepEqual(agentActions.defaultMode, "mock");
  assert.deepEqual(agentActions.api, {
    envelope: "{ success: true, data } | { success: false, error }",
    routes: [
      {
        method: "GET",
        path: "/api/agent/actions",
        purpose: "List proposed actions with evidence and confirmation state.",
      },
      {
        method: "POST",
        path: "/api/agent/actions/:id/confirm",
        purpose: "Confirm a sensitive action before any external provider call.",
      },
    ],
  });
  assert.deepEqual(agentActions.debug, {
    route: "/dev/capabilities#agent-actions",
    title: "Agent action queue capability",
    description:
      "Shows whether proposed action services are using mock, hybrid, or live mode and whether confirmation guards are required.",
  });
});

test("capabilities developer page reads from the shared registry", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /listCapabilitySummaries/);
  assert.match(pageSource, /Capability registry/);
  assert.match(pageSource, /current mode/i);
  assert.match(pageSource, /NOT_IMPLEMENTED/);
});

test("capabilities developer page exposes an operator handoff checklist", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /Operator handoff/i);
  assert.match(pageSource, /Implementation coverage/i);
  assert.match(
    pageSource,
    /shared\/services\/create-the-standard-way-pages-and-routes-obtain-mock-hybrid-or-live-services\/LIVE_IMPLEMENTATION\.md/,
  );
  assert.match(pageSource, /provider files/i);
  assert.match(pageSource, /switch mechanism/i);
  assert.match(pageSource, /required env vars/i);
  assert.match(pageSource, /privacy and provenance/i);
  assert.match(pageSource, /replacement tests/i);
});

test("mock-to-live handoff explains provider files, switch mechanism, env vars, privacy, and replacement tests", () => {
  const doc = readFileSync(
    join(
      projectRoot,
      "shared/services/create-the-standard-way-pages-and-routes-obtain-mock-hybrid-or-live-services/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /ORBIT_MODULE_MODE/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /Operator migration checklist/i);
  assert.match(doc, /Register the live constructor/i);
  assert.match(doc, /Keep debug surfaces free of raw provider payloads/i);
  assert.match(doc, /Replace the NOT_IMPLEMENTED expectation/i);
});
