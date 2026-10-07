// No tokens or shared-account fallback: each snapshot belongs to one account and library.
export const OPS_KEYS=['clients','people','interventions','visits','events','closures','projectTracking'];
export const validOps=data=>!!data&&OPS_KEYS.every(k=>Array.isArray(data[k]));
// Never copy inline photos, signatures or attachments into the fast-start snapshot.
// The original reports and queued drafts remain untouched in their existing stores.
export function lightSnapshot(value){
 if(typeof value==='string')return /^data:/i.test(value)?undefined:value;
 if(Array.isArray(value))return value.map(lightSnapshot).filter(v=>v!==undefined);
 if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value)){if(key==='@microsoft.graph.downloadUrl')continue;const next=lightSnapshot(item);if(next!==undefined)result[key]=next;}return result;}
 return value;
}
export class WarmCache{
 constructor(store,account,config){this.store=store;this.account=account;this.scope=JSON.stringify([config.clientId,config.tenant,config.siteHost,config.sitePath,config.driveId||'']);this.chain=Promise.resolve();}
 async read(){try{const s=await this.store.get('warm-start-v2');return s?.account===this.account&&s.scope===this.scope&&s.user?.id&&s.drive?.id&&validOps(s.operations)&&Array.isArray(s.catalog?.projects)&&Array.isArray(s.catalog?.categories)&&Array.isArray(s.catalog?.loose)?s:null;}catch{return null;}}
 async write(values){const copy=lightSnapshot(values);this.chain=this.chain.catch(()=>{}).then(async()=>{const next={...copy,account:this.account,scope:this.scope,savedAt:new Date().toISOString()};await this.store.set('warm-start-v2',next);});return this.chain;}
 async savedKind(kind,rows){if(!OPS_KEYS.includes(kind))return;const copy=lightSnapshot(rows);this.chain=this.chain.catch(()=>{}).then(async()=>{const old=await this.read();if(!old)return;old.operations[kind]=copy;await this.store.set('warm-start-v2',old);});return this.chain;}
 async privateRead(owner){try{const s=await this.store.get('warm-private-v1');return s?.account===this.account&&s.scope===this.scope&&s.ownerId===owner&&Array.isArray(s.rows)&&s.rows.every(r=>r.ownerId===owner)?s:null;}catch{return null;}}
 async privateWrite(calendar){await this.store.set('warm-private-v1',{account:this.account,scope:this.scope,ownerId:calendar.ownerId,personId:calendar.personId,rows:structuredClone(calendar.rows),savedAt:new Date().toISOString()});}
}
