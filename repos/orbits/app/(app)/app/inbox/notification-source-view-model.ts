import type {InboxNotificationDTO} from '../../../../shared/contract/inbox-notifications';
export function notificationWebSourceHref(n:InboxNotificationDTO):string|null {
 if(n.target.status!=='available'||!n.target.href)return null;
 return n.sources.some(s=>s.objectId==='discovery')?'/app/inbox/sources/'+encodeURIComponent(n.id):'/app'+n.target.href;
}
export function verifiedSourceNote(raw:unknown,n:InboxNotificationDTO):{title:string;body:string} {
 const note=(raw as {note?:Record<string,unknown>})?.note,source=n.sources[0];
 if(!note||source?.sourceKind!=='note'||note.id!==source.sourceId||note.ownerUserId!==n.actorId||note.accountId!==n.actorId||String(note.version)!==source.sourceRevision||typeof note.title!=='string'||typeof note.body!=='string')throw new Error('Source changed or unavailable');
 return note as {title:string;body:string};
}
