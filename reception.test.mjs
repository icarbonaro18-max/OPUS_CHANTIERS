import test from 'node:test';
import assert from 'node:assert/strict';
import {completeReception,isReception} from '../lib/reception.js';
test('reception completes without report or changes to source or billing',async()=>{
 const source={status:'terminee',invoicedAt:'date'},v={type:'Réception de chantier / intervention',receptionId:'p',status:'planifiee',attachments:[{fileId:'photo'}]};
 const saved=[];await completeReception({save:async k=>saved.push(k)},v,'');
 assert.equal(isReception(v),true);assert.equal(v.status,'terminee');assert.deepEqual(saved,['visits']);assert.deepEqual(source,{status:'terminee',invoicedAt:'date'});assert.equal(v.attachments.length,1);assert.equal(v.report,undefined);
});
test('failed reception completion restores original status and notes',async()=>{
 const v={status:'planifiee',notes:'avant'};await assert.rejects(completeReception({save:async()=>{throw Error('offline');}},v,'après'),/offline/);assert.deepEqual(v,{status:'planifiee',notes:'avant'});
});
