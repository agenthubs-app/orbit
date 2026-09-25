import {relationshipTaskPageSchema} from '../api/schema/relationship-lifecycle';
import type {RelationshipTaskPageDTO} from '../api/contract/relationship-lifecycle';

export function decodeRelationshipTaskPage(value:unknown,actorId:string,mode:'open'|'completed'):RelationshipTaskPageDTO|null {
  const parsed=relationshipTaskPageSchema.safeParse(value);
  if(!parsed.success||parsed.data.actorId!==actorId||parsed.data.mode!==mode)return null;
  const page=parsed.data,keys=new Set<string>();
  if(page.hasMore!==Boolean(page.nextCursor)||(page.hasMore&&!page.items.length)||page.total<page.items.length)return null;
  for(const item of page.items){
    if(keys.has(item.itemKey)||(mode==='open'?!['open','scheduled'].includes(item.status):!['completed','dismissed'].includes(item.status)))return null;
    keys.add(item.itemKey);
  }
  return page;
}
