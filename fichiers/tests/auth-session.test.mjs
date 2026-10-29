import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireSessionToken,requiresInteractiveAuth,runAuthInteraction,selectSessionAccount} from '../lib/auth-session.js';
const account={homeAccountId:'technician'};
const client=acquireTokenSilent=>({getActiveAccount:()=>account,acquireTokenSilent});
test('network, iframe timeout and throttling do not require interactive sign-in',async()=>{
 for(const code of ['no_network_connectivity','post_request_failed','monitor_window_timeout','temporarily_unavailable','interaction_in_progress']){
  const source=Object.assign(Error(code),{errorCode:code});
  await assert.rejects(acquireSessionToken(client(async()=>{throw source;}),['User.Read']),error=>{
   assert.equal(error.status,0);assert.equal(error.code,'token_unavailable');assert.equal(error.cause,source);assert.equal(requiresInteractiveAuth(error),false);return true;
  });
 }
});
test('explicit Microsoft interaction errors request sign-in and retain claims',async()=>{
 for(const source of [{name:'InteractionRequiredAuthError',errorCode:'refresh_token_expired'},{errorCode:'interaction_required'},{errorCode:'login_required'},{errorCode:'consent_required'}]){
  source.claims='test-claims';
  await assert.rejects(acquireSessionToken(client(async()=>{throw source;}),['User.Read']),error=>{
   assert.equal(error.status,401);assert.equal(error.code,'auth_required');assert.equal(error.claims,'test-claims');assert.equal(requiresInteractiveAuth(error),true);return true;
  });
 }
});
test('silent renewal keeps selected account and passes forced renewal to MSAL',async()=>{
 let request;assert.equal(await acquireSessionToken(client(async r=>{request=r;return {accessToken:'new'};}),['Files.ReadWrite'],{forceRefresh:true}),'new');
 assert.equal(request.account,account);assert.deepEqual(request.scopes,['Files.ReadWrite']);assert.equal(request.forceRefresh,true);
});
test('missing account needs sign-in, missing initialized client does not',async()=>{
 await assert.rejects(acquireSessionToken({getActiveAccount:()=>null},[]),requiresInteractiveAuth);
 await assert.rejects(acquireSessionToken(null,[]),e=>e.code==='auth_not_initialized'&&!requiresInteractiveAuth(e));
});


test('a second login or logout cannot overlap an active Microsoft interaction',async()=>{
 let release,calls=0;const ready=new Promise(resolve=>release=resolve),client={},states=[];
 const first=runAuthInteraction(client,async()=>{calls++;await ready;return 'ok';},busy=>states.push(busy));
 await assert.rejects(runAuthInteraction(client,async()=>{calls++;}),e=>e.code==='auth_busy');
 assert.equal(calls,1);assert.deepEqual(states,[true]);release();assert.equal(await first,'ok');assert.deepEqual(states,[true,false]);
 assert.equal(await runAuthInteraction(client,async()=>'again'),'again');
});

test('a stranded MSAL interaction yields an actionable error and releases the local gate',async()=>{
 const client={},cause=Object.assign(Error('raw'),{errorCode:'interaction_in_progress'});
 await assert.rejects(runAuthInteraction(client,async()=>{throw cause;}),e=>e.code==='auth_interaction_blocked'&&e.cause===cause&&/Relancer la connexion bloquée/.test(e.message));
 assert.equal(await runAuthInteraction(client,async()=>'recovered'),'recovered');
});

test('the known report owner is reselected by exact homeAccountId if active account disappeared',async()=>{
 const owner={homeAccountId:'owner'},other={homeAccountId:'other'};let selected=null,sent;
 const client={getActiveAccount:()=>selected,getAllAccounts:()=>[other,owner],setActiveAccount:account=>selected=account,acquireTokenSilent:async request=>{sent=request;return {accessToken:'token'};}};
 assert.equal(await acquireSessionToken(client,[],{expectedHomeAccountId:'owner'}),'token');assert.equal(sent.account,owner);assert.equal(selected,owner);
 selected=other;assert.equal(selectSessionAccount(client,'owner'),owner);assert.equal(selected,owner);
});

test('an absent owner never falls back to another technician cached in the browser',async()=>{
 const client={getActiveAccount:()=>({homeAccountId:'other'}),getAllAccounts:()=>[{homeAccountId:'other'}],acquireTokenSilent:async()=>assert.fail('Wrong owner token request')};
 await assert.rejects(acquireSessionToken(client,[],{expectedHomeAccountId:'owner'}),e=>e.code==='auth_required');
});
