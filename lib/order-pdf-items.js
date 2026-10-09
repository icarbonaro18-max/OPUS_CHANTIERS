import {cleanOrderItems} from './order-materials.js';
const join=items=>items.sort((a,b)=>a.x-b.x).map(i=>i.text.trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
export function parseOpusOrder(pages){
 const full=pages.flatMap(p=>p.items.map(i=>i.text)).join(' ');
 if(!/BON DE COMMANDE|BON INTERNE\s*[—–-]\s*D[ÉE]P[ÔO]T/.test(full)||! /OPUS ELEC/.test(full))throw Error('Ce PDF n’est pas un bon OPUS lisible. Faites reprendre ses lignes dans Bons de commande.');
 const items=[];let current=null,supplier='',number='';
 for(const page of pages){const rows=[];for(const i of [...page.items].sort((a,b)=>b.y-a.y||a.x-b.x)){let row=rows.find(r=>Math.abs(r.y-i.y)<2);if(!row){row={y:i.y,items:[]};rows.push(row);}row.items.push(i);}
 const header=rows.find(r=>/QTÉ\s*\/\s*UNITÉ/.test(join(r.items)));if(!header)throw Error('Colonnes matériel non reconnues.');
 if(!number){const title=rows.find(r=>r.y>header.y&&join(r.items).includes(' · '));if(title){[supplier,...number]=join(title.items).split(' · ');number=number.join(' · ');}}
 for(const row of rows.filter(r=>r.y<header.y-3&&r.y>page.height-280*72/25.4)){
  const ref=join(row.items.filter(i=>i.x<58*72/25.4)),desc=join(row.items.filter(i=>i.x>=58*72/25.4&&i.x<162*72/25.4)),qty=join(row.items.filter(i=>i.x>=162*72/25.4));
  const match=qty.match(/^(\d+(?:[.,]\d+)?)(?:\s+(.*))?$/);
  if(match){current={reference:ref==='Non précisée'?'':ref,description:desc,quantity:match[1],unit:match[2]||''};items.push(current);}
  else if(current){if(ref&&ref!=='Non précisée')current.reference+=' '+ref;if(desc)current.description+=' '+desc;if(qty)current.unit+=' '+qty;}
  else if(ref||desc||qty)throw Error('Ligne de matériel incomplète.');
 }}
 if(!items.length)throw Error('Aucune ligne matériel lisible.');return {supplier,number,items:cleanOrderItems(items)};
}
export async function readOpusOrderPDF(blob){
 if(blob.size>20*1024*1024)throw Error('Bon PDF trop volumineux.');
 const pdfjs=await import('../vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())});let pdf;
 try{pdf=await task.promise;if(pdf.numPages>20)throw Error('Bon limité à 20 pages pour la reprise automatique.');const pages=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),v=p.getViewport({scale:1}),content=await p.getTextContent();pages.push({width:v.width,height:v.height,items:content.items.filter(i=>typeof i.str==='string').map(i=>({text:i.str,x:i.transform[4],y:i.transform[5]}))});p.cleanup();}return parseOpusOrder(pages);}finally{await task.destroy();}
}
