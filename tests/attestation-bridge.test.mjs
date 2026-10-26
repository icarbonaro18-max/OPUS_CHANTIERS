import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../lib/bridge.js',import.meta.url),'utf8');
function clock(window){
 let now=0,next=0;const jobs=new Map();
 window.Date.now=()=>now;
 window.setTimeout=(fn,ms=0)=>{const id=++next;jobs.set(id,{fn,at:now+ms});return id;};
 window.clearTimeout=id=>jobs.delete(id);
 window.setInterval=(fn,ms)=>{const id=++next;jobs.set(id,{fn,at:now+ms,repeat:ms});return id;};
 window.clearInterval=id=>jobs.delete(id);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 return {async tick(ms){const end=now+ms;await flush();for(;;){const entry=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)break;const[id,job]=entry;now=job.at;if(job.repeat)job.at+=job.repeat;else jobs.delete(id);job.fn();await flush();}now=end;await flush();},get now(){return now;}};
}
async function setup(t){
 const dom=new JSDOM('<input id="note"><canvas id="signatureCanvas"></canvas><script data-module="baes"></script>',{url:'https://opus.example/modules/baes/index.html?embed=1&session=session-1',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>dom.window.close());
 const timers=clock(w),sent=[];let applied=0,collected=0,photo='',signature='',drawing=false,releasePhoto;
 const parent={postMessage(message,origin){assert.equal(origin,'https://opus.example');sent.push(structuredClone(message));}};
 Object.defineProperty(w,'parent',{value:parent});Object.defineProperty(w.document,'currentScript',{get:()=>w.document.querySelector('script')});
 Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
 w.OPUS_EMBEDDED=true;
 w.collectState=()=>{collected++;return {note:w.document.getElementById('note').value,photo,signature};};
 w.applyState=value=>{applied++;w.document.getElementById('note').value=value.note||'';photo=value.photo||'';signature=value.signature||'';};
 w.processPhoto=async()=>{await new Promise(resolve=>releasePhoto=resolve);photo='data:image/jpeg;base64,PHOTO';};
 const canvas=w.document.getElementById('signatureCanvas');canvas.addEventListener('pointerdown',()=>{drawing=true;});
 for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{if(drawing){signature='data:image/png;base64,SIGNATURE';drawing=false;}});
 const message=(data,options={})=>w.dispatchEvent(new w.MessageEvent('message',{source:options.source||parent,origin:options.origin||w.location.origin,data:{nonce:'session-1',moduleKey:'baes',...data}}));
 const pointer=type=>{const event=new w.Event(type,{bubbles:true});Object.defineProperty(event,'pointerId',{value:7});canvas.dispatchEvent(event);};
 const edit=value=>{w.document.getElementById('note').value=value;w.document.getElementById('note').dispatchEvent(new w.Event('input',{bubbles:true}));};
 const states=()=>sent.filter(m=>m.type==='opus-state');
 const ack=(capture,ok=true)=>message({type:'opus-state-ack',captureId:capture.captureId,ok});
 w.eval(source);message({type:'opus-init',payload:{state:{note:'saved',photo:'',signature:''},ref:'BAES-1'}});await timers.tick(700);
 assert.equal(states().length,1);ack(states()[0]);sent.length=0;
 return {w,timers,sent,message,pointer,edit,states,ack,releasePhoto:()=>releasePhoto(),get applied(){return applied;},get collected(){return collected;}};
}
test('local persistence failure retries unchanged work until a positive ACK, even while offline',async t=>{
 const f=await setup(t);Object.defineProperty(f.w.navigator,'onLine',{value:false});
 f.edit('Travail hors ligne');await f.timers.tick(900);const failed=f.states().at(-1);assert.equal(failed.state.note,'Travail hors ligne');f.ack(failed,false);
 await f.timers.tick(4000);const retry=f.states().at(-1);assert.equal(retry.state.note,'Travail hors ligne');assert.notEqual(retry.captureId,failed.captureId);
 f.ack(retry);const n=f.states().length;await f.timers.tick(12000);assert.equal(f.states().length,n);assert.equal(f.applied,1);assert.equal(f.w.document.getElementById('note').value,'Travail hors ligne');
});
test('missing ACK is retried with the same ID; wrong origin, nonce and frame cannot confirm persistence',async t=>{
 const f=await setup(t);f.edit('À conserver');await f.timers.tick(900);const original=f.states().at(-1);
 f.message({type:'opus-state-ack',captureId:original.captureId,ok:true,nonce:'other'});
 f.message({type:'opus-state-ack',captureId:original.captureId,ok:true},{origin:'https://other.example'});
 f.message({type:'opus-state-ack',captureId:original.captureId,ok:true},{source:{}});
 await f.timers.tick(12000);const retries=f.states().filter(m=>m.captureId===original.captureId);assert.ok(retries.length>=2);assert.ok(retries.every(m=>m.state.note==='À conserver'));
 f.ack(retries.at(-1));const n=f.states().length;await f.timers.tick(8000);assert.equal(f.states().length,n);
});
test('a late ACK cannot clear a newer edit or a failed return to an earlier saved value',async t=>{
 const f=await setup(t);f.edit('B');await f.timers.tick(900);const b=f.states().at(-1);
 f.edit('saved');await f.timers.tick(900);const reverted=f.states().at(-1);assert.notEqual(reverted.captureId,b.captureId);
 // B was persisted while the operator reverted to the earlier value; only the
 // latest reversion can acknowledge the current form, and its first write fails.
 f.ack(b);f.ack(reverted,false);await f.timers.tick(4000);const retry=f.states().at(-1);
 assert.equal(retry.state.note,'saved');assert.notEqual(retry.captureId,reverted.captureId);f.ack(retry);
 assert.equal(f.applied,1);assert.equal(f.w.document.getElementById('note').value,'saved');
});
test('concurrent manual and background captures wait for a photo and share a coherent snapshot',async t=>{
 const f=await setup(t),before=f.collected;const photo=f.w.processPhoto();f.edit('Texte pendant préparation');
 f.message({type:'opus-capture',requestId:'close'});f.message({type:'opus-capture',requestId:'preview'});
 await f.timers.tick(2000);assert.equal(f.states().length,0);assert.equal(f.collected,before);
 f.edit('Texte final');f.releasePhoto();await photo;await f.timers.tick(300);
 const manual=f.states().filter(m=>m.requestId);assert.deepEqual(manual.map(m=>m.requestId),['close','preview']);assert.equal(manual[0].captureId,manual[1].captureId);
 assert.ok(manual.every(m=>m.state.note==='Texte final'&&m.state.photo==='data:image/jpeg;base64,PHOTO'));assert.equal(f.collected,before+1);assert.equal(f.applied,1);
});
test('captures wait for a signature stroke; hiding the app commits it without restoring the form',async t=>{
 const f=await setup(t);f.pointer('pointerdown');f.edit('Signature en cours');f.message({type:'opus-capture',requestId:'save'});
 await f.timers.tick(1200);assert.equal(f.states().length,0);
 Object.defineProperty(f.w.document,'hidden',{value:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await f.timers.tick(300);
 assert.equal(f.states().at(-1).state.signature,'data:image/png;base64,SIGNATURE');assert.equal(f.states().at(-1).state.note,'Signature en cours');assert.equal(f.states().at(-1).requestId,'save');assert.equal(f.applied,1);
 f.ack(f.states().at(-1));f.edit('Dernière phrase');f.w.dispatchEvent(new f.w.Event('pagehide'));await f.timers.tick(0);
 assert.equal(f.states().at(-1).state.note,'Dernière phrase');assert.equal(f.applied,1);
});
test('manual capture responds even when the current state is already durable',async t=>{
 const f=await setup(t);f.message({type:'opus-capture',requestId:'close-clean'});await f.timers.tick(100);
 assert.equal(f.states().length,1);assert.equal(f.states()[0].requestId,'close-clean');assert.equal(f.states()[0].state.note,'saved');
});
