import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureTypedDeliveryCutover } from '../../features/notifications/delivery-pass';

function repository(initial: Record<string, unknown> | null) {
  let value = initial;
  let saves = 0;
  return {
    api: {
      cutover: async () => value as never,
      get: async () => value as never,
      save: async (_database: unknown, _collection: string, _recordId: string, _actorId: string, next: unknown) => {
        value = next as Record<string, unknown>;
        saves += 1;
      },
      tx: async (_actorId: string, operation: (database: Record<string, never>) => Promise<unknown>) => operation({}),
    },
    get saves() {
      return saves;
    },
  };
}

test('new delivery actors enter the typed path without legacy source scans', async () => {
  const fake = repository(null);
  const result = await ensureTypedDeliveryCutover({
    actorId: 'actor-new',
    now: '2026-09-26T03:13:04.000Z',
    repository: fake.api as never,
  });
  assert.deepEqual(result, {
    batchId: 'typed-default',
    enabled: true,
    generation: 1,
    legacyBlocked: true,
    since: '2026-09-26T03:13:04.000Z',
  });
  assert.equal(fake.saves, 1);
});

test('an existing cutover or rollback fence is never overwritten', async () => {
  const existing = {
    batchId: 'rollback-1',
    enabled: false,
    generation: 2,
    legacyBlocked: true,
    since: '2026-09-26T03:00:00.000Z',
  };
  const fake = repository(existing);
  assert.equal(await ensureTypedDeliveryCutover({
    actorId: 'actor-existing',
    now: '2026-09-26T03:13:04.000Z',
    repository: fake.api as never,
  }), existing);
  assert.equal(fake.saves, 0);
});
