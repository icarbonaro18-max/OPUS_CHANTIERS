import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceConfigOverrides,loadAppConfig} from '../lib/app-config.js';
const KEY='opus-cloud-config-v3';
const published=()=>({clientId:'published-client',tenant:'published-tenant',siteHost:'published.sharepoint.com',sitePath:'/sites/OPUS',driveId:'drive',aiEndpoint:'/api/assistant',version:'3.4.93',adminUsers:['ignazio@opuselec.fr'],managerUsers:['roberto@opuselec.fr'],scopes:['Sites.Selected'],defaultPeople:[...Array.from({length:7},(_,i)=>({name:'Person '+i})),{name:'CHATTI Brahim',schoolPeriods:[{start:'2026-11-09',end:'2026-11-10',label:'École'}]}],pollSeconds:45});
function memory(value){
 const entries=new Map([['opus-report:draft','rapport en cours'],['msal.account','session à conserver']]);
 if(value!==undefined)entries.set(KEY,typeof value==='string'?value:JSON.stringify(value));
 const writes=[],reads=[];
 return {entries,writes,reads,getItem(key){reads.push(key);return entries.get(key)??null;},setItem(key,value){writes.push([key,value]);entries.set(key,value);},clear(){throw Error('Never clear device storage');},removeItem(){throw Error('Never remove unrelated data');}};
}
test('old complete configuration keeps connection but receives published Brahim, permissions, scopes and version',()=>{
 const pub=published(),old={...pub,clientId:'device-client',tenant:'device-tenant',siteHost:'local.sharepoint.com',sitePath:'/sites/Existing',driveId:'',aiEndpoint:'',version:'3.4.85',defaultPeople:pub.defaultPeople.slice(0,7),adminUsers:['wrong@example.test'],managerUsers:[],scopes:['old-scope'],pollSeconds:999,catalog:{stale:true}},storage=memory(old);
 const before=structuredClone(pub),result=loadAppConfig(pub,storage);
 assert.deepEqual(pub,before);assert.notEqual(result,pub);
 assert.equal(result.clientId,'device-client');assert.equal(result.tenant,'device-tenant');assert.equal(result.siteHost,'local.sharepoint.com');assert.equal(result.sitePath,'/sites/Existing');assert.equal(result.driveId,'');assert.equal(result.aiEndpoint,'');
 assert.equal(result.defaultPeople.length,8);assert.equal(result.defaultPeople.at(-1).name,'CHATTI Brahim');
 for(const key of ['defaultPeople','adminUsers','managerUsers','scopes','version','pollSeconds'])assert.deepEqual(result[key],pub[key]);
 assert.equal(result.catalog,undefined);assert.equal(storage.writes.length,1);
 assert.deepEqual(JSON.parse(storage.entries.get(KEY)),{clientId:'device-client',tenant:'device-tenant',siteHost:'local.sharepoint.com',sitePath:'/sites/Existing',driveId:'',aiEndpoint:''});
 assert.equal(storage.entries.get('opus-report:draft'),'rapport en cours');assert.equal(storage.entries.get('msal.account'),'session à conserver');
 assert.deepEqual(storage.reads,[KEY]);assert.ok(storage.writes.every(([key])=>key===KEY));
});
test('setup exports only own string connection fields without modifying its source',()=>{
 const source={...published(),clientId:'local',driveId:'',aiEndpoint:'',tenant:null,siteHost:123,sitePath:{path:'/bad'},extra:'ignored'},before=structuredClone(source);
 assert.deepEqual(deviceConfigOverrides(source),{clientId:'local',driveId:'',aiEndpoint:''});assert.deepEqual(source,before);
 const inherited=Object.create({clientId:'inherited',tenant:'inherited'});inherited.driveId='';assert.deepEqual(deviceConfigOverrides(inherited),{driveId:''});
});
test('corrupt, absent, array and scalar storage fall back to published configuration',()=>{
 for(const value of [undefined,'','{bad JSON','null','[]','[1,2]','false','42','"old config"']){
  const pub=published(),storage=memory(value);assert.deepEqual(loadAppConfig(pub,storage),pub);assert.equal(storage.writes.length,0);
 }
 for(const value of [null,undefined,[],['x'],true,5,'config'])assert.deepEqual(deviceConfigOverrides(value),{});
});
test('local overrides require a nonempty string clientId, matching historical activation',()=>{
 for(const clientId of [undefined,null,false,123,'','   ']){
  const pub=published(),storage=memory({clientId,tenant:'not-applied',aiEndpoint:'',defaultPeople:[]});assert.deepEqual(loadAppConfig(pub,storage),pub);assert.equal(storage.writes.length,0);
 }
 const pub=published(),storage=memory({clientId:'local',driveId:12,aiEndpoint:false});const result=loadAppConfig(pub,storage);
 assert.equal(result.clientId,'local');assert.equal(result.driveId,pub.driveId);assert.equal(result.aiEndpoint,pub.aiEndpoint);
});
test('unavailable storage cannot break startup; a failed migration still uses valid connection fields',()=>{
 const pub=published();assert.deepEqual(loadAppConfig(pub,null),pub);assert.deepEqual(loadAppConfig(pub,undefined),pub);
 assert.deepEqual(loadAppConfig(pub,{getItem(){throw Error('Storage blocked');}}),pub);
 assert.deepEqual(loadAppConfig(pub,{get getItem(){throw Error('Storage unavailable');}}),pub);
 const storage={getItem:()=>JSON.stringify({clientId:'local',defaultPeople:[]}),setItem(){throw Error('Quota exceeded');}};
 const result=loadAppConfig(pub,storage);assert.equal(result.clientId,'local');assert.deepEqual(result.defaultPeople,pub.defaultPeople);
});
test('migration writes once; already minimal content is preserved regardless of key ordering or whitespace',()=>{
 const pub=published(),storage=memory({...pub,clientId:'local'});
 loadAppConfig(pub,storage);loadAppConfig(pub,storage);assert.equal(storage.writes.length,1);
 const minimal=memory('{ "aiEndpoint": "", "clientId": "local", "driveId": "" }');
 loadAppConfig(pub,minimal);loadAppConfig(pub,minimal);assert.equal(minimal.writes.length,0);
});
test('a newly published school calendar replaces stale device content on every load',()=>{
 const first=published(),storage=memory({...first,clientId:'local'});loadAppConfig(first,storage);
 const next=structuredClone(first);next.defaultPeople.at(-1).schoolPeriods=[{start:'2026-12-01',end:'2026-12-04',label:'École corrigée'}];next.version='new';
 const result=loadAppConfig(next,storage);assert.deepEqual(result.defaultPeople.at(-1).schoolPeriods,next.defaultPeople.at(-1).schoolPeriods);assert.equal(result.version,'new');assert.equal(result.clientId,'local');assert.equal(storage.writes.length,1);
});
