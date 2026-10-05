// No tokens or shared-account fallback: each snapshot belongs to one account and library.
export const OPS_KEYS=['clients','people','interventions','visits','events','closures','projectTracking'];
export const validOps=data=>!!data&&OPS_KEYS.every(k=>Array.isArray(data[k]));
export class WarmCache{
 constructor(store,account,config){this.store=store;this.account=account;this.scope=JSON.stringify([config.clientId,config.tenant,config.siteHost,config.sitePath,config.driveId||'']);this.chain=Promise.resolve();}
 async read(){try{const s=await this.store.get('warm-start-v1');return s?.account===this.account&&s.scope===this.scope&&s.user?.id&&s.drive?.id&&validOps(s.operations)&&Array.isArray(s.catalog?.projects)&&Array.isArray(s.catalog?.categories)&&Array.isArray(s.catalog?.loose)?s:null;}catch{return null;}}
 async write(values){const copy=structuredClone(values);this.chain=this.chain.catch(()=>{}).then(async()=>{const old=await this.read();const next={...old,...copy,account:this.account,scope:this.scope,savedAt:new Date().toISOString()};await this.store.set('warm-start-v1',next);});return this.chain;}
 async savedKind(kind,rows){if(!OPS_KEYS.includes(kind))return;const copy=structuredClone(rows);this.chain=this.chain.catch(()=>{}).then(async()=>{const old=await this.read();if(!old)return;old.operations[kind]=copy;await this.store.set('warm-start-v1',old);});return this.chain;}
 async privateRead(owner){try{const s=await this.store.get('warm-private-v1');return s?.account===this.account&&s.scope===this.scope&&s.ownerId===owner&&Array.isArray(s.rows)&&s.rows.every(r=>r.ownerId===owner)?s:null;}catch{return null;}}
 async privateWrite(calendar){await this.store.set('warm-private-v1',{account:this.account,scope:this.scope,ownerId:calendar.ownerId,personId:calendar.personId,rows:structuredClone(calendar.rows),savedAt:new Date().toISOString()});}
}
