import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditReadSurfaces, extractReadCalls } from '../scripts/audit-offline-read-surfaces';
import { resolveReadSurface, matchTemplate, surfaces } from '../src/data/offline-read/route-domain-inventory';

// Each assertion protects a persistence boundary, or exercises the audit on real AST inputs.
test('private portrait reads and saves never inherit ordinary registration persistence', () => {
  for (const method of ['GET', 'POST']) {
    const surface = resolveReadSurface(method, '/api/events/event%3A1/registration/portrait');
    assert.equal(surface.consumerFile, 'src/screens/events/EventRegistrationScreen.tsx');
    assert.equal(surface.domainId, 'registrations');
    assert.equal(surface.readPersistence, 'online_only_secret');
    assert.equal(surface.binaryPolicy, 'never_local');
    assert.equal(surface.mutationPolicy, 'online_only');
  }
  assert.equal(resolveReadSurface('GET', '/api/events/event%3A1/registration').readPersistence, 'durable_normalized');
  assert.throws(() => resolveReadSurface('GET', '/api/events/event%3A1/registration/portrait/other'), /UNREGISTERED_READ/);
});

test('roster qualification registers the same durable event read policy as the party detail consumer', () => {
  const owner = surfaces.find(row => row.consumerFile === 'src/screens/party/PartyModeScreen.tsx' && row.method === 'GET' && row.endpointTemplate === '/api/events/:id');
  const qualification = surfaces.find(row => row.consumerFile === 'src/screens/events/EventAttendeeRosterLink.tsx' && row.method === 'GET' && row.endpointTemplate === '/api/events/:id');
  assert.ok(owner);
  assert.ok(qualification);
  assert.deepEqual({ ...qualification, consumerFile: owner.consumerFile }, owner);
  assert.equal(qualification.domainId, 'events');
  assert.equal(qualification.selector, 'events:GET:/api/events/:id');
  assert.equal(qualification.readPersistence, 'durable_normalized');
  assert.equal(qualification.schemaVersion, 1);
});

test('canonical lifecycle and participant consumers are registered without offline mutation authority', () => {
  const expected = [
    ['src/screens/tasks/RelationshipLifecycleList.tsx', 'GET', '/api/relationship-tasks', 'tasks'],
    ['src/screens/tasks/RelationshipLifecycleScreen.tsx', 'GET', '/api/connections/:id/lifecycle', 'connections'],
    ['src/screens/tasks/RelationshipLifecycleScreen.tsx', 'POST', '/api/connections/:id/lifecycle', 'connections'],
    ['src/view-models/relationship-initialization.ts', 'GET', '/api/connections', 'connections'],
    ['src/view-models/relationship-initialization.ts', 'GET', '/api/connections/:id/lifecycle', 'connections'],
    ['src/view-models/relationship-initialization.ts', 'GET', '/api/contacts/:id/relationship-initialization', 'contacts'],
    ['src/view-models/relationship-initialization.ts', 'POST', '/api/contacts/:id/relationship-initialization', 'contacts'],
    ['src/view-models/event-attendee-controller.ts', 'GET', '/api/events/:id/operations', 'event-operations'],
    ['src/view-models/event-attendee-controller.ts', 'GET', '/api/events/:id/operations/participants/:id', 'event-operations'],
    ['src/view-models/event-attendee-controller.ts', 'POST', '/api/events/:id/operations/check-in', 'event-operations'],
    ['src/view-models/event-attendee-controller.ts', 'POST', '/api/events/:id/operations/contact-requests', 'event-operations'],
    ['src/view-models/event-attendee-controller.ts', 'POST', '/api/events/:id/operations/contact-requests/:id/:id', 'event-operations'],
  ];
  for (const [file, method, path, domain] of expected) {
    const surface = surfaces.find(row => row.consumerFile === file && row.method === method && row.endpointTemplate === path);
    assert.ok(surface, `${file} ${method} ${path}`);
    assert.equal(surface.domainId, domain);
    assert.equal(surface.schemaVersion, 1);
    assert.equal(surface.mutationPolicy, 'online_only');
    assert.equal(resolveReadSurface(method!, path!.replaceAll(':id', 'example')).domainId, domain);
  }
  assert.equal(surfaces.some(row => row.consumerFile === 'src/screens/events/EventAttendeesScreen.tsx'), false);
  assert.throws(() => resolveReadSurface('POST', '/api/events/example/operations/unknown'), /UNREGISTERED_READ/);
});

test('unknown and secret endpoints never default to persistence', () => {
  for (const consumerFile of ['src/api/auth-session.ts', 'src/api/AuthSessionProvider.tsx']) {
    for (const endpointTemplate of ['/api/auth/mobile/credentials', '/api/auth/mobile/google/exchange']) {
      const surface = surfaces.find(row => row.consumerFile === consumerFile && row.method === 'POST' && row.endpointTemplate === endpointTemplate);
      assert.ok(surface, `${consumerFile} ${endpointTemplate}`);
      assert.equal(surface.readPersistence, 'online_only_secret');
      assert.equal(surface.binaryPolicy, 'never_local');
      assert.equal(surface.mutationPolicy, 'online_only');
    }
  }
  assert.throws(() => resolveReadSurface('GET', '/api/new-private-domain'), /UNREGISTERED_READ/);
  assert.equal(resolveReadSurface('GET', '/api/auth/session').readPersistence, 'online_only_secret');
  assert.equal(resolveReadSurface('GET', '/api/notes/n1').domainId, 'notes');
  assert.equal(resolveReadSurface('GET', '/api/notes?actorId=other').domainId, 'notes');
  assert.equal(resolveReadSurface('POST', '/api/notes').mutationPolicy, 'online_only');
  assert.throws(() => resolveReadSurface('DELETE', '/api/auth/session'), /UNREGISTERED_READ/);
  const providerTodo = resolveReadSurface('GET', '/api/relationship-signals/email-calendar');
  assert.match(providerTodo.selector, /^todo:external-provider-oauth$/);
  assert.equal(providerTodo.readPersistence, 'online_only_secret');
  assert.equal(providerTodo.binaryPolicy, 'never_local');
  for (const [method, path] of [
    ['POST', '/api/account/session/sign-out'],
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/mobile/credentials'],
    ['POST', '/api/auth/mobile/google/exchange'],
    ['GET', '/api/auth/mobile/providers'],
    ['GET', '/api/auth/session'],
    ['POST', '/api/devices/push-tokens'],
    ['DELETE', '/api/devices/push-token'],
  ] as const) {
    const surface = resolveReadSurface(method, path);
    assert.equal(surface.readPersistence, 'online_only_secret', `${method} ${path}`);
    assert.equal(surface.binaryPolicy, 'never_local', `${method} ${path}`);
  }
});

test('canonical event and personal schedule consumers register exact domains without offline write authority', () => {
  for (const [consumerFile, method, endpointTemplate, domainId] of [
    ['src/screens/events/CanonicalEventDetailModules.tsx', 'GET', '/api/events/:id/registration', 'registrations'],
    ['src/screens/events/CanonicalEventDetailModules.tsx', 'GET', '/api/events/:id/operations', 'event-operations'],
    ['src/screens/events/CanonicalEventDetailModules.tsx', 'GET', '/api/events/:id/post-event/artifact', 'event-goals'],
    ['src/screens/events/CanonicalEventDetailModules.tsx', 'POST', '/api/events/:id/registration/cancel', 'registrations'],
    ['src/screens/schedule/PersonalScheduleAssociations.tsx', 'GET', '/api/contacts/:id', 'contacts'],
    ['src/screens/schedule/PersonalScheduleAssociations.tsx', 'GET', '/api/schedule-items/association-options/notes', 'notes'],
    ['src/screens/schedule/PersonalScheduleAssociations.tsx', 'GET', '/api/notes/:id', 'notes'],
    ['src/screens/schedule/PersonalScheduleAssociations.tsx', 'GET', '/api/schedule-items/association-options/contacts', 'contacts'],
    ['src/screens/schedule/PersonalScheduleDetailScreen.tsx', 'GET', '/api/schedule-items', 'personal-schedule'],
    ['src/screens/schedule/PersonalScheduleDetailScreen.tsx', 'GET', '/api/schedule-items/:id', 'personal-schedule'],
  ] as const) {
    const surface = surfaces.find(row => row.consumerFile === consumerFile && row.method === method && row.endpointTemplate === endpointTemplate);
    assert.ok(surface, `${consumerFile} ${method} ${endpointTemplate}`);
    assert.equal(surface.domainId, domainId);
    assert.equal(surface.selector, `${domainId}:${method}:${endpointTemplate}`);
    assert.equal(surface.schemaVersion, 1);
    assert.equal(surface.readPersistence, 'durable_normalized');
    assert.equal(surface.binaryPolicy, 'metadata_only');
    assert.equal(surface.mutationPolicy, 'online_only');
    assert.equal(resolveReadSurface(method, endpointTemplate.replace(':id', 'example')).domainId, domainId);
  }
  assert.equal(resolveReadSurface('GET', '/api/events/example/operations/admin').domainId, 'event-operations');
  assert.throws(() => resolveReadSurface('GET', '/api/events/example/operations/unknown'), /UNREGISTERED_READ/);
  assert.throws(() => resolveReadSurface('POST', '/api/events/example/operations'), /UNREGISTERED_READ/);
});

test('path matching rejects malformed paths and never widens literal or segment boundaries', () => {
  for (const path of ['/api/notes/', '/api/notes/a/extra', '/api/notes//', '/api/notes/%2f', '/api/notes/%2e%2e', '/api/notes/%ZZ', 'https://other.test/api/notes/a', '//api/notes/a', '/api/notes/../a']) {
    assert.equal(matchTemplate('/api/notes/:id', path), false, path);
  }
  assert.equal(matchTemplate('/api/notes/:id', '/api/notes/n1?q=hello'), true);
  assert.equal(matchTemplate('/api/notes/:id', '/api/tasks/n1'), false);
});

test('the actual native consumers all have explicit versioned policies', async () => {
  const root = resolve(import.meta.dirname, '..');
  const extracted = await extractReadCalls(root);
  assert.ok(extracted.calls.some(row => row.endpointTemplate === '/api/notes' && row.method === 'GET'));
  assert.ok(extracted.calls.some(row => row.endpointTemplate.includes('/messages')));
  const actual = new Set(extracted.calls.map(row => `${row.consumerFile} ${row.method} ${row.endpointTemplate}`));
  for (const expected of [
    'src/screens/inbox/NotificationDetailScreen.tsx GET /api/inbox/notifications/:id',
    'src/screens/inbox/NotificationDetailScreen.tsx POST /api/inbox/notifications/:id/actions',
    'src/screens/settings/NotificationDeliverySettings.tsx GET /api/inbox/delivery/preferences',
    'src/screens/settings/NotificationDeliverySettings.tsx POST /api/inbox/delivery/preferences',
    'src/screens/settings/NotificationDiscoverySettings.tsx GET /api/inbox/discovery/preferences',
    'src/screens/settings/NotificationDiscoverySettings.tsx POST /api/inbox/discovery/preferences',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/relationship-communication/conversations/:id/read',
    'src/screens/inbox/RelationshipInboxScreen.tsx GET /api/chat/privacy',
    'src/screens/inbox/RelationshipInboxScreen.tsx PATCH /api/agent/signals/:id',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/notifications/:id/state',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/chat/privacy/analysis-toggle',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/chat/relationship-inbox',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/relationship-communication/conversations/:id/messages',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/relationship-signals/:id/confirm',
    'src/screens/inbox/useNotificationInbox.ts GET /api/inbox/notifications',
    'src/screens/inbox/useNotificationInbox.ts POST /api/inbox/notifications/read',
    'src/hooks/useRelationshipInboxBadgeCount.ts GET /api/inbox/notifications',
    'src/screens/tasks/TaskDetailScreen.tsx PATCH /api/tasks/:id',
    'src/screens/tasks/TaskDetailScreen.tsx DELETE /api/tasks/:id',
    'src/screens/tasks/TaskDetailScreen.tsx POST /api/reminders',
    'src/screens/tasks/TaskDetailScreen.tsx PATCH /api/reminders/:id',
  ]) assert.ok(actual.has(expected), expected);
  assert.deepEqual(await auditReadSurfaces(root), { unregistered: [], invalid: [] });
  assert.ok(surfaces.some(row => row.readPersistence === 'device_only' && row.mutationPolicy === 'local_only'));
  assert.ok(surfaces.every(row => row.mutationPolicy !== 'offline_queue'));
});

test('wrapper aliases, generic requests and computed client methods are audited independently', async t => {
  const root = await fixture(t, {
    'src/api/wrappers.ts': 'export const clientGet = (path: string) => client.get(path);',
    'src/screens/Aliased.ts': 'import { clientGet as load } from "../api/wrappers"; load("/api/alias-read");',
    'src/screens/Generic.ts': 'function request(method: "get" | "post", path: string) { return client[method](path); } request("post", "/api/generic-write");',
    'src/screens/Computed.ts': 'const method = enabled ? "get" : "patch"; client[method]("/api/computed");',
  });
  const result = await extractReadCalls(root);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.calls.map(row => [row.consumerFile, row.method, row.endpointTemplate]).sort(), [
    ['src/screens/Aliased.ts', 'GET', '/api/alias-read'],
    ['src/screens/Computed.ts', 'GET', '/api/computed'],
    ['src/screens/Computed.ts', 'PATCH', '/api/computed'],
    ['src/screens/Generic.ts', 'POST', '/api/generic-write'],
  ]);
});

test('destructured transport paths resolve from callers regardless of source line shifts', async t => {
  const root = await fixture(t, {
    'src/api/mobile-auth.ts': `${'// unrelated error handling\n'.repeat(180)}
      function postForSession({ path: requestPath }: { path: string }) { return fetchImpl(requestPath, { method: 'POST' }); }
      postForSession({ path: '/api/auth/mobile/credentials' });
      postForSession({ path: '/api/auth/mobile/google/exchange' });
    `,
  });
  const result = await extractReadCalls(root);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.calls.map(row => [row.method, row.endpointTemplate]).sort(), [
    ['POST', '/api/auth/mobile/credentials'], ['POST', '/api/auth/mobile/google/exchange'],
  ]);
});

test('one known destructured path cannot conceal an unknown caller of the same transport', async t => {
  const root = await fixture(t, {
    'src/api/mobile-auth.ts': `
      function postForSession({ path }: { path: string }) { return fetchImpl(path, { method: 'POST' }); }
      postForSession({ path: '/api/auth/mobile/credentials' });
      postForSession({ path: unknownPath() });
    `,
  });
  const result = await extractReadCalls(root);
  assert.ok(result.calls.some(row => row.endpointTemplate === '/api/auth/mobile/credentials'));
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_PATH')));
});

test('AST resolves section-indexed endpoint maps and nested returned request paths', async t => {
  const root = await fixture(t, {
    'src/screens/Dynamic.ts': `
      const paths: Record<'schedule' | 'tasks', string> = { schedule: '/api/schedule-items', tasks: '/api/tasks' };
      function load(section: 'schedule' | 'tasks') { return client.get(paths[section]); }
      function detail(id: string) { return { request: { path: \`/api/ai/runs/\${encodeURIComponent(id)}\` } }; }
      const request = detail('run1');
      client.get(request.request.path);
      load('schedule');
      load('tasks');
    `,
  });
  const extracted = await extractReadCalls(root);
  assert.deepEqual(extracted.invalid, []);
  assert.deepEqual([...new Set(extracted.calls.map(row => row.endpointTemplate))].sort(), ['/api/ai/runs/:id', '/api/schedule-items', '/api/tasks']);
});

test('a finite endpoint map cannot conceal an unknown key or an unknown mapped branch', async t => {
  const root = await fixture(t, {
    'src/screens/MixedMap.ts': `
      const paths = { known: '/api/notes', hidden: computeRemotePath() };
      client.get(paths.known);
      client.get(paths[chooseSection()]);
      const section: 'known' | 'hidden' = chooseSection();
      client.get(paths[section]);
    `,
  });
  const extracted = await extractReadCalls(root);
  assert.ok(extracted.calls.some(row => row.endpointTemplate === '/api/notes'));
  assert.ok(extracted.invalid.filter(row => row.includes('UNRESOLVED_PATH')).length >= 2);
});

test('computed clients and generic requests reject unresolved methods and paths', async t => {
  const root = await fixture(t, {
    'src/screens/Hidden.tsx': 'function request(method: "get", path: string) { return client[method](path); } function injected(get: (path: string) => unknown) { return get("/api/inbox/notifications"); } client[chooseMethod()]("/api/computed"); request("get", computeRemotePath()); injected(chooseTransport());',
  });
  const result = await auditReadSurfaces(root);
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_PATH')));
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_DELEGATE')));
});

test('a valid direct call cannot hide local delegates or injected transports', async t => {
  const root = await fixture(t, {
    'src/screens/Mixed.ts': `
      client.get('/api/notes');
      function mutate(method: 'patch', path: string) { return client[method](path); }
      function injected(get: (path: string) => unknown) { return get('/api/inbox/notifications'); }
      mutate('patch', '/api/tasks/t1');
      injected((path: string) => client.get(path));
    `,
  });
  const extracted = await extractReadCalls(root);
  assert.deepEqual(extracted.invalid, []);
  assert.deepEqual(extracted.calls.map(row => [row.method, row.endpointTemplate]).sort(), [
    ['GET', '/api/inbox/notifications'],
    ['GET', '/api/notes'],
    ['PATCH', '/api/tasks/t1'],
  ]);
  const audit = await auditReadSurfaces(root);
  assert.ok(audit.unregistered.some(row => row.includes('PATCH /api/tasks/t1')));
  assert.ok(audit.unregistered.some(row => row.includes('GET /api/inbox/notifications')));
});

test('one resolved helper invocation cannot mask another unresolved invocation', async t => {
  const root = await fixture(t, {
    'src/screens/Masked.ts': `
      function mutate(method: 'patch', path: string) { return client[method](path); }
      mutate('patch', '/api/tasks/t1');
      mutate(chooseMethod(), computeRemotePath());
      function injected(get: (path: string) => unknown) { return get('/api/inbox/notifications'); }
      injected((path: string) => client.get(path));
      injected(chooseTransport());
    `,
  });
  const extracted = await extractReadCalls(root);
  assert.ok(extracted.calls.some(row => row.method === 'PATCH' && row.endpointTemplate === '/api/tasks/t1'));
  assert.ok(extracted.calls.some(row => row.method === 'GET' && row.endpointTemplate === '/api/inbox/notifications'));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_PATH')));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_DELEGATE')));
});

test('one resolved function cannot mask an unresolved registered callback', async t => {
  const root = await fixture(t, {
    'src/screens/NestedMasked.ts': `
      function mutate(method: 'patch', path: string) { return client[method](path); }
      function injected(get: (path: string) => unknown) { return get('/api/inbox/notifications'); }
      function valid() {
        mutate('patch', '/api/tasks/t1');
        injected((path: string) => client.get(path));
      }
      function hiddenCallback() {
        mutate(chooseMethod(), computeRemotePath());
        injected(chooseTransport());
      }
      registerCallback(hiddenCallback);
      valid();
    `,
  });
  const extracted = await extractReadCalls(root);
  assert.ok(extracted.calls.some(row => row.method === 'PATCH' && row.endpointTemplate === '/api/tasks/t1'));
  assert.ok(extracted.calls.some(row => row.method === 'GET' && row.endpointTemplate === '/api/inbox/notifications'));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_PATH')));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_DELEGATE')));
});

test('one resolved function cannot mask an unresolved JSX event callback', async t => {
  const root = await fixture(t, {
    'src/screens/JsxMasked.tsx': `
      function mutate(method: 'patch', path: string) { return client[method](path); }
      function injected(get: (path: string) => unknown) { return get('/api/inbox/notifications'); }
      function valid() {
        mutate('patch', '/api/tasks/t1');
        injected((path: string) => client.get(path));
      }
      function Screen() {
        function hiddenCallback() {
          mutate(chooseMethod(), computeRemotePath());
          injected(chooseTransport());
        }
        return <Button onPress={hiddenCallback} />;
      }
      valid();
      Screen();
    `,
  });
  const extracted = await extractReadCalls(root);
  assert.ok(extracted.calls.some(row => row.method === 'PATCH' && row.endpointTemplate === '/api/tasks/t1'));
  assert.ok(extracted.calls.some(row => row.method === 'GET' && row.endpointTemplate === '/api/inbox/notifications'));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_PATH')));
  assert.ok(extracted.invalid.some(row => row.includes('UNRESOLVED_DELEGATE')));
});

test('reads and mutations on one endpoint remain separate registered surfaces', () => {
  const read = resolveReadSurface('GET', '/api/inbox/delivery/preferences');
  const mutation = resolveReadSurface('POST', '/api/inbox/delivery/preferences');
  assert.notEqual(read.selector, mutation.selector);
  assert.equal(read.domainId, 'notification-delivery');
  assert.equal(mutation.mutationPolicy, 'online_only');
  assert.equal(resolveReadSurface('GET', '/api/inbox/discovery/preferences').domainId, 'notification-discovery');
  assert.equal(resolveReadSurface('GET', '/api/chat/privacy?conversationId=c1').domainId, 'chat-privacy');
  assert.equal(resolveReadSurface('POST', '/api/notifications/n1/state').domainId, 'message-read-state');
  assert.equal(resolveReadSurface('POST', '/api/relationship-communication/conversations/c1/read').domainId, 'message-read-state');
});

async function fixture(t: test.TestContext, files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'orbit-read-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}

test('AST audit follows imported constants, aliases, templates, mutations and raw streams', async t => {
  const root = await fixture(t, {
    'src/api/paths.ts': 'export const paths = { notes: "/api/notes" }; export const detail = (id: string) => `${paths.notes}/${encodeURIComponent(id)}`;',
    'app/hidden.tsx': 'import { paths as p, detail as d } from "../src/api/paths"; client.get(p.notes); client.patch(d(id), {}); fetch("/api/new-private-domain"); fetch(`/api/raw/${encodeURIComponent(id)}`, { method: "POST" });',
  });
  const result = await extractReadCalls(root);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.calls.filter(row => row.consumerFile === 'app/hidden.tsx').map(row => [row.method, row.endpointTemplate]).sort(), [
    ['GET', '/api/new-private-domain'], ['GET', '/api/notes'], ['PATCH', '/api/notes/:id'], ['POST', '/api/raw/:id'],
  ]);
  const audit = await auditReadSurfaces(root);
  assert.ok(audit.unregistered.some(row => row.includes('/api/new-private-domain')));
  // A known endpoint in an unregistered consumer must also fail.
  assert.ok(audit.unregistered.some(row => row.includes('app/hidden.tsx') && row.includes('/api/notes')));
});

test('unresolved computed paths and dynamic HTTP methods fail the audit', async t => {
  const root = await fixture(t, { 'src/screens/Hidden.tsx': 'client.get(computeRemotePath()); fetch(remoteUrl, { method: chooseMethod() });' });
  const result = await auditReadSurfaces(root);
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_PATH')));
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
});

test('an empty source tree cannot pass coverage', async t => {
  const root = await fixture(t, {});
  assert.ok((await auditReadSurfaces(root)).invalid.includes('NO_READ_CONSUMERS'));
});

// Sprint 0089: computedPathFamilies is keyed by `file:line`, so an edit above a
// listed call site detaches its entry — and the audit then reported the endpoint
// as uncalled rather than the key as stale, which sends the reader to the wrong
// file. It cost two debugging sessions before the mechanism was understood.
test("a computedPathFamilies entry that nothing consults is named as stale", async () => {
  const root = await mkdtemp(join(tmpdir(), "orbit-stale-key-"));
  try {
    await mkdir(join(root, "src/screens/demo"), { recursive: true });
    // A consumer whose path resolves on its own, so no fallback is consulted.
    await writeFile(
      join(root, "src/screens/demo/DemoScreen.tsx"),
      `import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
export function DemoScreen() {
  const client = useOrbitApiClient();
  return client.get<unknown>("/api/demo");
}
`,
    );
    const result = await auditReadSurfaces(root);
    const stale = result.invalid.filter((row) => row.startsWith("STALE_COMPUTED_PATH_KEY"));
    for (const row of stale) {
      assert.match(row, /either the call moved to another line, or its path now resolves on its own/u,
        "the message must name both causes, because the reader cannot tell them apart from the key alone");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
