import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {WarmCache,OPS_KEYS} from '../lib/warm-cache.js';
import {queuePickupRead} from '../lib/order-pickups.js';
import {showProjectScreen} from '../lib/project-navigation.js';
import {ReportRecovery} from '../lib/report-recovery.js';
import {installResumeSync} from '../lib/resume-sync.js';
import {progress} from '../lib/project-progress.js';
import {mountProjectCompletion,mountReviewInterventions,reviewCases} from '../lib/completion-workflow.js';
import {mountCompleteProject} from '../lib/project-lifecycle.js';
import {canViewStorage,refreshStorageGauge} from '../lib/storage-overview.js';

function gate(){
 let release;
 const wait=new Promise(resolve=>{release=resolve;});
 return {wait,release};
}

test('cold planning opens with the catalog still pending and orders load only for visible project cards',async t=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://opus.example/'});
 const {document,localStorage}=dom.window;
 t.after(()=>{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();});
 for(const name of ['window','document','localStorage']){
  const prior=globalThis[name];
  globalThis[name]=dom.window[name];
  t.after(()=>{if(prior===undefined)delete globalThis[name];else globalThis[name]=prior;});
 }
 localStorage.setItem('opus-main-section','calendar');
 const profile={id:'worker',displayName:'Worker',mail:'worker@example.test'};
 const projects=Array.from({length:20},(_,i)=>({id:'p'+i,name:'Chantier '+i,category:'02'}));
 const opsStarted=gate(),operations=gate(),calendarVisible=gate(),catalog=gate();
 let catalogReads=0,observer;
 const inspected=[];
 class Store{
  constructor(){this.rows=new Map();}
  async get(key){return structuredClone(this.rows.get(key));}
  async set(key,value){this.rows.set(key,structuredClone(value));}
  async all(){return [];}
 }
 class Graph{
  async connect(){this.drive={id:'drive'};this.site={id:'site'};}
  async request(){return profile;}
  async projects(){catalogReads++;await catalog.wait;return {projects,categories:[],loose:[]};}
 }
 class UI extends OpsUI{
  constructor(ctx){
   super(ctx);
   this.repo={init:async()=>{},loadAll:async()=>{
    opsStarted.release();
    await operations.wait;
    return Object.fromEntries(OPS_KEYS.map(key=>[key,[]]));
   }};
  }
  async renderCalendar(){await super.renderCalendar();calendarVisible.release();}
 }
 dom.window.IntersectionObserver=class{
  constructor(callback){observer=this;this.callback=callback;this.observed=new Set();}
  observe(node){this.observed.add(node);}
  unobserve(node){this.observed.delete(node);}
  disconnect(){this.observed.clear();}
  visible(nodes){this.callback(nodes.map(target=>({target,isIntersecting:true})),this);}
 };
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','')
  .replace(/const \{OpsUI\}=await import\('\.\/lib\/ops-ui\.js\?v=[^']+'\);/,'')
  .replace('init().catch(err);','');
 source+="\nconfig={clientId:'app',siteHost:'test',sitePath:'/test'};globalThis.hooks={connectCloud,ui:()=>opsUI};";
 const context=vm.createContext({
  structuredClone,URL,URLSearchParams,location:dom.window.location,history:dom.window.history,document,window:dom.window,localStorage,navigator:{onLine:true},
  setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,console,
  CATEGORIES:[['02','En cours']],norm:s=>s.toLowerCase(),OpsUI:UI,Graph,LocalStore:Store,Journal:class{},ReportRecovery,WarmCache,
  mountProjectCompletion,mountReviewInterventions,reviewCases,mountCompleteProject,showProjectScreen,progress,
  installResumeSync,canViewStorage,refreshStorageGauge,queuePickupRead,
  loadOrders:async(g,id)=>{inspected.push(id);return {supplier:[],depot:[]};},loadPickupStates:async()=>new Map(),pickupCount:()=>0,pickupBadge:()=>''
 });
 vm.runInContext(source,context);
 const start=context.hooks.connectCloud({homeAccountId:'worker-account'});
 await opsStarted.wait;
 assert.equal(catalogReads,1);
 operations.release();
 await calendarVisible.wait;
 assert.ok(document.querySelector('.hourGrid'));
 assert.equal(document.getElementById('dashboard').hidden,true);
 catalog.release();
 await start;
 assert.equal(catalogReads,1);
 assert.equal(document.querySelectorAll('[data-open-project]').length,0);
 assert.deepEqual(inspected,[]);
 const ui=context.hooks.ui();
 await ui.show('projects');
 assert.equal(observer.observed.size,projects.length);
 assert.deepEqual(inspected,[]);
 const [first,second,third]=observer.observed;
 observer.visible([first,second]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(inspected,['p0','p1']);
 await ui.show('visits');
 observer.visible([third]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(inspected,['p0','p1']);
});
