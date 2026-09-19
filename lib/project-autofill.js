import {readSheet} from './chantier-sheet.js';
export function fillMissingCoordinates(meta,sheet,source){
 if(!meta.devis||String(meta.devis).replace(/^0+/,'')!==String(sheet.devis).replace(/^0+/,''))throw Error('Le numéro du devis de la feuille ne correspond pas au dossier.');
 const next=structuredClone(meta);let changed=false;
 for(const key of ['client','adresse','contact','telephone','email'])if(!String(next[key]||'').trim()&&sheet[key]){next[key]=sheet[key];changed=true;}
 if(!changed)return null;
 next.coordinateSource={...source,importedAt:new Date().toISOString()};return next;
}
export async function autoFillCoordinates(g,project,meta,read=readSheet){
 if(meta.client&&meta.adresse||!meta.devis)return null;
 const rows=await g.children(project.id),folder=rows.find(f=>f.folder&&f.name==='01_FEUILLE_CHANTIER');
 const files=rows.filter(f=>!f.folder&&/feuille.*\.pdf$/i.test(f.name));
 if(folder)files.push(...(await g.children(folder.id)).filter(f=>!f.folder&&/\.pdf$/i.test(f.name)));
 // Several revisions require a deliberate choice through the existing PDF import.
 if(files.length!==1)return null;
 const file=files[0],sheet=await read(await g.bytes(file.id));
 return fillMissingCoordinates(meta,sheet,{fileId:file.id,fileName:file.name,eTag:file.eTag||''});
}
