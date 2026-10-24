import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireSessionToken,requiresInteractiveAuth} from '../lib/auth-session.js';
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
