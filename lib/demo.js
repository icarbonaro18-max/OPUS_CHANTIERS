/* Deliberately fictional local demo. No credentials; no Microsoft Graph requests. */
import {Graph,LocalStore,uid,CloudError} from './cloud.js';
export class DemoGraph extends Graph {
 constructor(){super(async()=>{throw Error('No Microsoft token in demo');});this.db=new LocalStore('demo-graph');this.items=new Map();this.drive={id:'demo-drive'};this.site={id:'demo-site'};}
 async init(){for(const {value:i}of await this.db.all('item:'))this.items.set(i.id,i);
  if(!this.items.size){const cats=[];for(const n of ['01 - A PREPARER','02 - EN COURS','03 - A CONTROLER','04 - TERMINES','99 - ARCHIVES'])cats.push(await this.folder('root',n));
   const a=await this.folder(cats[1].id,'001169 - Chantier de démonstration');await this.folder(cats[0].id,'001204 - Bureaux de démonstration');
   for(const n of ['01_FEUILLE_CHANTIER','02_RAPPORT_CONTROLE','03_COMMANDES','06_PHOTOS'])await this.folder(a.id,n);
   const d=await this.folder(a.id,'_OPUS');const f=await this.folder(d.id,'fiche');const rev=uid();
   await this.upload(f.id,`r_${rev}__p_root.json`,new Blob([JSON.stringify({format:'OPUS-CLOUD-3',revision:rev,parents:[],createdAt:new Date().toISOString(),author:{id:'demo',name:'Bureau · démonstration'},payload:{name:'Chantier de démonstration',client:'Client exemple — données fictives',devis:'001169',adresse:'Adresse de démonstration · Paris',chantier:'Mise en sécurité électrique',contact:'Contact de démonstration',telephone:'',email:'',responsable:'Bureau OPUS · démonstration',notes:'Données fictives pour tester le fonctionnement. Aucune observation réglementaire ne provient ici d’un rapport réel.',tasks:[{title:'Installation et contrôle des BAES',description:'Exemple de poste de travaux.',status:'À faire'},{title:'Repérage du tableau électrique',description:'Exemple de poste de travaux.',status:'En cours'}],observations:[]}})],{type:'application/json'}));
  }return this;
 }
 async save(i){this.items.set(i.id,i);await this.db.set('item:'+i.id,i);return i;}
 async children(id='root'){return [...this.items.values()].filter(i=>i.parentReference.id===id);}
 async named(parent,name){return [...this.items.values()].find(i=>i.parentReference.id===parent&&i.name===name)||null;}
 async folder(parent,name){const old=await this.named(parent,name);if(old)return old;return this.save({id:uid(),name,folder:{},parentReference:{id:parent},createdDateTime:new Date().toISOString(),lastModifiedDateTime:new Date().toISOString(),eTag:'demo'});}
 async item(id){const i=this.items.get(id);if(!i)throw new CloudError('Élément absent',404);return i;}
 async bytes(id){return (await this.item(id)).blob;}
 async json(id){return JSON.parse(await(await this.bytes(id)).text());}
 async writeJson(parent,name,value){const old=await this.named(parent,name);const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});if(old){old.blob=blob;old.size=blob.size;old.lastModifiedDateTime=new Date().toISOString();return this.save(old);}return this.upload(parent,name,blob);}
 async upload(parent,name,blob,onProgress=()=>{},immutable=false){let n=name;if(await this.named(parent,name)){if(immutable)throw new CloudError('Déjà présent',409);n=uid().slice(0,5)+'_'+name;}onProgress(100);return this.save({id:uid(),name:n,file:{mimeType:blob.type},size:blob.size,blob,parentReference:{id:parent},createdDateTime:new Date().toISOString(),lastModifiedDateTime:new Date().toISOString(),createdBy:{user:{displayName:'Compte de démonstration'}},eTag:uid()});}
 async moveProject(p,cat){const i=await this.item(p.id);i.parentReference.id=cat.id;return this.save(i);}
}
