import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryPreferencesHandler} from '../../app/api/inbox/discovery/preferences/handler';
test('discovery preferences derive actor from authentication and reject client identity or invalid time zones',async()=>{
 const anonymous=createDiscoveryPreferencesHandler({resolveActor:async()=>null});assert.equal((await anonymous(new Request('http://localhost/api/inbox/discovery/preferences'))).status,401);
 const handler=createDiscoveryPreferencesHandler({resolveActor:async()=>({id:'a'}),enabled:()=>true,runtime:()=>({workspaceId:'w',client:{} as never})});
 for(const data of [{expectedRevision:0,actorId:'b',enabled:true},{expectedRevision:0,timeZone:'not/a/timezone'}]){const r=await handler(new Request('http://localhost/api/inbox/discovery/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}));assert.equal(r.status,400);}
});
