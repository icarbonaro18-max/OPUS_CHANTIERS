import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {interventionAlerts,unreadAlerts,alertVersion,mountTeamAlerts} from '../lib/team-alerts.js';
test('material and instructions remain unread per tablet until consulted; updates become unread again',()=>{
 const x={id:'i',number:'INT-1',title:'Laurent',plannedStart:'2026-09-16T08:00',request:'Prendre les clés',materialOrders:[{id:'m',fileId:'f',name:'bon.pdf',supplier:'Rexel',pickup:'Buc',updatedAt:'v1'}]};
 const rows=interventionAlerts([x]),tabletA={},tabletB={};
 assert.equal(rows.length,2);assert.equal(unreadAlerts(rows,tabletA).length,2);assert.match(rows[0].detail,/Rexel.*Buc/);assert.equal(rows[0].date,x.plannedStart);
 tabletA[rows[0].id]=alertVersion(rows[0]);assert.equal(unreadAlerts(rows,tabletA).length,1);assert.equal(unreadAlerts(rows,tabletB).length,2);
 x.materialOrders[0].updatedAt='v2';assert.equal(unreadAlerts(interventionAlerts([x]),tabletA).length,2);
 tabletA[rows[1].id]=alertVersion(rows[1]);x.request='Autres clés';assert.equal(unreadAlerts(interventionAlerts([x]),tabletA).length,2);
 assert.equal(interventionAlerts([{...x,status:'annulee'}]).length,0);
});

function setup(t,{offline=false,admin=false}={}){
 const dom=new JSDOM('<header><div class="brand"></div></header><main></main>',{url:'https://opus.test',pretendToBeVisual:true});
 for(const key of ['window','document','localStorage']){
  const old=globalThis[key];globalThis[key]=dom.window[key];
  t.after(()=>{if(old===undefined)delete globalThis[key];else globalThis[key]=old;});
 }
 t.after(()=>dom.window.close());
 const data=[{id:'tech',number:'INT-1',request:'Récupérer les clés'},{id:'report',projectId:'p',reportSubmittedAt:'2026-11-20',status:'terminee',workDone:'Compte rendu pour le bureau'}];
 let tag='v1',reads=0,checks=0;
 const graph={
  named:async()=>{checks++;return {id:'f',eTag:tag};},
  json:async()=>{reads++;return data;}
 };
 const ui={user:{id:'test'},data:{interventions:data},cacheMode:offline,repo:{root:{id:'system'},readCache:new Map([['interventions',{id:'f',tag,value:data}]])},
  c:{getCatalog:()=>({projects:[]}),isAdmin:()=>admin,graph,modal:(_,html)=>{document.querySelector('main').innerHTML=html;}}};
 return {ui,graph,data,readCount:()=>reads,checkCount:()=>checks,changeTag:value=>{tag=value;}};
}

test('three application announcements appear offline and keep existing operational read state',t=>{
 const {ui,checkCount}=setup(t,{offline:true});
 const alert=interventionAlerts(ui.data.interventions)[0];
 const stored=JSON.stringify({[alert.id]:alertVersion(alert)});
 localStorage.setItem('opus-read-alerts:test',stored);
 mountTeamAlerts(ui);
 const button=document.getElementById('teamAlerts');
 for(let open=0;open<2;open++){
  button.click();
  const panel=document.getElementById('teamAlertsPanel');
  assert.equal(panel.querySelectorAll('li').length,3);
  for(const label of ['Nouvelle visite','Visite effectuée','Devis effectué'])assert.ok(panel.textContent.includes(label));
  assert.match(panel.querySelector('[role=status]').textContent,/hors ligne/i);
  assert.equal(panel.querySelectorAll('[data-read-alert]').length,0);
  assert.doesNotMatch(panel.textContent,/Compte rendu pour le bureau/);
 }
 assert.equal(button.querySelector('.unreadBadge'),null);
 assert.equal(localStorage.getItem('opus-read-alerts:test'),stored);
 assert.equal(checkCount(),0);
});

test('news and operational alerts appear before cloud refresh; unchanged interventions are downloaded zero times',async t=>{
 const {ui,graph,readCount,checkCount,changeTag}=setup(t,{admin:true});
 const api=mountTeamAlerts(ui),button=document.getElementById('teamAlerts');
 assert.equal(button.querySelector('.unreadBadge').textContent,'2');
 assert.equal(checkCount(),0);
 let release;
 const named=graph.named;
 graph.named=()=>new Promise(resolve=>{release=()=>resolve({id:'f',eTag:'v1'});});
 const refreshing=api.refresh();
 button.click();
 assert.equal(document.querySelectorAll('#teamAlertsPanel li').length,3);
 assert.match(document.getElementById('teamAlertsPanel').textContent,/Compte rendu pour le bureau/);
 release();await refreshing;
 graph.named=named;
 assert.equal(readCount(),0);
 button.click();
 assert.equal(checkCount(),0);
 changeTag('v2');await api.refresh();await api.refresh();
 assert.equal(readCount(),1);
 assert.equal(checkCount(),2);
 assert.equal(document.querySelectorAll('#teamAlertsPanel [data-read-alert]').length,2);
});
