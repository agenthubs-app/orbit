import test from 'node:test';import assert from 'node:assert/strict';import {authorizedDeliveryHref} from '../../src/notifications/delivery-navigation';
test('opaque delivery IDs only navigate using authenticated matching targets',()=>{
 const dto={deliveryId:'d',data:{deliveryId:'d'},target:{deliveryId:'d',kind:'inbox',status:'available',href:'/inbox/conversation%3Ac'}};
 assert.equal(authorizedDeliveryHref(dto,'d'),'/inbox/conversation%3Ac');for(const href of ['https://evil.invalid','/settings','/inbox/../settings','/inbox/%2e%2e','/inbox/c?actorId=b'])assert.equal(authorizedDeliveryHref({...dto,target:{...dto.target,href}},'d'),null);
 assert.equal(authorizedDeliveryHref(dto,'foreign'),null);assert.equal(authorizedDeliveryHref({...dto,target:{...dto.target,status:'unavailable'}},'d'),null);
});
