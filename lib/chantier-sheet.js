const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const join=a=>a.filter(i=>i.text.trim()).sort((a,b)=>a.x-b.x).map(i=>i.text.trim()).join(' ').replace(/\s+/g,' ').trim();
export function sheetRows(items){const rows=[];for(const i of [...items].filter(i=>i.text.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)){let r=rows.find(r=>Math.abs(r.y-i.y)<2.5);if(!r){r={y:i.y,items:[]};rows.push(r);}r.items.push(i);}return rows;}
export function parseSheet(pages){
 if(!pages.length)throw Error('PDF vide.');const text=pages.flatMap(p=>p.items.map(i=>i.text)).join(' '),match=text.match(/Feuille de chantier du devis\s+N\S*\s*(\d+)\s+le\s+(\d{2}\/\d{2}\/\d{4})/i);
 if(!match)throw Error('Format de feuille de chantier non reconnu. Utilisez le PDF texte exporté de votre logiciel, pas une photo.');
 if(/(?:\d[\d ,.]*\s*(?:€|EUR\b)|Total\s+(?:HT|TTC)|P\.?\s*U\.?\s*H\.?T)/i.test(text))throw Error('Ce document semble contenir des prix. Utilisez la feuille de chantier sans prix.');
 const first=pages[0],rows=sheetRows(first.items),header=rows.find(r=>join(r.items).includes('Feuille de chantier'));
 const top=rows.filter(r=>r.y>header.y+4),left=top.map(r=>join(r.items.filter(i=>i.x<first.width/2))).filter(Boolean),right=top.map(r=>join(r.items.filter(i=>i.x>=first.width/2))).filter(Boolean);
 const addressLabel=left.findIndex(s=>/Adresse chantier/i.test(s)),local=left.slice(addressLabel+1);
 const responsible=rows.map(r=>join(r.items)).find(s=>s.startsWith('Affaire suivie par'))?.replace(/^Affaire suivie par\s*:\s*/,'')||'';
 const entries=[];let current=null;
 for(const page of pages){const q=page.items.find(i=>/^Qt[eé]$/i.test(i.text.trim()));if(!q)throw Error('Colonnes Libellé / Qte non reconnues.');const unit=page.items.find(i=>i.text.trim()==='U'&&Math.abs(i.y-q.y)<3);for(const row of sheetRows(page.items).filter(r=>r.y<q.y-4&&r.y>48)){
   const label=join(row.items.filter(i=>i.x<q.x-5)),heading=label.match(/^(\d+(?:\.\d+)*)\s*-\s*(.+)$/);
   if(heading){current={code:heading[1],title:heading[2],lines:[],quantity:'',unit:''};entries.push(current);}else if(current&&label)current.lines.push(label);
   if(current){const qty=join(row.items.filter(i=>i.x>=q.x-5&&i.x<(unit?.x||q.x+45)-4)),u=join(row.items.filter(i=>i.x>=(unit?.x||q.x+45)-4));if(qty&&/^\d+(?:[,.]\d+)?$/.test(qty)){current.quantity=qty;current.unit=u;}}
 }}
 const tasks=entries.filter(e=>!entries.some(other=>other.code.startsWith(e.code+'.'))).map(e=>({code:e.code,title:e.title,description:e.lines.join('\n'),quantity:e.quantity,unit:e.unit}));
 if(!tasks.length)throw Error('Aucun poste de travaux reconnu.');
 const contactLine=local.find(s=>/^Contact(?: sur place)?\s*:/i.test(s))||'';
 const phoneLine=local.find(s=>/^(?:Tél(?:éphone)?|Tel(?:ephone)?|Portable)\s*:/i.test(s))||'';
 const emailLine=local.find(s=>/^(?:E-?mail|Courriel)\s*:/i.test(s))||'';
 const contact=contactLine.replace(/^Contact(?: sur place)?\s*:\s*/i,''),telephone=phoneLine.replace(/^[^:]+:\s*/,''),email=emailLine.replace(/^[^:]+:\s*/,'');
 return {contact,telephone,email,devis:match[1],sheetDate:match[2],client:right[0]||'',chantier:local[0]||'',adresse:local.slice(1).filter(s=>![contactLine,phoneLine,emailLine].includes(s)).join('\n'),responsable:responsible,tasks,summary:entries.filter(e=>entries.some(o=>o.code.startsWith(e.code+'.'))&&e.lines.length).map(e=>e.title+'\n'+e.lines.join('\n')).join('\n\n')};
}
export function mergeSheet(meta,sheet,source,{replaceInfo=false}={}){
 if(meta.devis&&meta.devis!==sheet.devis)throw Error('Le devis de la feuille ('+sheet.devis+') ne correspond pas à cette affaire ('+meta.devis+').');
 const next=structuredClone(meta);for(const k of ['devis','client','adresse','chantier','responsable'])if(sheet[k]&&(replaceInfo||!next[k]))next[k]=sheet[k];
 next.tasks=[...(next.tasks||[])];for(const task of sheet.tasks){const key=sheet.devis+':'+task.code,idx=next.tasks.findIndex(t=>t.sheetKey===key),previous=idx>=0?next.tasks[idx]:{};const value={...previous,id:previous.id||'sheet-'+sheet.devis+'-'+task.code,sheetKey:key,title:task.code+' - '+task.title,description:[task.description,task.quantity?'Quantité : '+task.quantity+' '+task.unit:''].filter(Boolean).join('\n'),status:previous.status||'À faire',sheetSource:source};if(idx>=0)next.tasks[idx]=value;else next.tasks.push(value);}
 next.sheetImport={...source,devis:sheet.devis,date:sheet.sheetDate,importedAt:new Date().toISOString()};next.sheetSummary=sheet.summary;return next;
}
export async function readSheet(blob){if(blob.size>25*1024*1024)throw Error('PDF limité à 25 Mo.');const pdf=await import('../vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;const doc=await pdf.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;try{if(doc.numPages>100)throw Error('PDF limité à 100 pages.');const pages=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);pages.push({width:p.view[2],items:(await p.getTextContent()).items.filter(i=>i.str).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5]}))});}return parseSheet(pages);}finally{await doc.destroy();}}
export async function importSheet(ctx){
 if(!ctx.isAdmin())throw Error('Import réservé à l’administrateur.');
 const rows=await ctx.g.children(ctx.project.id),folder=rows.find(f=>f.folder&&f.name==='01_FEUILLE_CHANTIER'),files=rows.filter(f=>f.file&&/feuille.*\.pdf$/i.test(f.name));
 if(folder){const walk=async(id,depth=0)=>{if(depth>4)return;for(const f of await ctx.g.children(id)){if(f.folder)await walk(f.id,depth+1);else if(/\.pdf$/i.test(f.name))files.push(f);}};await walk(folder.id);}
 ctx.modal('Reprendre la feuille de chantier',`<p>Choisissez le PDF sans prix déjà enregistré dans cette affaire. Les champs manquants et les postes de travaux seront proposés avant validation.</p><select id="sheetFile">${files.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('')}</select><button id="sheetRead" ${files.length?'':'disabled'}>Lire la feuille</button><p id="sheetState" role="status">${files.length?'':'Aucun PDF trouvé. Ajoutez la feuille dans Documents → 01_FEUILLE_CHANTIER.'}</p><div id="sheetPreview"></div>`);
 document.getElementById('sheetRead').onclick=async()=>{const button=document.getElementById('sheetRead');button.disabled=true;const state=document.getElementById('sheetState'),preview=document.getElementById('sheetPreview');preview.innerHTML='';state.textContent='Lecture du PDF…';try{const f=files.find(f=>f.id===document.getElementById('sheetFile').value),sheet=await readSheet(await ctx.g.bytes(f.id)),source={fileId:f.id,fileName:f.name,eTag:f.eTag||''};mergeSheet(ctx.meta,sheet,source);state.textContent=sheet.tasks.length+' postes reconnus. Les heures vendues ne sont pas déduites des quantités.';
 preview.innerHTML=`<dl>${['devis','client','adresse','chantier','responsable'].map(k=>'<dt>'+esc(k)+'</dt><dd>'+esc(sheet[k]||'Non renseigné')+'</dd>').join('')}</dl><details><summary>Voir les ${sheet.tasks.length} postes</summary>${sheet.tasks.map(t=>'<p><b>'+esc(t.code+' - '+t.title)+'</b><br>'+esc(t.quantity+' '+t.unit)+'</p>').join('')}</details><label><input id="sheetReplace" type="checkbox"> Remplacer aussi les informations communes déjà renseignées par celles de la feuille</label><p>Les postes déjà importés seront actualisés en conservant leur avancement. Les ajouts manuels et les observations seront conservés.</p><button id="sheetConfirm">Valider la reprise</button>`;
 document.getElementById('sheetConfirm').onclick=async()=>{if(!ctx.isAdmin())return;const b=document.getElementById('sheetConfirm');b.disabled=true;try{await ctx.save(mergeSheet(ctx.meta,sheet,source,{replaceInfo:document.getElementById('sheetReplace').checked}));await ctx.done();}catch(e){state.textContent='Reprise non terminée : '+e.message;b.disabled=false;}};
 }catch(e){state.textContent=e.message;}finally{button.disabled=false;}};
 if(files.length===1)await document.getElementById('sheetRead').onclick();
}
