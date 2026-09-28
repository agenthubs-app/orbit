import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { contactLabelsSchema } from "../api/schema/contact-labels";
import { localContactLabel } from "../view-models/contacts-local";
import { useApiResource } from "./useApiResource";
import { useLocalContacts } from "./useLocalContacts";

export interface ContactLabel {id:string;name:string;organization:string}

/**
 * At most one task window. Names are re-authorized by owner. Sprint 0116: the
 * device copy of the contacts names every contact it holds (offline too); only
 * ids it lacks are asked of the server.
 */
export function useContactLabels(ids:readonly string[],consumerScope:string,ready=true) {
  const auth=useOrbitAuthSession(),server=useOrbitApiBaseUrl();
  const local=useLocalContacts(false);
  const unique=[...new Set(ids)].sort();
  const deviceReadable=local.available&&local.freshness.readable;
  const fromDevice=deviceReadable?unique.flatMap(id=>{const label=localContactLabel(local.rows,id);return label?[label]:[];}):[];
  const waitForDevice=local.available&&!local.freshness.readable&&!local.freshness.failure;
  const remaining=waitForDevice?[]:unique.filter(id=>!fromDevice.some(label=>label.id===id));
  const params=new URLSearchParams(remaining.map(id=>["id",id]));
  const valid=ids.length<=30;
  const enabled=valid&&ready&&auth.ready&&auth.signedIn&&server.ready&&!!auth.actorId&&remaining.length>0;
  const scopeKey=JSON.stringify([consumerScope,auth.actorId,auth.cookieHeader,server.baseUrl,enabled,remaining]);
  const state=useApiResource<unknown>(`/api/contacts/labels?${params}`,()=>false,{scopeKey,cachePolicy:"network-only",enabled});
  const parsed=enabled&&(state.kind==="success"||state.kind==="empty")?contactLabelsSchema.safeParse(state.data):null;
  const verified=parsed?.success&&parsed.data.actorId===auth.actorId&&parsed.data.items.every(item=>remaining.includes(item.id))?parsed.data:null;
  const items:ContactLabel[]=[...fromDevice,...(verified?verified.items.map(item=>({id:item.id,name:item.namePreview,organization:item.organizationPreview})):[])];
  // A contact the device copy names is never a failure, whatever the network does.
  const failure=!valid||(enabled&&(state.kind==="failure"||state.kind==="offline"||((state.kind==="success"||state.kind==="empty")&&!verified)));
  return {items,failure,refresh:state.refresh,loading:enabled&&state.kind==="loading"};
}
