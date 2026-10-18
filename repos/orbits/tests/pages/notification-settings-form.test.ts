import test from 'node:test';
import assert from 'node:assert/strict';
import {quietHoursPatch} from '../../app/(app)/app/settings/notifications/model';

test('Web quiet-hours form sends a complete valid interval',()=>{
 assert.deepEqual(quietHoursPatch('23:00','07:30'),{quietStart:'23:00',quietEnd:'07:30'});
 assert.equal(quietHoursPatch('23:00','23:00'),null);
 assert.equal(quietHoursPatch('23:61','07:30'),null);
});
