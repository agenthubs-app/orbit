import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxAppTargetHref } from '../src/view-models/inbox-target';

test('a Web assessment target opens the matching App page while external URLs stay unavailable', () => {
  assert.equal(inboxAppTargetHref('/app/events/assessments/a'), '/events/assessments/a');
  assert.equal(inboxAppTargetHref('/events/e/prep'), '/events/e/prep');
  assert.equal(inboxAppTargetHref('//elsewhere.test/path'), null);
  assert.equal(inboxAppTargetHref('https://elsewhere.test/path'), null);
});
