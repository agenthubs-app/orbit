export function authorizedDeliveryHref(value:unknown,deliveryId:string):string|null{
 if(!value||typeof value!=='object')return null;const d=value as {deliveryId?:unknown;data?:{deliveryId?:unknown};target?:{deliveryId?:unknown;kind?:unknown;status?:unknown;href?:unknown}},t=d.target;
 if(d.deliveryId!==deliveryId||d.data?.deliveryId!==deliveryId||t?.deliveryId!==deliveryId||t.kind!=='inbox'||t.status!=='available'||typeof t.href!=='string')return null;
 if(!/^\/inbox\/(?:notifications\/)?[^/?#]+$/.test(t.href))return null;
 try{const id=decodeURIComponent(t.href.split('/').at(-1)!);if(!id||id==='.'||id==='..'||/[\\/\u0000-\u001f]/.test(id))return null;}catch{return null;}
 return t.href;
}
