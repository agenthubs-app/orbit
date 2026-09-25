import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelationshipInboxTrigger } from '../../app/(app)/app/inbox/relationship-inbox-panel';
import * as inbox from '../../app/(app)/app/inbox/inbox-panel-view-model';
const at = '2026-09-16T00:00:00Z';
const conversation = { conversationId: 'c', contactId: 'contact', participantAccountIds: ['a', 'b'], participantDisplayNames: { a: '我', b: '佐藤健一' }, qualificationVersion: 'q', status: 'active', createdAt: at, updatedAt: at, unreadCount: 1, messages: [{ messageId: 'm', conversationId: 'c', senderAccountId: 'b', senderDisplayName: '佐藤健一', body: '资料收到了，谢谢。', sentAt: at, deliveryState: 'delivered' }] };

test('outer inbox indicates unread without combining message and notification counts', () => {
  const html = renderToStaticMarkup(<RelationshipInboxTrigger unreadCount={9} />);
  assert.doesNotMatch(html, />9<\/span>/);
  assert.match(html, /data-inbox-unread="true"/);
  assert.doesNotMatch(renderToStaticMarkup(<RelationshipInboxTrigger unreadCount={0} />), /data-inbox-unread="true"/);
});

test('real conversation projection preserves remote name, original body and delivery identity', () => {
  const project = (inbox as any).toContactMessageInbox;
  assert.equal(typeof project, 'function', 'Web must consume the real communication DTO');
  const view = project({ conversations: [conversation], refreshedAt: at }, 'a');
  assert.equal(view[0].name, '佐藤健一'); assert.equal(view[0].preview, '资料收到了，谢谢。');
  assert.equal(view[0].unreadCount, 1); assert.equal(view[0].conversation.conversationId, 'c');
  assert.throws(() => project({ conversations: [conversation], refreshedAt: at }, 'outsider'));
  assert.throws(() => project({ conversations: [{ ...conversation, participantDisplayNames: {} }], refreshedAt: at }, 'a'));
});

test('a failed real send keeps the reply and retries with one delivery identity', async () => {
  const React = await import('react');
  const { create, act } = await import('react-test-renderer');
  const { ContactMessagesTab } = await import('../../app/(app)/app/inbox/contact-messages-tab');
  const oldFetch = globalThis.fetch;
  const oldDocument = (globalThis as any).document;
  (globalThis as any).document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  let sent = false; const requests: any[] = [];
  globalThis.fetch = (async (url, init) => {
    if (String(url) === '/api/account/me') return Response.json({ success: true, data: { account: { id: 'a' } } });
    if (String(url).endsWith('/messages')) {
      const body = JSON.parse(String(init?.body)); requests.push(body);
      if (requests.length === 1) return Response.json({ success: false }, { status: 503 });
      sent = true;
      return Response.json({ success: true, data: { conversationId: 'c', deliveryState: 'delivered', message: { ...conversation.messages[0], senderAccountId: 'a', body: body.body } } });
    }
    return Response.json({ success: true, data: { conversations: [{ ...conversation, unreadCount: 0, messages: sent ? [...conversation.messages, { ...conversation.messages[0], messageId: 'm-two', senderAccountId: 'a', senderDisplayName: '我', body: '今天发给你。' }] : conversation.messages }], refreshedAt: at } });
  }) as typeof fetch;
  let renderer: any;
  try {
    await act(async () => { renderer = create(React.createElement(ContactMessagesTab, { actorId: 'a', onIdentityChanged() {} })); });
    await act(async () => { renderer.root.findAllByType('button')[0].props.onClick(); });
    await act(async () => { renderer.root.findByType('textarea').props.onChange({ target: { value: '今天发给你。' } }); });
    const send = () => renderer.root.findAllByType('button').find((b: any) => b.children.includes('发送') || b.children.includes('重试发送'));
    await act(async () => { await send().props.onClick(); });
    assert.equal(renderer.root.findByType('textarea').props.value, '今天发给你。');
    assert.ok(renderer.root.findAllByProps({ role: 'alert' }).length > 0);
    await act(async () => { await send().props.onClick(); });
    assert.equal(requests.length, 2); assert.equal(requests[0].requestId, requests[1].requestId);
    assert.equal(renderer.root.findByType('textarea').props.value, '');
    assert.ok(JSON.stringify(renderer.toJSON()).includes('今天发给你。'));
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.fetch = oldFetch; (globalThis as any).document = oldDocument;
  }
});

test('refreshing an open thread retries an interrupted read cursor request', async () => {
  const React = await import('react');
  const { create, act } = await import('react-test-renderer');
  const { ContactMessagesTab } = await import('../../app/(app)/app/inbox/contact-messages-tab');
  const oldFetch = globalThis.fetch, oldDocument = (globalThis as any).document;
  const refreshListeners = new Set<() => unknown>();
  const refresh = async () => { for (const listener of [...refreshListeners]) await listener(); };
  let reads = 0;
  (globalThis as any).document = { visibilityState: 'visible', addEventListener(_event: string, listener: () => unknown) { refreshListeners.add(listener); }, removeEventListener(_event: string, listener: () => unknown) { refreshListeners.delete(listener); } };
  globalThis.fetch = (async (url, init) => {
    if (String(url) === '/api/account/me') return Response.json({ success: true, data: { account: { id: 'a' } } });
    if (String(url).endsWith('/read')) {
      reads++;
      if (reads === 1) return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      return Response.json({ success: true, data: { conversationId: 'c', lastReadMessageId: 'm', readAt: at } });
    }
    return Response.json({ success: true, data: { conversations: [{ ...conversation, unreadCount: reads >= 2 ? 0 : 1 }], refreshedAt: at } });
  }) as typeof fetch;
  let renderer: any;
  try {
    await act(async () => { renderer = create(React.createElement(ContactMessagesTab, { actorId: 'a', onIdentityChanged() {} })); });
    await act(async () => { renderer.root.findAllByType('button')[0].props.onClick(); });
    assert.equal(reads, 1);
    await act(async () => { await refresh?.(); });
    assert.equal(reads, 2, 'a canceled request must not permanently suppress the read cursor');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.fetch = oldFetch; (globalThis as any).document = oldDocument;
  }
});

test('inbox counts remain separate when notifications are read or temporarily unavailable', async () => {
  const panel = await import('../../app/(app)/app/inbox/relationship-inbox-panel');
  const counts = (panel as any).readInboxUnreadCounts;
  assert.equal(typeof counts, 'function');
  const previous = globalThis.fetch;
  globalThis.fetch = (async url => {
    if (String(url) === '/api/inbox/summary') return Response.json({ success: false }, { status: 404 });
    if (String(url) === '/api/account/me') return Response.json({ success: true, data: { account: { id: 'a' } } });
    if (String(url).startsWith('/api/relationship-communication')) return Response.json({ success: true, data: { conversations: [conversation], refreshedAt: at, unreadTotal: 7 } });
    return Response.json({ success: false }, { status: 503 });
  }) as typeof fetch;
  try { assert.deepEqual(await counts('zh', 'a'), { threads: 7, alerts: 0 }); }
  finally { globalThis.fetch = previous; }
});
