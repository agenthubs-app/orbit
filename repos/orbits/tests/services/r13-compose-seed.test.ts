import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeInboxComposeSeed } from '../../app/(app)/app/inbox/inbox-compose-seed';

test('compose seed keeps only bounded text fields and never carries send instructions', () => {
  const clean = sanitizeInboxComposeSeed({ contactId: 'contact:one', recipient: 'Avery', subject: 'Follow up', body: 'Draft', autoSend: true, accountId: 'other' });
  assert.deepEqual(clean, { contactId: 'contact:one', recipient: 'Avery', subject: 'Follow up', body: 'Draft' });
  assert.equal(sanitizeInboxComposeSeed({ contactId: '../other', body: 'x' })?.contactId, undefined);
  assert.equal(sanitizeInboxComposeSeed({ subject: 'x'.repeat(501) }), null);
});
