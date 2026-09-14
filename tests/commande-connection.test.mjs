import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeConnection} from '../commandes/connection.js';
test('redirect is completed before cached accounts are read; returned account wins',async()=>{
 const calls=[];let finish;const wait=new Promise(r=>finish=r);const account={id:'owner'};
 const msal={initialize:async()=>calls.push('initialize'),handleRedirectPromise:async()=>{calls.push('redirect');await wait;return {account};},getActiveAccount:()=>{calls.push('read');return null;},getAllAccounts:()=>[],setActiveAccount:a=>{assert.equal(a,account);calls.push('set');}};
 const pending=initializeConnection(msal);await new Promise(r=>setTimeout(r,0));assert.deepEqual(calls,['initialize','redirect']);finish();assert.equal(await pending,account);assert.deepEqual(calls,['initialize','redirect','set']);
});
test('fresh login and existing cached login both finish redirect handling',async()=>{
 for(const account of [undefined,{id:'cached'}]){let handled=false;const msal={initialize:async()=>{},handleRedirectPromise:async()=>{handled=true;return null;},getActiveAccount:()=>{assert.ok(handled);return account;},getAllAccounts:()=>[],setActiveAccount:()=>{}};assert.equal(await initializeConnection(msal),account);}
});
