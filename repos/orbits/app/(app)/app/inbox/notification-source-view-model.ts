import type {InboxNotificationDTO} from '../../../../shared/contract/inbox-notifications';
export function notificationWebSourceHref(n:InboxNotificationDTO):string|null {
 if(n.target.status!=='available'||!n.target.href)return null;
 if(n.sources.some(s=>s.objectId==='discovery'))return '/app/inbox/sources/'+encodeURIComponent(n.id);
 if(!n.target.href.startsWith('/')||n.target.href.startsWith('//')||/[\\\u0000-\u001f]/.test(n.target.href))return null;
 if(new URL(n.target.href,'https://orbit.local').origin!=='https://orbit.local')return null;
 return n.target.href.startsWith('/app/')?n.target.href:'/app'+n.target.href;
}
export function verifiedSourceNote(raw:unknown,n:InboxNotificationDTO):{title:string;body:string} {
 const note=(raw as {note?:Record<string,unknown>})?.note,source=n.sources[0];
 if(!note||source?.sourceKind!=='note'||note.id!==source.sourceId||note.ownerUserId!==n.actorId||note.accountId!==n.actorId||String(note.version)!==source.sourceRevision||typeof note.title!=='string'||typeof note.body!=='string')throw new Error('Source changed or unavailable');
 return note as {title:string;body:string};
}
/** Next hands `/app/inbox/sources/[id]` the still-encoded segment (`inbox%3A…`): decode exactly once, like `/app/tasks/[id]`. Malformed input is kept for the API's 404; empty and dot segments would escape the detail path, so they are rejected. */
export function notificationIdFromRouteParam(raw:string):string|null {
 let id=raw;try{id=decodeURIComponent(raw);}catch{/* keep malformed input */}
 return id===''||id==='.'||id==='..'?null:id;
}
export function notificationDetailPath(id:string):string {return '/api/inbox/notifications/'+encodeURIComponent(id);}
