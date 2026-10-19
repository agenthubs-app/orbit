import assert from 'node:assert/strict';
import test from 'node:test';
import { demoSecretaryNotifications } from '../../shared/mock/demo-world/fixtures';
import { parseSecretaryPreviewForActor, secretaryPreviewSchema } from '../../shared/api-schema/secretary-preview';
import { buildSecretaryPreview } from '../../shared/compute/secretary-source';

const now = '2026-10-07T08:00:00+09:00';
const base = demoSecretaryNotifications[0]!;
const make = (id: string, kind: 'event_deadline' | 'event_prep' | 'event_pick', eventId: string, occurredAt = now) => ({
  ...base, id, actorId: 'actor', occurredAt, semanticKey: `test:${id}`,
  sources: [{ ...base.sources[0]!, sourceKind: kind, sourceId: eventId, objectId: eventId }],
  target: { ...base.target, id: eventId, status: 'available' as const },
});

test('secretary preview keeps an older valid card behind ordinary notifications and deduplicates an event', () => {
  const pick = make('pick', 'event_pick', 'event-1', '2026-10-06T08:00:00+09:00');
  const daily = { ...make('daily', 'event_pick', 'event-1'), semanticKey: 'secretary-daily:actor:2026-10-07' };
  const ordinary = Array.from({ length: 60 }, (_, n) => ({ ...make(`ordinary-${n}`, 'event_pick', `other-${n}`), sources: [{ ...base.sources[0]!, sourceKind: 'task' as const }] }));
  const result = buildSecretaryPreview('actor', [...ordinary, daily, pick].map(notification => ({ notification, sourceState: 'available' as const })), now);
  assert.deepEqual(result.items.map(item => [item.eventId, item.kind, item.notification.id]), [['event-1', 'event_pick', 'pick']]);
  assert.equal(result.hasMore, false);
});

test('preview excludes unavailable, expired and mail sources, and response drops unknown entries', () => {
  const good = make('good', 'event_deadline', 'event-1');
  const mixed = { ...make('mixed', 'event_prep', 'event-4'), sources: [...make('mixed', 'event_prep', 'event-4').sources, { ...base.sources[0]!, sourceKind: 'mail_summary' as const }] };
  const result = buildSecretaryPreview('actor', [
    { notification: good, sourceState: 'available' },
    { notification: mixed, sourceState: 'available' },
    { notification: make('gone', 'event_prep', 'event-2'), sourceState: 'unavailable' },
    { notification: { ...make('expired', 'event_pick', 'event-3'), expiresAt: '2026-10-06T00:00:00Z' }, sourceState: 'available' },
  ], now);
  assert.deepEqual(result.items.map(item => item.notification.id), ['good']);
  assert.equal(demoSecretaryNotifications.some(item => item.sources.some(source => source.sourceKind === 'mail_summary')), false);
  const parsed = secretaryPreviewSchema.parse({ ...result, extra: 'discard', items: [...result.items, { ...result.items[0], kind: 'future' }] });
  assert.equal(parsed.items.length, 1);
  assert.equal('extra' in parsed, false);
});

test('response rejects a different actor and caps after deduplication', () => {
  const rows = Array.from({ length: 5 }, (_, n) => ({ notification: make(`n${n}`, 'event_prep', `e${n}`, `2026-10-07T0${n}:00:00+09:00`), sourceState: 'available' as const }));
  const result = buildSecretaryPreview('actor', rows, now);
  assert.deepEqual(result.items.map(item => item.eventId), ['e4', 'e3', 'e2']);
  assert.equal(result.hasMore, true);
  assert.throws(() => secretaryPreviewSchema.parse({ ...result, actorId: '' }));
});

test('a foreign owner in an unknown preview card rejects the raw page', () => {
  const result = buildSecretaryPreview('actor', [{ notification: make('good', 'event_pick', 'event-1'), sourceState: 'available' }], now);
  const foreignUnknown = { ...result.items[0]!, kind: 'future', notification: { ...result.items[0]!.notification, actorId: 'other-actor' } };
  assert.throws(() => parseSecretaryPreviewForActor({ ...result, items: [...result.items, foreignUnknown] }, 'actor'), /owner mismatch/i);
});
