import test from 'node:test';
import assert from 'node:assert/strict';
import {Graph} from '../lib/cloud.js';
test('a Graph asynchronous copy acknowledges 202 without trying to parse an empty JSON body',async()=>{
 const calls=[],g=new Graph(async()=> 'token',async(url,options)=>{calls.push({url,options});return new Response(null,{status:202});});g.drive={id:'drive'};
 g.item=async()=>({id:'source',eTag:'old'});g.named=async()=>({id:'backup',file:{},size:44});const result=await g.backupCopy({id:'source',eTag:'old',size:44},'destination','safety.json');assert.equal(result.id,'backup');assert.equal(calls.length,1);assert.match(calls[0].url,/items\/source\/copy$/);assert.deepEqual(JSON.parse(calls[0].options.body),{parentReference:{driveId:'drive',id:'destination'},name:'safety.json'});assert.equal(calls[0].options.acceptAsync,undefined);
});
test('a changed source version blocks server-copy confirmation and protects the original',async()=>{
 const g=new Graph(async()=> 'token',async()=>new Response(null,{status:202}));g.drive={id:'drive'};let reads=0;g.item=async()=>({id:'source',eTag:++reads===1?'old':'new'});g.named=async()=>({id:'backup',file:{},size:44});await assert.rejects(g.backupCopy({id:'source',eTag:'old',size:44},'destination','safety.json'),error=>error.status===412);
});
