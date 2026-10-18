import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMessageConversations } from '../src/view-models/message-search';
import type { RelationshipConversationView } from '../src/view-models/relationship-inbox';

test('message search filters the existing authorized list by name, subject and preview', () => {
  const rows = [
    { id: 'one', name: '高橋 美咲', organization: 'Orbit', subject: '月次資料', preview: '資料を送ります' },
    { id: 'two', name: '佐藤 葵', organization: 'Acme', subject: '日程', preview: '来週にしましょう' },
  ] as RelationshipConversationView[];
  assert.deepEqual(filterMessageConversations(rows, '資料').map(row => row.id), ['one']);
  assert.deepEqual(filterMessageConversations(rows, 'ACME').map(row => row.id), ['two']);
  assert.deepEqual(filterMessageConversations(rows, '').map(row => row.id), ['one', 'two']);
});
