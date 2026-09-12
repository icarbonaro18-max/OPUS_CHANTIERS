import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,instructions} from '../api/assistant.js';
import {reportSource} from '../lib/report-ai.js';
const env={OPENAI_API_KEY:'test-secret',OPUS_AI_ALLOWED_USERS:'tech@example.test',OPENAI_MODEL:'test-model'};
async function invoke({body={action:'rewrite_fr',text:'non funziona'},auth='Bearer test',fetcher,settings=env,method='POST'}={}){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
  await createHandler({env:settings,fetcher})({method,headers:{authorization:auth},body},res);
  return res;
}
test('fails closed without server configuration or login',async()=>{
  assert.equal((await invoke({settings:{}})).code,503);
  assert.equal((await invoke({auth:''})).code,401);
  assert.equal((await invoke({method:'GET'})).code,405);
});
test('rejects invalid input before any external request',async()=>{
  assert.equal((await invoke({body:{action:'delete',text:'x'}})).code,400);
  assert.equal((await invoke({body:{action:'rewrite_fr',text:'x'.repeat(60001)}})).code,413);
});
test('unauthorized Microsoft user never reaches provider',async()=>{
  let calls=0;
  const res=await invoke({fetcher:async()=>{calls++;return {ok:true,json:async()=>({id:'other',userPrincipalName:'other@example.test'})};}});
  assert.equal(res.code,403);assert.equal(calls,1);
});
test('expired Microsoft token is rejected',async()=>{
  assert.equal((await invoke({fetcher:async()=>({ok:false})})).code,401);
});
test('FR/IT notes reach Responses; store false; no secret in response',async()=>{
  let calls=0;
  const res=await invoke({body:{action:'report_fr',text:'Due prese sostituite, test OK. Couloir non réparé.'},fetcher:async(url,options)=>{
    calls++;
    if(calls===1)return {ok:true,json:async()=>({userPrincipalName:'TECH@example.test'})};
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(options.body);
    assert.equal(body.store,false);assert.match(body.input,/Due prese/);
    assert.equal(options.headers.Authorization,'Bearer test-secret');
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Deux prises remplacées.'}]}]})};
  }});
  assert.equal(res.code,200);assert.equal(res.body.text,'Deux prises remplacées.');
  assert.doesNotMatch(JSON.stringify(res.body),/secret/);
});
test('quota and incomplete generations produce explicit errors',async()=>{
  for(const [provider,status] of [[{ok:false,status:429},429],[{ok:true,json:async()=>({status:'incomplete'})},502]]){
    let calls=0;
    const res=await invoke({fetcher:async()=>++calls===1?{ok:true,json:async()=>({userPrincipalName:'tech@example.test'})}:provider});
    assert.equal(res.code,status);
  }
});
test('source excludes photos; includes effective quote flag and original point',()=>{
  const source=reportSource({photos:['secret'],reportItems:[{observation:'guasto',photos:['secret'],needsQuote:true}]},()=> '');
  assert.equal(source.needsQuote,true);assert.equal(source.points[0].observation,'guasto');
  assert.doesNotMatch(JSON.stringify(source),/secret|photos/);
});
test('prompt distinguishes performed and planned work and prohibits invented facts',()=>{
  assert.match(instructions,/Ne jamais inventer/);assert.match(instructions,/réalisé et à prévoir/);
});
