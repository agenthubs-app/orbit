import test from 'node:test';
import assert from 'node:assert/strict';
import {quietHoursPatch} from '../src/screens/settings/notifications/model';

test('quiet-hours form sends one valid interval and never sends equal or malformed endpoints',()=>{
 assert.deepEqual(quietHoursPatch('23:00','07:30'),{quietStart:'23:00',quietEnd:'07:30'});
 assert.equal(quietHoursPatch('22:00','22:00'),null);
 assert.equal(quietHoursPatch('25:00','07:30'),null);
 assert.equal(quietHoursPatch('22:00','7:30'),null);
});
