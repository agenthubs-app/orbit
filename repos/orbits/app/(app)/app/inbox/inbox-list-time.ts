import {notificationLocalDay} from '../../../../shared/compute/inbox-notification-day';

/** b5 D05 list time: today → 9:30, yesterday → 昨日, earlier → 10/5 (mail-client convention). */
export function inboxListTime(at:string,now:string,zone:string,language:string,yesterday:string):string{
 const day=notificationLocalDay(at,zone),today=notificationLocalDay(now,zone);
 if(day===today)return new Intl.DateTimeFormat(language,{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(at));
 const gap=Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000);
 if(gap===1)return yesterday;
 return new Intl.DateTimeFormat(language,{timeZone:zone,month:'numeric',day:'numeric'}).format(new Date(at));
}
