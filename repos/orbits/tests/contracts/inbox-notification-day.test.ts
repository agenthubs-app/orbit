import assert from 'node:assert/strict';
import test from 'node:test';
import {notificationLocalDay,notificationDisplayZone} from '../../shared/compute/inbox-notification-day';

test('notification day grouping follows the account zone across its midnight',()=>{
 const before='2026-10-19T06:30:00Z',after='2026-10-19T07:30:00Z';
 assert.equal(notificationLocalDay(before,'America/Los_Angeles'),'2026-10-18');
 assert.equal(notificationLocalDay(after,'America/Los_Angeles'),'2026-10-19');
 assert.equal(notificationLocalDay(before,'Asia/Tokyo'),notificationLocalDay(after,'Asia/Tokyo'));
 assert.equal(notificationDisplayZone(undefined),'Asia/Tokyo');
 assert.equal(notificationDisplayZone('Invalid/Zone'),'Asia/Tokyo');
});
