import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildProductSurfaceManifest,
  scanProductSurfaceFile,
} from "../../scripts/generate-product-surface-manifest.mjs";

const { manifest } = buildProductSurfaceManifest();
const allActions = manifest.surfaces.flatMap((surface) =>
  surface.actions.map((action) => ({ route: surface.route, ...action })),
);

test("surface scanner covers every production page and excludes API/dev routes", () => {
  const routes = new Set(manifest.surfaces.map((surface) => surface.route));

  for (const route of [
    "/",
    "/app",
    "/app/account/login",
    "/app/agent",
    "/app/chat",
    "/app/contacts",
    "/app/contacts/[id]",
    "/app/contacts/all-actions",
    "/app/contacts/dashboard",
    "/app/contacts/graph",
    "/app/contacts/intros",
    "/app/contacts/new",
    "/app/contacts/pipeline",
    "/app/events",
    "/app/events/[id]",
    "/app/events/[id]/register",
    "/app/party",
    "/app/party/checkin",
    "/app/party/graph",
    "/app/platform",
    "/app/profile",
    "/app/schedule",
    "/app/settings",
    "/app/today",
  ]) {
    assert.equal(routes.has(route), true, `missing ${route}`);
  }

  assert.equal(
    manifest.surfaces.some(
      (surface) =>
        surface.route.startsWith("/api") || surface.route.startsWith("/dev"),
    ),
    false,
  );
  assert.equal(manifest.summary.routes, manifest.surfaces.length);
});

test("surface scanner derives private routes from the production auth boundary", () => {
  const byRoute = new Map(
    manifest.surfaces.map((surface) => [surface.route, surface]),
  );

  for (const [route, policy] of [
    ["/app/agent", "authenticated"],
    ["/app/contacts/[id]", "authenticated"],
    ["/app/account/login", "public-auth-entry"],
    ["/app/events", "public-at-proxy"],
  ]) {
    const surface = byRoute.get(route);
    assert.ok(surface && typeof surface === "object" && "access" in surface);
    const access = surface.access;
    assert.ok(access && typeof access === "object" && "policy" in access);
    assert.equal(access.policy, policy);
  }

  const agentSurface = byRoute.get("/app/agent");
  assert.ok(agentSurface && typeof agentSurface === "object" && "access" in agentSurface);
  const access = agentSurface.access;
  assert.ok(access && typeof access === "object" && "anonymousBehavior" in access);
  assert.ok(typeof access.anonymousBehavior === "string");
  assert.match(
    access.anonymousBehavior,
    /redirect:\/app\/account\/login/,
  );
});

test("action coverage records source evidence and honest unresolved runtime fields", () => {
  assert.ok(allActions.length > 0);
  assert.equal(
    manifest.summary.actions,
    manifest.surfaces.reduce(
      (total, surface) => total + surface.actions.length,
      0,
    ),
  );

  for (const action of allActions) {
    assert.match(action.actionId, /^\/.*#\d+$/);
    assert.match(action.sourceFile, /^repos\/orbits\//);
    assert.ok(action.line > 0);
    assert.ok(
      action.behaviorEvidence === "present-static" ||
        action.behaviorEvidence === "present-imperative-static" ||
        action.behaviorEvidence === "delegated-props" ||
        action.behaviorEvidence === "missing-static",
    );
    assert.notEqual(action.confirmation, "verified");
  }
});

test("mock imports distinguish factory and type boundaries from direct production use", () => {
  const directMockImports = manifest.surfaces.flatMap(
    (surface) => surface.data.directMockImports,
  );
  const classifiedMockImports = manifest.surfaces.flatMap(
    (surface) => surface.data.mockBoundaryImports,
  );
  const classifications = new Set(
    classifiedMockImports.map((item) => item.classification),
  );

  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(directMockImports, []);
  assert.ok(classifiedMockImports.length > 0);
  assert.equal(classifications.has("factory-mode-registration"), true);
  assert.equal(classifications.has("type-only-contract-reference"), true);
  assert.equal(
    classifications.has("explicit-mock-implementation-internal"),
    true,
  );
  assert.equal(
    classifiedMockImports.every(
      (item) => item.runtimeResultRisk === "resolved-by-static-boundary",
    ),
    true,
  );
});

test("translated and variable JSX labels count as accessible-name evidence", () => {
  const publicShellActions = allActions.filter((action) =>
    action.sourceFile.endsWith("app/orbit-public-shell.tsx"),
  );

  assert.ok(
    publicShellActions.some(
      (action) =>
        action.label === "Sign in" &&
        action.accessibleName === "present-static",
    ),
  );
  assert.equal(
    publicShellActions
      .filter((action) => action.label === "Sign in")
      .some((action) => action.accessibleName === "unresolved-static"),
    false,
  );
  assert.ok(
    allActions.some(
      (action) =>
        action.label === "{label}" &&
        action.accessibleName === "dynamic-runtime",
    ),
  );
  assert.equal(
    allActions
      .filter((action) =>
        action.sourceFile.endsWith("app/orbit-account-shell.tsx"),
      )
      .some(
        (action) =>
          action.line === 161 &&
          action.accessibleName === "unresolved-static",
      ),
    false,
  );
});

test("redirect aliases do not require route loading and error surfaces", () => {
  for (const route of ["/app/dashboard", "/app/followups", "/app/schedule"]) {
    const surface = manifest.surfaces.find((item) => item.route === route);

    assert.equal(surface?.states.sourceSignals.redirect, true);
    assert.equal(
      surface?.knownRisks.some(
        (risk) =>
          risk.type === "loading-state-unproven" ||
          risk.type === "error-state-unproven",
      ),
      false,
    );
  }
});

test("imperative starfield controls retain their static runtime evidence", () => {
  const starfieldActions = manifest.surfaces
    .filter((surface) => surface.route === "/" || surface.route === "/app")
    .flatMap((surface) => surface.actions)
    .filter((action) => action.sourceFile.includes("orbit-starfield-"));

  for (const label of [
    "发送给 iOrbit",
    "我要创业",
    "看看谁能帮我",
    "找金融 AI 方向的人脉",
    "推荐 AI / 出海活动",
  ]) {
    const matching = starfieldActions.filter((action) => action.label === label);
    assert.equal(matching.length, 4, `two routes by two layouts: ${label}`);
    assert.equal(
      matching.every(
        (action) =>
          action.behaviorEvidence === "present-imperative-static" &&
          action.imperativeBehaviorEvidence.some((evidence) =>
            evidence.sourceFile === "repos/orbits/app/(app)/app/orbit-starfield-agent-prompt.ts" &&
            evidence.event === "click" &&
            evidence.selector === (label === "发送给 iOrbit" ? "#skEnter" : ".sk-chip") &&
            evidence.line > 0),
      ),
      true,
      `missing imperative evidence: ${label}`,
    );
  }
});

test("starfield navigation belongs to shared React OrbitTopNav and its language toggle", () => {
  for (const route of ["/", "/app"]) {
    const actions = allActions.filter((action) => action.route === route &&
      action.sourceFile === "repos/orbits/app/(app)/app/orbit-public-shell.tsx");
    for (const label of ["t(entry.aria)", 'menuOpen ? t({ en: "Close menu", zh: "关闭菜单" }) : t({ en: "Open menu", zh: "打开菜单" })']) {
      const controls = actions.filter((action) => action.label === label);
      assert.equal(controls.length, 1, `${route}: ${label}`);
      assert.deepEqual(controls[0].handlers, ["onclick"]);
      assert.equal(controls[0].behaviorEvidence, "present-static");
      assert.deepEqual(controls[0].imperativeBehaviorEvidence, []);
    }
  }
});

function scanFixture(source: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "orbit-scanner-"));
  const filePath = path.join(directory, "fixture.tsx");
  try {
    writeFileSync(filePath, source);
    return scanProductSurfaceFile(filePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("AST fixtures preserve direct listeners and exact source/event evidence", () => {
  const actions = scanFixture(`
    const button = host.querySelector('#direct');
    button.addEventListener('click', () => act());
    host.querySelectorAll('.item').forEach(item => item.addEventListener('pointerup', act));
    const view = <><button id="direct">Direct</button><button className="item">Item</button></>;
  `);
  assert.deepEqual(actions.map((action) => action.behaviorEvidence), ["present-imperative-static", "present-imperative-static"]);
  assert.deepEqual(actions.map((action) => action.imperativeBehaviorEvidence.map(({ selector, event, line }) => ({ selector, event, line }))), [
    [{ selector: "#direct", event: "click", line: 3 }],
    [{ selector: ".item", event: "pointerup", line: 4 }],
  ]);
  assert.ok(actions.every((action) => action.imperativeBehaviorEvidence.every((evidence) => evidence.sourceFile.endsWith("/fixture.tsx"))));
});

for (const callback of [
  "const onClick = (event) => { BODY }; host.addEventListener('click', onClick);",
  "function onClick(event) { BODY } host.addEventListener('click', onClick);",
  "host.addEventListener('click', (event) => { BODY });",
]) {
  test(`AST fixtures resolve registered delegated callback: ${callback}`, () => {
    const actions = scanFixture(`function bind(host) {
      ${callback.replace("BODY", `const target = event.target.closest('.chip'); if (target && host.contains(target)) act(target);`)}
    }
    const view = <button className="chip">Chip</button>;`);
    assert.equal(actions[0].behaviorEvidence, "present-imperative-static");
    assert.deepEqual(actions[0].imperativeBehaviorEvidence.map(({ selector, event, line }) => ({ selector, event, line })), [
      { selector: ".chip", event: "click", line: 2 },
    ]);
    assert.ok(actions[0].imperativeBehaviorEvidence[0].sourceFile.endsWith("/fixture.tsx"));
  });
}

for (const write of [
  "onClick = () => {};",
  "[onClick] = [() => {}];",
  "({ onClick } = { onClick: () => {} });",
  "({ listener: onClick } = { listener: () => {} });",
  "for (onClick of [() => {}]) {}",
  "function replace() { onClick = () => {}; } replace();",
]) {
  test(`final-fix fixtures reject reassigned delegated listener: ${write}`, () => {
    const actions = scanFixture(`function bind(host) {
      function onClick(event) {
        const target = event.target.closest(".chip");
        if (target && host.contains(target)) act(target);
      }
      ${write}
      host.addEventListener("click", onClick);
    }
    const view = <button className="chip">Chip</button>;`);
    assert.equal(actions.length, 1);
    assert.deepEqual(
      actions.map(({ behaviorEvidence, imperativeBehaviorEvidence }) => ({ behaviorEvidence, imperativeBehaviorEvidence })),
      [{ behaviorEvidence: "missing-static", imperativeBehaviorEvidence: [] }],
    );
  });
}

for (const declaration of [
  "function onClick(event) { BODY }",
  "const onClick = event => { BODY };",
]) {
  test(`final-fix fixtures preserve delegated listener with unrelated shadowed writes: ${declaration}`, () => {
    const actions = scanFixture(`function bind(host) {
      ${declaration.replace("BODY", `const target = event.target.closest('.chip'); if (target && host.contains(target)) act(target);`)}
      { let onClick; onClick = () => {}; }
      function replace(onClick) { [onClick] = [() => {}]; }
      onClick.description = "listener";
      host.addEventListener("click", onClick);
    }
    const view = <button className="chip">Chip</button>;`);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].behaviorEvidence, "present-imperative-static");
    assert.deepEqual(actions[0].imperativeBehaviorEvidence.map(({ selector, event, line }) => ({ selector, event, line })), [
      { selector: ".chip", event: "click", line: 6 },
    ]);
    assert.ok(actions[0].imperativeBehaviorEvidence[0].sourceFile.endsWith("/fixture.tsx"));
  });
}

test("AST fixtures reject unregistered, cross-host, dynamic, nested and decoy dispatch paths", () => {
  const actions = scanFixture(`
    function bind(host, otherHost, selector) {
      const unused = event => { const target = event.target.closest('#unused'); if (target && host.contains(target)) act(); };
      const other = event => { const target = event.target.closest('#other'); if (target && otherHost.contains(target)) act(); };
      host.addEventListener('click', other);
      host.addEventListener('click', event => {
        const dynamic = event.target.closest(selector);
        if (dynamic && host.contains(dynamic)) act();
        const decoy = document.querySelector('#decoy');
        const unusedClosest = event.target.closest('#decoy');
        const unguarded = event.target.closest('#unguarded');
        if (unguarded) act();
        const nested = () => { const target = event.target.closest('#nested'); if (target && host.contains(target)) act(); };
      });
    }
    function unrelated(host) {
      const onClick = event => { const target = event.target.closest('#scope'); if (target && host.contains(target)) act(); };
      const direct = host.querySelector('#direct-decoy');
    }
    function registered(host, direct, onClick) {
      host.addEventListener('click', onClick);
      direct.addEventListener('click', () => act());
    }
    const view = <>
      <button id="unused">Unused</button><button id="other">Other</button>
      <button id="dynamic">Dynamic</button><button id="decoy">Decoy</button>
      <button id="unguarded">Unguarded</button><button id="nested">Nested</button>
      <button id="scope">Scope</button><button id="direct-decoy">Direct decoy</button>
    </>;
  `);
  assert.equal(actions.length, 8);
  for (const action of actions) {
    assert.equal(action.behaviorEvidence, "missing-static", action.label ?? "");
    assert.deepEqual(action.imperativeBehaviorEvidence, []);
  }
});

test("AST fixtures do not grant delegated evidence for a guard without a dispatched action", () => {
  const actions = scanFixture(`function bind(host) {
    host.addEventListener('click', event => {
      const target = event.target.closest('#empty');
      if (target && host.contains(target)) {}
    });
  }
  const view = <button id="empty">Empty</button>;`);
  assert.equal(actions[0].behaviorEvidence, "missing-static");
});

test("AST fixtures distinguish intrinsic form from Form while retaining role and handlers", () => {
  const actions = scanFixture(`const view = <>
    <Form><form onSubmit={save}><button>Save</button></form></Form>
    <Form role="button" onClick={open}>Role</Form>
    <Form onSubmit={save}>Handler</Form>
    <Form><button>Missing handler</button></Form>
  </>;`);
  assert.deepEqual(actions.map((action) => [action.tag, action.kind, action.behaviorEvidence]), [
    ["form", "form-submit", "present-static"], ["button", "button", "present-static"],
    ["Form", "role-button", "present-static"], ["Form", "click-handler", "present-static"],
    ["button", "button", "missing-static"],
  ]);
});

test("AST fixtures classify title helpers as dynamic without trusting arbitrary calls or missing labels", () => {
  const actions = scanFixture(`const view = <>
    <a href="/entry">{entryTitle(entry.title)}</a>
    <a href="/entry">{arbitrary(entry.title)}</a>
    <button />
  </>;`);
  assert.equal(actions[0].label, "{entryTitle(entry.title)}");
  assert.equal(actions[0].accessibleName, "dynamic-runtime");
  assert.equal(actions[1].accessibleName, "unresolved-static");
  assert.equal(actions[2].accessibleName, "unresolved-static");
  assert.equal(actions[2].behaviorEvidence, "missing-static");
});

test("pointer-down resize controls count as static behavior", () => {
  const resizeActions = allActions.filter(
    (action) =>
      action.sourceFile.endsWith("app/agent/orbit-real-agent.tsx") &&
      action.label?.includes("Resize chat history"),
  );

  assert.ok(resizeActions.length > 0);
  assert.equal(
    resizeActions.every(
      (action) =>
        action.behaviorEvidence === "present-static" &&
        action.handlers.includes("onpointerdown"),
    ),
    true,
  );
});

test("manifest generation writes the required repository artifacts", () => {
  assert.ok(manifest.summary.routes > 30);
  assert.ok(manifest.summary.actions > 100);
  assert.equal(
    manifest.summary.risks,
    manifest.surfaces.reduce(
      (total, surface) => total + surface.knownRisks.length,
      0,
    ),
  );
  assert.equal(manifest.summary.p0Candidates, 0);
  assert.equal(manifest.summary.p1Candidates, 0);
});

for (const parameters of ["{ host, otherHost }", "[host, otherHost]"]) {
  test(`review fixtures preserve distinct destructured hosts: ${parameters}`, () => {
    const actions = scanFixture(`function bind(${parameters}) {
      host.addEventListener('click', event => {
        const target = event.target.closest('#wrong');
        if (target && otherHost.contains(target)) act(target);
        const valid = event.target.closest('#right');
        if (valid && host.contains(valid)) act(valid);
      });
    }
    const view = <><button id="wrong">Wrong</button><button id="right">Right</button></>;`);
    assert.equal(actions[0].behaviorEvidence, "missing-static");
    assert.deepEqual(actions[0].imperativeBehaviorEvidence, []);
    assert.equal(actions[1].behaviorEvidence, "present-imperative-static");
  });
}

test("review fixtures stop callback lookup at unsupported value-space shadows", () => {
  const actions = scanFixture(`function bind(host) {
    const onClick = event => { const target = event.target.closest('#shadow'); if (target && host.contains(target)) act(target); };
    { class onClick {} host.addEventListener('click', onClick); }
  }
  const view = <button id="shadow">Shadow</button>;`);
  assert.equal(actions[0].behaviorEvidence, "missing-static");
  assert.deepEqual(actions[0].imperativeBehaviorEvidence, []);
});

for (const body of [
  "if (target && host.contains(target)) { return; act(target); }",
  "if (target && host.contains(target)) { throw Error(); act(target); }",
  "if (false) { if (target && host.contains(target)) act(target); }",
  "if (false && target && host.contains(target)) act(target);",
  "return; if (target && host.contains(target)) act(target);",
  "if (true) return; if (target && host.contains(target)) act(target);",
  "while (false) { if (target && host.contains(target)) act(target); }",
  "if (unknown) { if (target && host.contains(target)) act(target); }",
]) {
  test(`review fixtures reject unreachable or unsupported dispatch: ${body}`, () => {
    const actions = scanFixture(`function bind(host) {
      host.addEventListener('click', event => {
        const target = event.target.closest('#dead'); ${body}
      });
    }
    const view = <button id="dead">Dead</button>;`);
    assert.equal(actions[0].behaviorEvidence, "missing-static");
    assert.deepEqual(actions[0].imperativeBehaviorEvidence, []);
  });
}

test("review fixtures retain proven form callback ownership as a non-leaf record", () => {
  const actions = scanFixture(`
    function Proposal({ onSubmit: submit }) {
      return <form onSubmit={event => { event.preventDefault(); if (valid) void submit(value); }}><button type="submit">Send proposal</button></form>;
    }
    const view = <Proposal onSubmit={proposal => save(proposal)} />;
  `);
  const owner = actions.find((action) => action.tag === "Proposal");
  assert.ok(owner);
  assert.equal(owner.kind, "component-container");
  assert.equal(owner.accessibleName, "not-applicable-container");
  assert.equal(owner.label, null);
  assert.deepEqual(owner.handlers, ["onsubmit"]);
  assert.equal(owner.behaviorEvidence, "present-static");
  assert.deepEqual(owner.componentOwnershipEvidence, {
    component: "Proposal", callbackProp: "onSubmit", callbackExpression: "proposal => save(proposal)",
    sourceFile: owner.sourceFile, componentLine: 2, formLine: 3,
  });
  assert.ok(actions.some((action) => action.tag === "form" && action.kind === "form-submit"));
  assert.ok(actions.some((action) => action.tag === "button" && action.label === "Send proposal" && action.behaviorEvidence === "present-static"));
});

test("review fixtures retain unproven callbacks, explicit roles and actual custom controls", () => {
  const actions = scanFixture(`
    function Forward({onSubmit}) { return <form onSubmit={onSubmit}><button>Send</button></form>; }
    function Ignored({onSubmit}) { return <form onSubmit={other}><button>Send</button></form>; }
    function Actual({onSubmit}) { return <button onClick={() => onSubmit(value)}>Act</button>; }
    function Decoy({onSubmit}) { const unused = <form onSubmit={onSubmit} />; return <button>Act</button>; }
    function Shadowed({onSubmit}) { return <form onSubmit={onSubmit => onSubmit(value)}><button>Send</button></form>; }
    function Mixed({onSubmit}) { return <form onSubmit={onSubmit}><button onClick={() => onSubmit(value)}>Act</button></form>; }
    function Dead({onSubmit}) { return <form onSubmit={() => { return; onSubmit(value); }}><button>Send</button></form>; }
    const view = <>
      <Forward onSubmit={save} />
      <Forward role="button" onSubmit={save} />
      <Forward onClick={act} onSubmit={save} />
      <Unknown onSubmit={save} /><Ignored onSubmit={save} /><Actual onSubmit={save} />
      <Decoy onSubmit={save} /><Shadowed onSubmit={save} /><Mixed onSubmit={save} /><Dead onSubmit={save} />
    </>;
  `);
  const custom = actions.filter((action) => /^[A-Z]/.test(action.tag));
  assert.deepEqual(custom.map((action) => [action.tag, action.kind, action.accessibleName]), [
    ["Forward", "component-container", "not-applicable-container"],
    ["Forward", "role-button", "unresolved-static"],
    ["Forward", "click-handler", "unresolved-static"],
    ...["Unknown", "Ignored", "Actual", "Decoy", "Shadowed", "Mixed", "Dead"].map((tag) => [tag, "click-handler", "unresolved-static"]),
  ]);
  assert.ok(custom.slice(1).every((action) => !action.componentOwnershipEvidence));
});

test("review fixtures resolve production ProposalForm provenance without duplicate name findings", () => {
  const owners = allActions.filter((action) => action.tag === "ProposalForm");
  assert.equal(owners.length, 5);
  for (const owner of owners) {
    assert.equal(owner.kind, "component-container");
    assert.equal(owner.accessibleName, "not-applicable-container");
    assert.equal(owner.componentOwnershipEvidence?.formLine, 94);
    assert.equal(owner.componentOwnershipEvidence?.componentLine, 83);
    assert.equal(owner.componentOwnershipEvidence?.callbackProp, "onSubmit");
    assert.equal(owner.componentOwnershipEvidence?.sourceFile, "repos/orbits/app/(app)/app/events/[id]/orbit-appointment-negotiation.tsx");
    assert.equal(owner.componentOwnershipEvidence?.callbackExpression, '(proposal) => command(pendingProposal ? "counter" : "propose", { proposal })');
  }
});

test("review fixtures reject wrong-case callback props and dead expression forwarding", () => {
  const actions = scanFixture(`
    function Forward({onSubmit}) { return <form onSubmit={onSubmit}><button>Send</button></form>; }
    function Conditional({onSubmit}) { return <form onSubmit={() => false ? onSubmit(value) : undefined}><button>Send</button></form>; }
    function ShortCircuit({onSubmit}) { return <form onSubmit={() => false && onSubmit(value)}><button>Send</button></form>; }
    const view = <><Forward onsubmit={save} /><Conditional onSubmit={save} /><ShortCircuit onSubmit={save} /></>;
  `);
  const custom = actions.filter((action) => /^[A-Z]/.test(action.tag));
  assert.equal(custom.length, 3);
  assert.ok(custom.every((action) => action.kind === "click-handler" && action.accessibleName === "unresolved-static" && !action.componentOwnershipEvidence));
});

for (const role of ['role="button"', 'role={"button"}', 'role={mode}']) {
  test(`fix-2 fixtures preserve returned-form role name findings: ${role}`, () => {
    const actions = scanFixture(`
      function Control({onSubmit}) { return <form ${role} onSubmit={onSubmit}></form>; }
      const view = <Control onSubmit={save} />;
    `);
    const control = actions.find((action) => action.tag === "Control");
    assert.ok(control);
    assert.equal(control.kind, "click-handler");
    assert.equal(control.accessibleName, "unresolved-static");
    assert.equal(control.componentOwnershipEvidence, null);
    assert.deepEqual(control.handlers, ["onsubmit"]);
    assert.ok(actions.some((action) => action.tag === "form"));
  });
}

for (const write of [
  "Forward = ActualControl;",
  "Forward ||= ActualControl;",
  "[Forward] = [ActualControl];",
  "({next: Forward} = replacement);",
  "({Forward} = replacement);",
  "function replace() { Forward = ActualControl; } replace();",
  "for (Forward of replacements) {}",
  "Forward++;",
]) {
  test(`fix-2 fixtures reject reassigned component ownership: ${write}`, () => {
    const actions = scanFixture(`
      function Forward({onSubmit}) { return <form onSubmit={onSubmit}><button>Send</button></form>; }
      ${write}
      const view = <Forward onSubmit={save} />;
    `);
    const control = actions.find((action) => action.tag === "Forward");
    assert.ok(control);
    assert.equal(control.kind, "click-handler");
    assert.equal(control.accessibleName, "unresolved-static");
    assert.equal(control.componentOwnershipEvidence, null);
  });
}

test("fix-2 fixtures do not confuse shadowed writes or property updates with rebinding", () => {
  const actions = scanFixture(`
    function Forward({onSubmit}) { return <form onSubmit={onSubmit}><button>Send</button></form>; }
    function unrelated() { let Forward; Forward = ActualControl; }
    Forward.displayName = 'Forward';
    const view = <Forward onSubmit={save} />;
  `);
  const control = actions.find((action) => action.tag === "Forward");
  assert.ok(control);
  assert.equal(control.kind, "component-container");
  assert.equal(control.componentOwnershipEvidence?.component, "Forward");
});
