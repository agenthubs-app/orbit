import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { contactLabelsSchema } from "../api/schema/contact-labels";
import { useApiResource } from "./useApiResource";

export interface ContactLabel {id:string;name:string;organization:string}

/** At most one task window. Names are online-only and re-authorized by owner. */
export function useContactLabels(ids:readonly string[],consumerScope:string,ready=true) {
  const auth=useOrbitAuthSession(),server=useOrbitApiBaseUrl();
  const unique=[...new Set(ids)].sort();
  const params=new URLSearchParams(unique.map(id=>["id",id]));
  const valid=ids.length<=30;
  const enabled=valid&&ready&&auth.ready&&auth.signedIn&&server.ready&&!!auth.actorId&&unique.length>0;
  const scopeKey=JSON.stringify([consumerScope,auth.actorId,auth.cookieHeader,server.baseUrl,enabled,unique]);
  const state=useApiResource<unknown>(`/api/contacts/labels?${params}`,()=>false,{scopeKey,cachePolicy:"network-only",enabled});
  const parsed=enabled&&(state.kind==="success"||state.kind==="empty")?contactLabelsSchema.safeParse(state.data):null;
  const verified=parsed?.success&&parsed.data.actorId===auth.actorId&&parsed.data.items.every(item=>unique.includes(item.id))?parsed.data:null;
  const items:ContactLabel[]=verified?verified.items.map(item=>({id:item.id,name:item.namePreview,organization:item.organizationPreview})):[];
  const failure=!valid||(enabled&&(state.kind==="failure"||state.kind==="offline"||((state.kind==="success"||state.kind==="empty")&&!verified)));
  return {items,failure,refresh:state.refresh,loading:enabled&&state.kind==="loading"};
}
