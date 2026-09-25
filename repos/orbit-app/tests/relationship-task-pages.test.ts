import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeRelationshipTaskPage} from '../src/view-models/relationship-task-pages';
const item={itemKey:'row',taskId:'task',connectionId:'connection',contactId:'contact',contactNamePreview:'Name',titlePreview:'Title',status:'open',dueAt:null};
const page={actorId:'owner',mode:'open' as const,items:[item],total:1,hasMore:false,nextCursor:null,asOf:'2026-09-25T00:00:00.000Z'};
test('task pages validate ownership, mode, status and cursor before display',()=>{
  assert.deepEqual(decodeRelationshipTaskPage(page,'owner','open'),page);
  assert.equal(decodeRelationshipTaskPage(page,'other','open'),null);
  assert.equal(decodeRelationshipTaskPage(page,'owner','completed'),null);
  for(const patch of [{hasMore:true},{nextCursor:'cursor'},{items:[item,item]}, {items:[{...item,status:'completed'}]}, {total:0}]){
    assert.equal(decodeRelationshipTaskPage({...page,...patch},'owner','open'),null);
  }
  // Canonical source can have two identical business IDs in distinct records.
  assert.ok(decodeRelationshipTaskPage({...page,total:2,items:[item,{...item,itemKey:'row2'}]},'owner','open'));
});
