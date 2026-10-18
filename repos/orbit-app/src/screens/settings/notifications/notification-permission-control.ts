type PermissionStatus='granted'|'denied'|'undetermined';

export async function changeNotificationOptIn(enabled:boolean,adapter:{
 getPermission:()=>Promise<PermissionStatus>;
 requestPermission:()=>Promise<PermissionStatus>;
 setOptIn:(enabled:boolean)=>Promise<void>;
 revoke:()=>Promise<boolean>;
}):Promise<'enabled'|'disabled'|'denied'|'revoke-failed'> {
 if(!enabled){
  await adapter.setOptIn(false);
  return await adapter.revoke()?'disabled':'revoke-failed';
 }
 let permission=await adapter.getPermission();
 if(permission==='undetermined')permission=await adapter.requestPermission();
 if(permission!=='granted')return 'denied';
 await adapter.setOptIn(true);
 return 'enabled';
}
