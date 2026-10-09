import test from 'node:test';import assert from 'node:assert/strict';
import {reportPhotos,photoEvidence,generateExplainedReport} from '../lib/report-photos.js';import {createHandler,instructions} from '../api/assistant.js';import {reportSource} from '../lib/report-ai.js';
const photo=()=>({dataUrl:'data:image/jpeg;base64,YWJj'});
test('general, point, phase and visit photos retain their labels; changes invalidate evidence',()=>{
 const p=photo(),record={photos:[p],reportItems:[{location:'Tableau',photos:[photo()],phasePhotos:{before:[photo()],during:[photo()],after:[photo()]}}]};
 const collected=reportPhotos(record);assert.equal(collected.length,5);assert.match(collected[4].label,/après/);const old=JSON.stringify(photoEvidence(record));p.dataUrl='data:image/jpeg;base64,ZGVm';assert.notEqual(JSON.stringify(photoEvidence(record)),old);assert.equal(reportPhotos({visitTasks:[{room:'Cuisine',photos:[photo()]}]},true).length,1);assert.doesNotMatch(JSON.stringify(reportSource(record,()=>'')),/base64/);
});
test('all photos are processed in bounded batches then used for an explanatory report',async()=>{
 const calls=[],photos=Array.from({length:13},(_,i)=>({photo:photo(),label:'Photo '+(i+1)}));
 const assistant={request:async(...args)=>{calls.push(args);return {text:'Observations du lot '+calls.length};}};
 await generateExplainedReport(assistant,{workDone:'2 prises remplacées',materials:'2 prises'},photos,{compress:async p=>p.photo.dataUrl});
 assert.deepEqual(calls.map(c=>c[3]?.length||0),[6,6,1,0]);assert.equal(calls[3][0],'report_fr');const source=JSON.parse(calls[3][1]);assert.equal(source.photoObservations.length,3);assert.equal(source.materials,'2 prises');assert.equal(source.concise,undefined);assert.match(source.audience,/non spécialiste/);
});
test('a changed source stops generation rather than validating old observations',async()=>{
 let current=true,calls=0;const assistant={request:async()=>{calls++;current=false;return {text:'Observation'};}};
 await assert.rejects(generateExplainedReport(assistant,{workDone:'test'},[{photo:photo(),label:'P1'}],{compress:async p=>p.photo.dataUrl,isCurrent:()=>current}),/changé/);assert.equal(calls,1);
});
async function invoke(body,authorized=true){const calls=[],res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await createHandler({env:{OPENAI_API_KEY:'secret',OPUS_AI_ALLOWED_USERS:'tech@test.fr'},fetcher:async(url,opts)=>{calls.push({url,opts});return calls.length===1?{ok:true,json:async()=>({userPrincipalName:authorized?'tech@test.fr':'other@test.fr'})}:{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Photo 1 : un coffret est visible, essais non déterminables.'}]}]})};}})({method:'POST',headers:{authorization:'Bearer delegated'},body},res);return {res,calls};}
test('vision endpoint checks user, validates images and sends image content with store false',async()=>{
 const body={action:'report_photo_observations',text:'Photo 1 — tableau après',images:[photo().dataUrl]};const {res,calls}=await invoke(body);assert.equal(res.code,200);const request=JSON.parse(calls[1].opts.body);assert.equal(request.store,false);assert.equal(request.input[0].content[1].type,'input_image');assert.equal(request.input[0].content[1].image_url,photo().dataUrl);assert.doesNotMatch(JSON.stringify(res.body),/secret/);
 assert.equal((await invoke(body,false)).calls.length,1);assert.equal((await invoke({...body,images:['https://example.org/photo.jpg']})).res.code,400);assert.equal((await invoke({...body,images:Array(7).fill(photo().dataUrl)})).res.code,400);
 assert.match(instructions,/client non spécialiste/);assert.match(instructions,/N’infère jamais depuis une photo seule/);assert.match(instructions,/photos.*confirmer|contradiction/);
});
