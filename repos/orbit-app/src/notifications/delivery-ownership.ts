import type {OrbitApiClient} from '../api/client';
import {inboxDeliveryOwnerSchema} from '../api/schema/notification-delivery-policy';
import type {LocalNotificationAdapter} from './notification-sync';
import {notificationPermissionFromNative} from './notification-model';
const endpoint='/api/inbox/delivery/owner';
// Run inside the existing native reminder operation queue. Never enqueue a
// second cancellation from here: acknowledgement must follow this cancellation.
export async function handoffLocalDelivery(input:{client:OrbitApiClient;adapter:LocalNotificationAdapter;deviceId:string;isCurrent:()=>boolean}){
 const response=await input.client.get(endpoint+'?deviceId='+encodeURIComponent(input.deviceId));
 if(!input.isCurrent())return null;
 if(!response.success){if(response.status===404)return 'legacy' as const;throw Error('Delivery ownership unavailable');}
 const parsed=inboxDeliveryOwnerSchema.safeParse(response.data);if(!parsed.success||parsed.data.deviceId!==input.deviceId)throw Error('Invalid delivery ownership');
 const owner=parsed.data;if(!owner.cutover)return 'legacy' as const;
 const scheduled=await input.adapter.getAllScheduledNotificationsAsync();let cancelled=0;
 for(const item of scheduled){if(!input.isCurrent())return null;if(typeof item.content.data?.orbitReminderPlanId==='string'){await input.adapter.cancelScheduledNotificationAsync(item.identifier);cancelled++;}}
 if(!input.isCurrent())return null;
 const ack=await input.client.post(endpoint,{body:{deviceId:input.deviceId,generation:owner.generation,localCancelled:true}});if(!input.isCurrent())return null;
 const next=ack.success?inboxDeliveryOwnerSchema.safeParse(ack.data):null;
 if(!next?.success||next.data.actorId!==owner.actorId||next.data.deviceId!==input.deviceId||next.data.generation!==owner.generation||next.data.owner!=='server')throw Error('Delivery ownership acknowledgement failed');
 return {cancelled,scheduled:0,permission:notificationPermissionFromNative(await input.adapter.getPermissionsAsync())};
}
