import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceExtractor} from '../../features/notifications/discovery/evidence-extractor';
test('extractor uses injected provider, supplies no tools, bounds output and rejects invented job identities',async()=>{
 let calls=0;const extract=createEvidenceExtractor({config:{apiKey:'test-only'},upperBoundUsd:0.1,model:async input=>{calls++;assert.equal(input.config?.maxTokens,4096);assert.ok(input.systemInstruction.includes('untrusted'));return {success:true,provider:'deepseek',model:'test-only',source:'explicit-config',text:JSON.stringify({results:[{jobId:'other',candidate:null,reason:'skip'}]})} as never;}});
 await assert.rejects(extract.extract([{jobId:'j',evidence:[]}],{actorId:'a',language:'zh',timeZone:'Asia/Tokyo'}),/invalid_job_mapping/);assert.equal(calls,1);
 await assert.rejects(extract.extract(Array.from({length:21},(_,i)=>({jobId:String(i),evidence:[]})),{actorId:'a',language:'zh',timeZone:'Asia/Tokyo'}),/invalid_batch/);assert.equal(calls,1);
});
test('no explicit discovery key never falls back to a developer environment credential',async()=>{let called=false;const extractor=createEvidenceExtractor({config:{apiKey:''},upperBoundUsd:1,model:async()=>{called=true;throw Error('must not call');}});await assert.rejects(extractor.extract([{jobId:'j',evidence:[]}],{actorId:'a',language:'zh',timeZone:'Asia/Tokyo'}),/discovery_provider_unconfigured/);assert.equal(called,false);});
