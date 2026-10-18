import assert from 'node:assert/strict';
import test from 'node:test';
import {changeNotificationOptIn,effectiveNotificationOptIn} from '../../src/screens/settings/notifications/notification-permission-control';

test('a stored opt-in does not display as active after OS permission is revoked',()=>{
 assert.equal(effectiveNotificationOptIn(true,'denied'),false);
 assert.equal(effectiveNotificationOptIn(true,'undetermined'),false);
 assert.equal(effectiveNotificationOptIn(true,'granted'),true);
});

test('opt-in requests an undetermined OS permission before enabling registration',async()=>{
 const calls:string[]=[];
 const result=await changeNotificationOptIn(true,{
  getPermission:async()=>{calls.push('get');return 'undetermined';},
  requestPermission:async()=>{calls.push('request');return 'granted';},
  setOptIn:async value=>{calls.push('set:'+value);},
  revoke:async()=>{calls.push('revoke');return true;},
 });
 assert.equal(result,'enabled');assert.deepEqual(calls,['get','request','set:true']);
});

test('denied OS permission never claims push is enabled',async()=>{
 const calls:string[]=[];
 const result=await changeNotificationOptIn(true,{
  getPermission:async()=> 'denied',requestPermission:async()=>{calls.push('request');return 'granted';},
  setOptIn:async()=>{calls.push('set');},revoke:async()=>true,
 });
 assert.equal(result,'denied');assert.deepEqual(calls,[]);
});

test('turning push off revokes the device after disabling registration, even if revocation fails',async()=>{
 const calls:string[]=[];let fail=true;
 const adapter={
  getPermission:async():Promise<'granted'>=> 'granted',requestPermission:async():Promise<'granted'>=> 'granted',
  setOptIn:async (value:boolean)=>{calls.push('set:'+value);},
  revoke:async()=>{calls.push('revoke');if(fail){fail=false;return false;}return true;},
 } as const;
 const result=await changeNotificationOptIn(false,adapter);
 assert.equal(result,'revoke-failed');assert.deepEqual(calls,['set:false','revoke']);
 assert.equal(await changeNotificationOptIn(false,adapter),'disabled');
 assert.deepEqual(calls,['set:false','revoke','set:false','revoke']);
});
