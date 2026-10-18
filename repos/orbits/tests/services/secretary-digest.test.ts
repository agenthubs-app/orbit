import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDailyRecommendation, dailyRecommendationNotification, writeDailySlot, clearDailySlot, runSecretaryDigest } from '../../features/notifications/secretary/digest';
import type { EventDiscoverRow } from '../../shared/contract/event-discover';
import type { InboxRecordRepository, InboxStoredRecord } from '../../features/notifications/storage/inbox-record-repository';
import {createJourneyService, type JourneyRecords} from '../../features/events/journey/service';
import type {JourneyEvent, JourneyLivePorts} from '../../features/events/journey/ports';

const row = (eventId: string, score: number): EventDiscoverRow => ({ eventId, title: eventId, startsAt: '2026-10-21T10:00:00Z', emoji: '📅', href: `/events/${eventId}`, score, verdict: 'recommend', reason: '目標に合っています' });

test('daily Top-1 uses score then eventId, replaces dismissed candidate, and leaves no candidate empty', () => {
  const candidates = [row('b', 84), row('a', 84), row('c', 72)];
  assert.equal(selectDailyRecommendation(candidates, new Set(), new Set())?.eventId, 'a');
  assert.equal(selectDailyRecommendation(candidates, new Set(['a']), new Set())?.eventId, 'b');
  assert.equal(selectDailyRecommendation(candidates, new Set(['a']), new Set(['b']))?.eventId, 'c');
  assert.equal(selectDailyRecommendation(candidates, new Set(['a', 'b', 'c']), new Set()), null);
});

test('live secretary source judges beyond the first 40 and selects the global score winner', async () => {
  const events: JourneyEvent[] = Array.from({length: 41}, (_, index) => ({
    agenda: [], badges: [], capacity: 100, description: null, emoji: '🎟️', endsAt: null,
    eventId: `e${String(index).padStart(2,'0')}`, organizerKey: `org${index}`, organizerName: null,
    priceYen: 0, publicCode: null, registrationClosesAt: null, registrationCount: 0, review: false,
    startsAt: '2026-10-21T10:00:00Z', title: `Event ${index}`, venue: 'Tokyo',
  }));
  const judgedBatches: string[][] = [];
  const ports = {
    catalogue: async () => events,
    myEvents: async () => [],
    judge: async (_actor: string, ids: readonly string[]) => {
      judgedBatches.push([...ids]);
      assert.ok(ids.length <= 40);
      return {hasPlan:true,goal:'goal',results:Object.fromEntries(ids.map(id => [id,{score:id==='e40'?99:80,verdict:'recommend'}]))};
    },
  } as unknown as JourneyLivePorts;
  const records = {feedback:{entries:async()=>[]},follows:{followed:async()=>new Set<string>()}} as unknown as JourneyRecords;
  const journey = createJourneyService({ports,records,now:()=>new Date('2026-10-19T00:00:00Z')});
  const rows = await journey.dailyCandidates('actor','ja');
  assert.equal(rows.length,41);
  assert.equal(selectDailyRecommendation(rows,new Set(),new Set())?.eventId,'e40');
  assert.deepEqual(judgedBatches.map(batch=>batch.length),[40,1]);
});

test('daily recommendation uses a single Tokyo-day semantic slot distinct from R26', () => {
  const a = dailyRecommendationNotification('actor', row('a', 84), '2026-10-19', '2026-10-19T00:00:00Z');
  const b = dailyRecommendationNotification('actor', row('b', 70), '2026-10-19', '2026-10-19T00:00:00Z');
  assert.equal(a.semanticKey, b.semanticKey);
  assert.equal(a.sources[0]?.sourceKind, 'event_pick');
  assert.equal(a.sources[0]?.sourceRevision, 'daily:2026-10-19');
  assert.notEqual(a.semanticKey, 'event-pick:assessment:signature');
  assert.equal(a.target.id, 'a');
  assert.equal(a.actions.includes('snooze'), false);
});

test('the daily slot is idempotent, preserves read state on replay and replaces a dismissed event in one row', async () => {
  const rows = new Map<string, InboxStoredRecord>();
  const repository: InboxRecordRepository = {
    async transaction(actorId, operation) {
      return operation({ executor: undefined,
        get: async id => rows.get(`${actorId}:${id}`) ?? null,
        save: async value => { rows.set(`${actorId}:${value.notification.id}`, value); },
      });
    },
    page: async () => [],
  };
  const at = '2026-10-19T00:00:00Z';
  const first = await writeDailySlot(repository, 'actor', row('a', 84), '2026-10-19', at);
  const stored = rows.get(`actor:${first.id}`)!;
  stored.notification.readAt = at;
  assert.equal((await writeDailySlot(repository, 'actor', row('a', 84), '2026-10-19', at)).readAt, at);
  const replacement = await writeDailySlot(repository, 'actor', row('b', 70), '2026-10-19', at);
  assert.equal(replacement.id, first.id);
  assert.equal(replacement.target.id, 'b');
  assert.equal(replacement.readAt, null);
  assert.equal(replacement.revision, first.revision + 1);
  assert.equal(rows.size, 1);
});

test('an empty recommendation set archives an earlier daily slot without recreating it', async () => {
  const rows = new Map<string, InboxStoredRecord>();
  const repository: InboxRecordRepository = {
    async transaction(actorId, operation) {
      return operation({ executor: undefined,
        get: async id => rows.get(`${actorId}:${id}`) ?? null,
        save: async value => { rows.set(`${actorId}:${value.notification.id}`, value); },
      });
    }, page: async () => [],
  };
  const at = '2026-10-19T00:00:00Z';
  const first = await writeDailySlot(repository, 'actor', row('a', 84), '2026-10-19', at);
  assert.equal(await clearDailySlot(repository, 'actor', '2026-10-19', at), true);
  assert.equal(rows.get(`actor:${first.id}`)?.notification.disposition, 'archived');
  assert.equal(rows.size, 1);
  assert.equal(await clearDailySlot(repository, 'actor', '2026-10-19', at), false);
});

test('bounded digest pages actors and never writes for an empty recommendation', async () => {
  const written: string[] = [];
  const result = await runSecretaryDigest({
    actors: async (after, limit) => { assert.equal(after, ''); assert.equal(limit, 2); return ['a', 'b']; },
    recommendations: async actor => actor === 'a' ? [row('e1', 90)] : [],
    write: async (actor, winner, date) => { written.push(`${actor}:${winner.eventId}:${date}`); },
    clear: async () => false,
    at: new Date('2026-10-18T16:00:00Z'), after: '', limit: 2,
  });
  assert.deepEqual(result, { examined: 2, written: 1, cleared: 0, nextCursor: 'b' });
  assert.deepEqual(written, ['a:e1:2026-10-19']);
});
